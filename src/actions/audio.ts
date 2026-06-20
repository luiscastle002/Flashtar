"use server";

import { createClient } from "@/lib/supabase/server";
import { getTtsProvider, generateAudioHash, type TtsOptions } from "@/lib/tts/tts";
import { getGoogleAccessTokenForUser, uploadAudioFileToDrive } from "@/lib/integrations/google";
import { getCurrentUser } from "@/lib/queries/user";
import type { CardAudio } from "@/types";

export interface GenerateCardAudioParams {
  flashcardId: string;
  side: "front" | "back";
  text: string;
  providerId: string; // "openai" | "google-cloud"
  voiceId: string;
  language: string;
  options?: TtsOptions;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
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
  options
}: GenerateCardAudioParams) {
  const user = await getCurrentUser();
  if (!user) return { error: "errors.auth.not_authenticated" };

  const cleanText = stripHtml(text);
  if (!cleanText) return { success: false, reason: "Text is empty" };

  const supabase = await createClient();

  // 1. Get Google Drive connection info
  const { data: connection } = await supabase
    .from("user_google_drive_connections")
    .select("connection_status")
    .eq("user_id", user.id)
    .single();

  if (!connection || connection.connection_status !== "connected") {
    console.error("[Audio Error] Google Drive is not connected or status is not connected.");
    return { error: "Google Drive is not connected or requires reconnection." };
  }

  // 2. Generate cache hash for Content-Addressable Storage (CAS) check
  const audioHash = generateAudioHash(cleanText, providerId, voiceId, language, options);

  // 3. Cache Check (Deduplication)
  const { data: existingFile } = await supabase
    .from("audio_files")
    .select("id")
    .eq("user_id", user.id)
    .eq("audio_hash", audioHash)
    .single();

  if (existingFile) {
    // Cache HIT: Link this card side to the existing audio file
    const { error: refError } = await supabase
      .from("card_audios")
      .insert({
        flashcard_id: flashcardId,
        side,
        audio_file_id: existingFile.id,
        original_filename: `${audioHash}.mp3`,
        normalized_filename: `${audioHash}.mp3`
      });

    if (refError) {
      console.error("[Audio Error] Cache hit reference mapping failed:", refError);
      return { error: refError.message };
    }

    console.log("[Audio]", {
      cardId: flashcardId,
      generated: false,
      uploaded: false,
      driveFileId: null,
      audioFileId: existingFile.id,
      mapped: true
    });

    return { success: true, cached: true };
  }

  // Cache MISS: Generate audio, deduct credits, and upload
  const charCount = cleanText.length;

  // 4. JIT Quota Credit Check
  const { data: usage } = await supabase
    .from("audio_usage")
    .select("used_this_month, monthly_limit")
    .eq("user_id", user.id)
    .single();

  if (usage && usage.used_this_month + charCount > usage.monthly_limit) {
    console.error("[Audio Error] Character credits quota exceeded.");
    return { error: "quota_exceeded" };
  }

  // 5. Atomic credit deduction
  const { error: deductError } = await supabase.rpc("increment_audio_usage", {
    p_user_id: user.id,
    p_chars: charCount
  });

  if (deductError) {
    console.error("[Audio Error] Character credits deduction failed:", deductError);
    return { error: `Failed to deduct character credits: ${deductError.message}` };
  }

  let audioBuffer: Buffer;
  let durationSeconds = 0;
  let fileSize = 0;

  // 6. Generate TTS Audio
  try {
    const tts = getTtsProvider(providerId);
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
    // Rollback credit deduction on failure
    await supabase.rpc("decrement_audio_usage", {
      p_user_id: user.id,
      p_chars: charCount
    });
    return { error: `TTS Generation failed: ${ttsErr instanceof Error ? ttsErr.message : String(ttsErr)}` };
  }

  // 7. Get access token and upload to Google Drive
  let fileId = "";
  try {
    const accessToken = await getGoogleAccessTokenForUser(user.id);
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
    // Rollback credit deduction
    await supabase.rpc("decrement_audio_usage", {
      p_user_id: user.id,
      p_chars: charCount
    });

    if (uploadErr instanceof Error && uploadErr.message === "GOOGLE_DRIVE_QUOTA_EXCEEDED") {
      return { error: "quota_exceeded" };
    }

    return { error: `Google Drive upload failed: ${uploadErr instanceof Error ? uploadErr.message : String(uploadErr)}` };
  }

  // 8. Save audio file metadata
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
    // Rollback credits anyway
    await supabase.rpc("decrement_audio_usage", {
      p_user_id: user.id,
      p_chars: charCount
    });
    return { error: `Failed to save audio file metadata: ${fileSaveError?.message}` };
  }

  // 9. Insert card audio reference
  const { error: refError } = await supabase
    .from("card_audios")
    .insert({
      flashcard_id: flashcardId,
      side,
      audio_file_id: newFile.id,
      original_filename: `${audioHash}.mp3`,
      normalized_filename: `${audioHash}.mp3`
    });

  if (refError) {
    console.error("[Audio Error] Failed to create card audio reference:", refError);
    return { error: `Failed to create card audio reference: ${refError.message}` };
  }

  // 10. Audit in usage history
  await supabase.from("audio_usage_history").insert({
    user_id: user.id,
    characters_consumed: charCount,
    action_type: "tts_generation",
    source_details: {
      flashcard_id: flashcardId,
      side,
      provider: providerId,
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
    mapped: true
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
