"use server";

import { createClient } from "@/lib/supabase/server";
import { getTtsProvider, generateAudioHash, type TtsOptions } from "@/lib/tts/tts";
import { getGoogleAccessTokenForUser, uploadAudioFileToDrive, waitForDriveFileReady, deleteAudioFileFromDrive } from "@/lib/integrations/google";
import { getCurrentUser } from "@/lib/queries/user";
import type { CardAudio } from "@/types";
import * as cheerio from "cheerio";
import type { SupabaseClient } from "@supabase/supabase-js";
import { preprocessTextForAudio } from "@/lib/tts/preprocessor";

export interface GenerateCardAudioParams {
  flashcardId: string;
  side: "front" | "back";
  text: string;
  providerId: string; // "openai" only (Google Cloud TTS disabled)
  voiceId: string;
  language: string;
  options?: TtsOptions;
  sourceSide?: "front" | "back" | "custom";
}

async function appendAudioSpanToCardHtml(
  supabase: SupabaseClient,
  flashcardId: string,
  side: "front" | "back",
  cardAudioId: string
) {
  const { data: card } = await supabase
    .from("flashcards")
    .select("front, back")
    .eq("id", flashcardId)
    .single();

  if (card) {
    const targetHtml = side === "front" ? card.front : card.back;
    
    // Check if already contains the audio span
    if (targetHtml.includes(`data-audio-id="${cardAudioId}"`)) {
      return;
    }

    const newSpan = `<span data-type="audio" data-audio-id="${cardAudioId}"></span>`;
    
    let updatedHtml = targetHtml;
    if (targetHtml.endsWith("</p>")) {
      updatedHtml = targetHtml.replace(/<\/p>$/, `${newSpan}</p>`);
    } else {
      updatedHtml = `${targetHtml}${newSpan}`;
    }

    // Save to flashcards
    await supabase
      .from("flashcards")
      .update({ [side]: updatedHtml })
      .eq("id", flashcardId);

    // Sync to study_cards if it exists
    await supabase
      .from("study_cards")
      .update({ [side]: updatedHtml })
      .eq("source_flashcard_id", flashcardId);
  }
}

/**
 * Generates speech for a specific flashcard side and uploads it to the user's Google Drive.
 * Implements Content-Addressable Storage (CAS) caching, atomic credits, and failure rollback.
 */
