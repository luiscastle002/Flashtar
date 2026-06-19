import { createClient } from "@/lib/supabase/server";
import type { TranscriptSegment } from "./youtube-providers";

export interface CachedTranscript {
  content: string;
  segments: TranscriptSegment[] | null;
}

/**
 * Retrieves a cached transcript for a given video ID and language.
 */
export async function getCachedTranscript(videoId: string, language: string): Promise<CachedTranscript | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("youtube_transcript_cache")
      .select("content, segments")
      .eq("video_id", videoId)
      .eq("language", language)
      .maybeSingle();

    if (error) {
      console.error("[youtube-cache] Error fetching cached transcript:", error);
      return null;
    }

    return data || null;
  } catch (err) {
    console.error("[youtube-cache] Error in getCachedTranscript:", err);
    return null;
  }
}

/**
 * Saves or updates a transcript in the global cache.
 */
export async function saveCachedTranscript(
  videoId: string,
  language: string,
  content: string,
  segments: TranscriptSegment[]
): Promise<void> {
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("youtube_transcript_cache")
      .upsert(
        {
          video_id: videoId,
          language: language,
          content: content,
          segments: segments,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "video_id,language" }
      );

    if (error) {
      console.error("[youtube-cache] Error saving cached transcript:", error);
    }
  } catch (err) {
    console.error("[youtube-cache] Error in saveCachedTranscript:", err);
  }
}

/**
 * Logs a YouTube transcript import event for system observability.
 */
export async function logYoutubeImportAnalytics(params: {
  videoId: string;
  userId: string;
  provider: string;
  attempts: number;
  success: boolean;
  durationMs: number;
  errorCode: string | null;
}): Promise<void> {
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("youtube_import_analytics")
      .insert({
        video_id: params.videoId,
        user_id: params.userId,
        provider: params.provider,
        attempts: params.attempts,
        success: params.success,
        duration_ms: params.durationMs,
        error_code: params.errorCode,
      });

    if (error) {
      console.error("[youtube-cache] Error logging import analytics:", error);
    }
  } catch (err) {
    console.error("[youtube-cache] Error in logYoutubeImportAnalytics:", err);
  }
}
