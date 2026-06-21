import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getGoogleAccessTokenForUser, uploadAudioFileToDrive } from "@/lib/integrations/google";

export const maxDuration = 60; // Allow Vercel execution up to 60 seconds (requires Pro, otherwise Hobby fallback)

export async function GET(request: Request) {
  // Simple token header check for cron security (if configured)
  const authHeader = request.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  // 1. Claim a batch of eligible queue items atomically
  const batchSize = 10;
  const { data: queueItems, error: claimError } = await supabase.rpc("claim_media_queue_batch", {
    p_batch_size: batchSize
  });

  if (claimError) {
    console.error("Failed to claim media queue batch:", claimError.message);
    return NextResponse.json({ error: claimError.message }, { status: 500 });
  }

  if (!queueItems || queueItems.length === 0) {
    return NextResponse.json({ message: "No pending queue items found" }, { status: 200 });
  }

  console.log(`Processing batch of ${queueItems.length} media queue items...`);
  const results = [];

  for (const item of queueItems) {
    const { id: queueItemId, user_id: userId, flashcard_id: flashcardId, original_filename: origName, normalized_filename: normName, temp_storage_path: tempPath, retry_count: retryCount } = item;

    try {
      // 1. Download file from private Supabase Storage
      const { data: fileBlob, error: downloadError } = await supabase.storage
        .from("temp-media-imports")
        .download(tempPath);

      if (downloadError || !fileBlob) {
        throw new Error(`Supabase storage download failed: ${downloadError?.message || "Empty blob"}`);
      }

      console.log("[Audio] Worker downloaded media for queue item:", queueItemId);

      // Convert Blob to Buffer for Google API compatibility
      const arrayBuffer = await fileBlob.arrayBuffer();
      const fileBuffer = Buffer.from(arrayBuffer);

      // 2. Fetch active access token for user (pass admin client to bypass RLS)
      const accessToken = await getGoogleAccessTokenForUser(userId, supabase);

      // 3. Upload to Google Drive (handles folder recovery auto-magically; pass admin client)
      const uploadRes = await uploadAudioFileToDrive(userId, accessToken, origName, fileBuffer, supabase);
      const googleFileId = uploadRes.fileId;

      console.log("[Audio] Worker uploaded media to drive:", googleFileId);

      // 4. Determine flashcard sides containing this sound tag
      const { data: flashcard, error: flashcardError } = await supabase
        .from("flashcards")
        .select("front, back")
        .eq("id", flashcardId)
        .single();

      if (flashcardError || !flashcard) {
        throw new Error(`Flashcard with ID ${flashcardId} not found or query failed: ${flashcardError?.message}`);
      }

      const sides: Array<"front" | "back"> = [];
      const normSearch = `[sound:${origName.toLowerCase()}]`;
      if (flashcard.front.toLowerCase().includes(normSearch)) {
        sides.push("front");
      }
      if (flashcard.back.toLowerCase().includes(normSearch)) {
        sides.push("back");
      }
      
      // Fallback if not found directly in front/back tags
      if (sides.length === 0) {
        sides.push("front");
      }

      // 5. Register in audio_files (using manual prefix to satisfy CAS unique constraint)
      const audioHash = `manual-${googleFileId}`;
      let audioFileId = "";

      const { data: existingFile } = await supabase
        .from("audio_files")
        .select("id")
        .eq("user_id", userId)
        .eq("audio_hash", audioHash)
        .single();

      if (existingFile) {
        audioFileId = existingFile.id;
      } else {
        const { data: newFile, error: fileSaveError } = await supabase
          .from("audio_files")
          .insert({
            user_id: userId,
            audio_hash: audioHash,
            provider: "google-drive",
            file_id: googleFileId,
            voice_id: "manual",
            language: "manual",
            file_size: fileBuffer.length,
            duration_seconds: null
          })
          .select("id")
          .single();

        if (fileSaveError || !newFile) {
          throw new Error(`Failed to save audio file metadata: ${fileSaveError?.message}`);
        }
        audioFileId = newFile.id;
      }

      // 6. Map to card_audios
      for (const side of sides) {
        const { data: newCardAudio, error: refError } = await supabase
          .from("card_audios")
          .insert({
            flashcard_id: flashcardId,
            side,
            audio_file_id: audioFileId,
            original_filename: origName,
            normalized_filename: normName
          })
          .select("id")
          .single();

        if (refError || !newCardAudio) {
          console.error(`Ref mapping error for side ${side} of flashcard ${flashcardId}:`, refError?.message);
          throw new Error(`Failed to map audio to card side ${side}: ${refError?.message}`);
        }

        // Now, update flashcard HTML: replace [sound:origName] with <span data-type="audio" data-audio-id="id"></span>
        const targetHtml = side === "front" ? flashcard.front : flashcard.back;
        const newSpan = `<span data-type="audio" data-audio-id="${newCardAudio.id}"></span>`;
        
        const soundRegex = new RegExp(`\\[sound:${origName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}\\]`, 'gi');
        const updatedHtml = targetHtml.replace(soundRegex, newSpan);

        if (updatedHtml !== targetHtml) {
          // Update master flashcard
          await supabase
            .from("flashcards")
            .update({ [side]: updatedHtml })
            .eq("id", flashcardId);

          // Update corresponding study card if it exists
          await supabase
            .from("study_cards")
            .update({ [side]: updatedHtml })
            .eq("source_flashcard_id", flashcardId);
        }
      }

      // 7. Success Cleanup: delete temporary staging object from Supabase bucket
      await supabase.storage.from("temp-media-imports").remove([tempPath]);

      console.log("[Audio]", {
        cardId: flashcardId,
        generated: false,
        uploaded: true,
        driveFileId: googleFileId,
        audioFileId: audioFileId,
        mapped: true
      });

      // 8. Update queue item status
      await supabase
        .from("media_upload_queue")
        .update({
          status: "completed",
          retry_count: retryCount,
          error_message: null,
          google_rate_limited: false,
          next_retry_at: null,
          updated_at: new Date().toISOString()
        })
        .eq("id", queueItemId);

      results.push({ id: queueItemId, status: "completed" });
    } catch (err: unknown) {
      console.error("[Audio Error] Worker failed for queue item:", queueItemId, err);

      const errorMessage = err instanceof Error ? err.message : String(err);
      const isRateLimit = errorMessage.includes("rateLimitExceeded") || errorMessage.includes("429");
      const isQuotaError = errorMessage.includes("GOOGLE_DRIVE_QUOTA_EXCEEDED");

      // Calculate exponential backoff with jitter
      const nextRetryCount = retryCount + 1;
      const backoffSeconds = Math.min(3600, Math.pow(2, nextRetryCount) * 30 + Math.random() * 15);
      const nextRetryAt = new Date(Date.now() + backoffSeconds * 1000).toISOString();

      let targetStatus: "failed" | "rate_limited" | "quota_exceeded" = "failed";
      if (isRateLimit) {
        targetStatus = "rate_limited";
      } else if (isQuotaError) {
        targetStatus = "quota_exceeded";
      }

      // Rollback status to failed/rate_limited/quota_exceeded with backoff
      await supabase
        .from("media_upload_queue")
        .update({
          status: targetStatus,
          retry_count: nextRetryCount,
          error_message: errorMessage.substring(0, 500),
          google_rate_limited: isRateLimit,
          next_retry_at: nextRetryAt,
          updated_at: new Date().toISOString()
        })
        .eq("id", queueItemId);

      results.push({ id: queueItemId, status: targetStatus, error: errorMessage });
    }
  }

  return NextResponse.json({ processed: results.length, results }, { status: 200 });
}