export async function generateCardAudioAction({
  flashcardId,
  side,
  text,
  providerId,
  voiceId,
  language,
  options,
  sourceSide
}: GenerateCardAudioParams) {
  const user = await getCurrentUser();
  if (!user) return { error: "errors.auth.not_authenticated" };

  void providerId;

  const cleanText = await preprocessTextForAudio(text, language);
  if (!cleanText) return { success: false, reason: "Text is empty" };

  // Enforce OpenAI TTS only
  const effectiveProviderId = "openai";

  console.log("[Audio] generateCardAudioAction: starting", { 
    flashcardId, 
    side, 
    provider: "openai-tts", 
    voice: voiceId, 
    textLength: cleanText.length 
  });

  const supabase = await createClient();

  // 1. Get Google Drive connection info
  const { data: connection } = await supabase
    .from("user_google_drive_connections")
    .select("connection_status")
    .eq("user_id", user.id)
    .single();

  if (!connection || connection.connection_status !== "connected") {
    console.error("[Audio Error] generateCardAudioAction: Drive not connected. Status:", connection?.connection_status ?? "no record");
    return { error: "Google Drive is not connected or requires reconnection." };
  }

  // 2. Generate cache hash for Content-Addressable Storage (CAS) check
  const audioHash = generateAudioHash(cleanText, effectiveProviderId, voiceId, language, options);

  // 3. Cache Check (Deduplication)
  const { data: existingFile } = await supabase
    .from("audio_files")
    .select("id")
    .eq("user_id", user.id)
    .eq("audio_hash", audioHash)
    .single();

  if (existingFile) {
    // Cache HIT: Link this card side to the existing audio file
    console.log("[Audio] generateCardAudioAction: CAS cache HIT", { flashcardId, side, existingFileId: existingFile.id });
    const { data: newCardAudio, error: refError } = await supabase
      .from("card_audios")
      .insert({
        flashcard_id: flashcardId,
        side,
        audio_file_id: existingFile.id,
        original_filename: `${audioHash}.mp3`,
        normalized_filename: `${audioHash}.mp3`,
        source_type: sourceSide || side
      })
      .select("id")
      .single();

    if (refError || !newCardAudio) {
      console.error("[Audio Error] generateCardAudioAction: cache hit reference mapping failed:", refError);
      return { error: refError?.message || "Failed to create card audio reference" };
    }

    await appendAudioSpanToCardHtml(supabase, flashcardId, side, newCardAudio.id);

    console.log("[Audio]", {
      cardId: flashcardId,
      generated: false,
      uploaded: false,
      driveFileId: null,
      audioFileId: existingFile.id,
      mapped: true
    });

    return { success: true, cached: true, audioFileId: existingFile.id };
  }

  // Cache MISS: Generate audio, deduct credits, and upload
  const charCount = cleanText.length;
  console.log("[Audio] generateCardAudioAction: CAS cache MISS — will generate TTS", { flashcardId, side, charCount });

  // 4. Idempotency Key Formulation
  const idempotencyKey = `${flashcardId}:${side}:${voiceId}`;

  // 5. Atomic Credit Reservation
  const { data: reserved, error: reserveError } = await supabase.rpc("reserve_audio_credits", {
    p_user_id: user.id,
    p_chars: charCount,
    p_idempotency_key: idempotencyKey
  });

  if (reserveError || !reserved) {
    console.error("[Audio Error] Character credits reservation failed:", reserveError);
    return { error: reserveError ? reserveError.message : "quota_exceeded" };
  }

  let audioBuffer: Buffer;
  let durationSeconds = 0;
  let fileSize = 0;

  // 6. Generate TTS Audio
  try {
    const tts = getTtsProvider(effectiveProviderId);
    const ttsRes = await tts.generateAudio(cleanText, voiceId, language, options);
    audioBuffer = ttsRes.audioBuffer;
    fileSize = audioBuffer.length;
    
    // Estimate duration
    durationSeconds = parseFloat((fileSize / 4000).toFixed(2));

    console.log("[Audio]", {
      cardId: flashcardId,
      generated: true,
      uploaded: false,
      driveFileId: null,
      audioFileId: null,
      mapped: false
    });
  } catch (ttsErr: unknown) {
    console.error("[Audio Error] TTS Generation failed:", ttsErr);
    // Release credit reservation on failure
    await supabase.rpc("release_audio_credits", {
      p_user_id: user.id,
      p_idempotency_key: idempotencyKey
    });
    return { error: `TTS Generation failed: ${ttsErr instanceof Error ? ttsErr.message : String(ttsErr)}` };
  }

  // 7. Get access token and upload to Google Drive
  let fileId = "";
  let accessToken = "";
  try {
    accessToken = await getGoogleAccessTokenForUser(user.id);
    const uploadRes = await uploadAudioFileToDrive(user.id, accessToken, `${audioHash}.mp3`, audioBuffer);
    fileId = uploadRes.fileId;

    console.log("[Audio]", {
      cardId: flashcardId,
      generated: true,
      uploaded: true,
      driveFileId: fileId,
      audioFileId: null,
      mapped: false
    });
  } catch (uploadErr: unknown) {
    console.error("[Audio Error] Google Drive upload failed:", uploadErr);
    // Release credit reservation
    await supabase.rpc("release_audio_credits", {
      p_user_id: user.id,
      p_idempotency_key: idempotencyKey
    });

    if (uploadErr instanceof Error && uploadErr.message === "GOOGLE_DRIVE_QUOTA_EXCEEDED") {
      return { error: "quota_exceeded" };
    }

    return { error: `Google Drive upload failed: ${uploadErr instanceof Error ? uploadErr.message : String(uploadErr)}` };
  }

  // 8. Google Drive File Verification Check (Step 3)
  const isReady = await waitForDriveFileReady(accessToken, fileId, 3, 500);
  if (!isReady) {
    console.error(`[Audio Error] Google Drive file ${fileId} not ready after upload.`);
    try {
      await deleteAudioFileFromDrive(accessToken, fileId);
    } catch (cleanupErr) {
      console.error("[Audio Error] Failed to delete file on readiness failure:", cleanupErr);
    }
    await supabase.rpc("release_audio_credits", {
      p_user_id: user.id,
      p_idempotency_key: idempotencyKey
    });
    return { error: "Google Drive upload verification failed (file not accessible)." };
  }

  // 9. Save audio file metadata (Step 2 Rollback on DB failure)
  const { data: newFile, error: fileSaveError } = await supabase
    .from("audio_files")
    .insert({
      user_id: user.id,
      audio_hash: audioHash,
      provider: "google-drive",
      file_id: fileId,
      voice_id: voiceId,
      language: language,
      file_size: fileSize,
      duration_seconds: durationSeconds
    })
    .select()
    .single();

  if (fileSaveError || !newFile) {
    console.error("[Audio Error] Failed to save audio file metadata:", fileSaveError);
    // Cleanup Drive file and release credits
    try {
      await deleteAudioFileFromDrive(accessToken, fileId);
    } catch (cleanupErr) {
      console.error("[Audio Error] Failed to delete file on DB metadata save failure:", cleanupErr);
    }
    await supabase.rpc("release_audio_credits", {
      p_user_id: user.id,
      p_idempotency_key: idempotencyKey
    });
    return { error: `Failed to save audio file metadata: ${fileSaveError?.message}` };
  }

  // 10. Insert card audio reference (Step 2 Rollback on DB failure)
  const { data: newCardAudio, error: refError } = await supabase
    .from("card_audios")
    .insert({
      flashcard_id: flashcardId,
      side,
      audio_file_id: newFile.id,
      original_filename: `${audioHash}.mp3`,
      normalized_filename: `${audioHash}.mp3`,
      source_type: sourceSide || side
    })
    .select("id")
    .single();

  if (refError || !newCardAudio) {
    console.error("[Audio Error] Failed to create card audio reference:", refError);
    // Cleanup Drive file, delete audio_files record, and release credits
    await supabase.from("audio_files").delete().eq("id", newFile.id);
    try {
      await deleteAudioFileFromDrive(accessToken, fileId);
    } catch (cleanupErr) {
      console.error("[Audio Error] Failed to delete file on DB mapping failure:", cleanupErr);
    }
    await supabase.rpc("release_audio_credits", {
      p_user_id: user.id,
      p_idempotency_key: idempotencyKey
    });
    return { error: `Failed to create card audio reference: ${refError?.message || "Unknown error"}` };
  }

  await appendAudioSpanToCardHtml(supabase, flashcardId, side, newCardAudio.id);

  // 11. Commit Audio Credits (Move from reserved to committed)
  const { error: commitError } = await supabase.rpc("commit_audio_credits", {
    p_user_id: user.id,
    p_idempotency_key: idempotencyKey
  });

  if (commitError) {
    console.error("[Audio Error] Failed to commit audio credits reservation:", commitError);
  }

  // 12. Audit in usage history
  await supabase.from("audio_usage_history").insert({
    user_id: user.id,
    characters_consumed: charCount,
    action_type: "tts_generation",
    source_details: {
      flashcard_id: flashcardId,
      side,
      provider: "openai-tts",
      voice: voiceId,
      language
    }
  });

  console.log("[Audio]", {
    cardId: flashcardId,
    generated: true,
    uploaded: true,
    driveFileId: fileId,
    audioFileId: newFile.id,
    mapped: true,
    provider: "openai-tts"
  });

  return { success: true, cached: false, audioFileId: newFile.id };
}

