"use server";

import { createClient } from "@/lib/supabase/server";
import { getTtsProvider, generateAudioHash, type TtsOptions } from "@/lib/tts/tts";
import { getGoogleAccessTokenForUser, uploadAudioFileToDrive } from "@/lib/integrations/google";
import { getCurrentUser } from "@/lib/queries/user";

export interface GenerateCardAudioParams {
  flashcardId: string;
  side: "front" | "back";
  text: string;
  providerId: string; // "openai" | "google-cloud"
  voiceId: string;
  language: string;
  options?: TtsOptions;
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

  const cleanText = text.trim();
  if (!cleanText) return { success: false, reason: "Text is empty" };

  const supabase = await createClient();

  // 1. Get Google Drive connection info
  const { data: connection } = await supabase
    .from("user_google_drive_connections")
    .select("connection_status")
    .eq("user_id", user.id)
    .single();

  if (!connection || connection.connection_status !== "connected") {
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
      return { error: refError.message };
    }

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
    return { error: "quota_exceeded" };
  }

  // 5. Atomic credit deduction
  const { error: deductError } = await supabase.rpc("increment_audio_usage", {
    p_user_id: user.id,
    p_chars: charCount
  });

  if (deductError) {
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
    
    // Estimate duration: Average bit rate for TTS is ~32kbps (4000 bytes/sec) or standard MP3 bit rate.
    // Let's use a standard estimate: 128kbps = 16000 bytes/sec. Let's do a conservative 32kbps = 4000 bytes/sec.
    // Or we can assume duration = characters / 15 characters per second as a fallback.
    durationSeconds = parseFloat((fileSize / 4000).toFixed(2));
  } catch (ttsErr: unknown) {
    const errorMsg = ttsErr instanceof Error ? ttsErr.message : String(ttsErr);
    // Rollback credit deduction on failure
    await supabase.rpc("decrement_audio_usage", {
      p_user_id: user.id,
      p_chars: charCount
    });
    return { error: `TTS Generation failed: ${errorMsg}` };
  }

  // 7. Get access token and upload to Google Drive
  let fileId = "";
  try {
    const accessToken = await getGoogleAccessTokenForUser(user.id);
    const uploadRes = await uploadAudioFileToDrive(user.id, accessToken, `${audioHash}.mp3`, audioBuffer);
    fileId = uploadRes.fileId;
  } catch (uploadErr: unknown) {
    const errorMsg = uploadErr instanceof Error ? uploadErr.message : String(uploadErr);
    // Rollback credit deduction
    await supabase.rpc("decrement_audio_usage", {
      p_user_id: user.id,
      p_chars: charCount
    });

    if (errorMsg === "GOOGLE_DRIVE_QUOTA_EXCEEDED") {
      // Mark background jobs as quota_exceeded
      return { error: "quota_exceeded" };
    }

    return { error: `Google Drive upload failed: ${errorMsg}` };
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
    // Delete file from Google Drive if saving metadata fails?
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

  if (!existingRef) {
    const normalized = filename.trim().toLowerCase().normalize("NFC");
    const { error: refError } = await supabase
      .from("card_audios")
      .insert({
        flashcard_id: flashcardId,
        side,
        audio_file_id: fileRecordId,
        original_filename: filename,
        normalized_filename: normalized
      });

    if (refError) {
      return { error: `Failed to create card audio reference: ${refError.message}` };
    }
  }

  return { success: true, normalizedName: filename.trim().normalize("NFC") };
}