export interface MapGoogleDriveAudioParams {
  flashcardId: string;
  side: "front" | "back";
  fileId: string;
  filename: string;
  fileSize?: number;
}

/**
 * Maps a manually selected Google Drive file to a flashcard side.
 */
export async function mapGoogleDriveAudioAction({
  flashcardId,
  side,
  fileId,
  filename,
  fileSize,
}: MapGoogleDriveAudioParams) {
  const user = await getCurrentUser();
  if (!user) return { error: "errors.auth.not_authenticated" };

  const supabase = await createClient();

  // 1. Generate unique hash for this manual file
  const audioHash = `manual-${fileId}`;

  // 2. Check if this file metadata is already in audio_files
  const { data: existingFile } = await supabase
    .from("audio_files")
    .select("id")
    .eq("user_id", user.id)
    .eq("audio_hash", audioHash)
    .single();

  let fileRecordId = existingFile?.id;

  if (!fileRecordId) {
    // Insert into audio_files
    const { data: newFile, error: fileSaveError } = await supabase
      .from("audio_files")
      .insert({
        user_id: user.id,
        audio_hash: audioHash,
        provider: "google-drive",
        file_id: fileId,
        voice_id: "manual",
        language: "manual",
        file_size: fileSize || null,
        duration_seconds: null
      })
      .select()
      .single();

    if (fileSaveError || !newFile) {
      console.error("[Audio Error] Manual mapping failed to save audio file metadata:", fileSaveError);
      return { error: `Failed to save audio file metadata: ${fileSaveError?.message}` };
    }
    fileRecordId = newFile.id;
  }

  // 3. Check if card_audios record already exists
  const { data: existingRef } = await supabase
    .from("card_audios")
    .select("id")
    .eq("flashcard_id", flashcardId)
    .eq("side", side)
    .eq("audio_file_id", fileRecordId)
    .single();

  let returnedRef = null;

  if (!existingRef) {
    const normalized = filename.trim().toLowerCase().normalize("NFC");
    const { data: insertedRef, error: refError } = await supabase
      .from("card_audios")
      .insert({
        flashcard_id: flashcardId,
        side,
        audio_file_id: fileRecordId,
        original_filename: filename,
        normalized_filename: normalized
      })
      .select(`
        id,
        side,
        original_filename,
        normalized_filename,
        audio_files (
          file_id,
          provider,
          voice_id,
          language,
          duration_seconds
        )
      `)
      .single();

    if (refError) {
      console.error("[Audio Error] Manual mapping failed to create card audio reference:", refError);
      return { error: `Failed to create card audio reference: ${refError.message}` };
    }
    returnedRef = insertedRef;
  } else {
    // If it exists, fetch it so we can return the joined details
    const { data: fetchedRef } = await supabase
      .from("card_audios")
      .select(`
        id,
        side,
        original_filename,
        normalized_filename,
        audio_files (
          file_id,
          provider,
          voice_id,
          language,
          duration_seconds
        )
      `)
      .eq("id", existingRef.id)
      .single();
    returnedRef = fetchedRef;
  }

  console.log("[Audio]", {
    cardId: flashcardId,
    generated: false,
    uploaded: true,
    driveFileId: fileId,
    audioFileId: fileRecordId,
    mapped: true,
  });

  return { 
    success: true, 
    normalizedName: filename.trim().normalize("NFC"),
    audioRef: returnedRef as unknown as CardAudio
  };
}

/**
 * Unmaps an audio reference from a flashcard side.
 */
export async function unmapCardAudioAction(cardAudioId: string) {
  const user = await getCurrentUser();
  if (!user) return { error: "errors.auth.not_authenticated" };

  const supabase = await createClient();

  // Verify ownership of the deck/card that contains this card_audio
  const { data: audioRef, error: fetchError } = await supabase
    .from("card_audios")
    .select(`
      id,
      flashcard_id,
      flashcards (
        deck_id,
        decks (
          user_id
        )
      )
    `)
    .eq("id", cardAudioId)
    .single();

  if (fetchError || !audioRef) {
    return { error: "errors.audio.ref_not_found" };
  }

  const flashcards = audioRef.flashcards as unknown as {
    deck_id: string;
    decks: {
      user_id: string;
    } | null;
  } | null;
  const ownerId = flashcards?.decks?.user_id;
  if (ownerId !== user.id) {
    return { error: "errors.auth.unauthorized" };
  }

  const { error: deleteError } = await supabase
    .from("card_audios")
    .delete()
    .eq("id", cardAudioId);

  if (deleteError) {
    console.error("[Audio Error] unmapCardAudioAction failed:", deleteError);
    return { error: deleteError.message };
  }

  return { success: true };
}

function extractAudioIdsFromHtml(html: string): string[] {
  if (!html) return [];
  const $ = cheerio.load(html);
  const ids: string[] = [];
  $('span[data-type="audio"]').each((_, elem) => {
    const id = $(elem).attr("data-audio-id");
    if (id) {
      ids.push(id);
    }
  });
  return ids;
}

export async function cleanOrphanedCardAudios(
  supabase: SupabaseClient,
  flashcardId: string,
  frontHtml: string,
  backHtml: string,
  deletedAudioIds?: string[]
) {
  // 1. If explicit deleted IDs are provided, delete them immediately
  if (deletedAudioIds && deletedAudioIds.length > 0) {
    await supabase
      .from("card_audios")
      .delete()
      .eq("flashcard_id", flashcardId)
      .in("id", deletedAudioIds);
  }

  // 2. Parse all referenced IDs in the front and back HTML
  const frontIds = extractAudioIdsFromHtml(frontHtml);
  const backIds = extractAudioIdsFromHtml(backHtml);
  const referencedIds = [...frontIds, ...backIds];

  // 3. Delete any card_audios associated with this flashcard that are NOT in the referenced list
  if (referencedIds.length > 0) {
    await supabase
      .from("card_audios")
      .delete()
      .eq("flashcard_id", flashcardId)
      .not("id", "in", `(${referencedIds.join(",")})`);
  } else {
    // If no audio is referenced, delete all audio references for this card
    await supabase
      .from("card_audios")
      .delete()
      .eq("flashcard_id", flashcardId);
  }

  // 4. Update side for the remaining referenced audios
  if (frontIds.length > 0) {
    await supabase
      .from("card_audios")
      .update({ side: "front" })
      .eq("flashcard_id", flashcardId)
      .in("id", frontIds);
  }
  if (backIds.length > 0) {
    await supabase
      .from("card_audios")
      .update({ side: "back" })
      .eq("flashcard_id", flashcardId)
      .in("id", backIds);
  }
}

