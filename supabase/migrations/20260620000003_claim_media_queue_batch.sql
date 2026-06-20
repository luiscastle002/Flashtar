-- Migration: Concurrency-Safe Media Queue Batch Claim
-- Date: 2026-06-20
-- Description: Adds a plpgsql function to atomically select, lock, and transition pending media upload queue items to 'processing' state.

CREATE OR REPLACE FUNCTION public.claim_media_queue_batch(
  p_batch_size INTEGER
)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  deck_id UUID,
  flashcard_id UUID,
  original_filename TEXT,
  normalized_filename TEXT,
  temp_storage_path TEXT,
  retry_count INTEGER
) AS $$
DECLARE
  claimed_ids UUID[];
BEGIN
  -- Select eligible rows, lock them, and skip locked ones
  SELECT ARRAY(
    SELECT q.id
    FROM public.media_upload_queue q
    WHERE q.status IN ('pending', 'failed', 'rate_limited')
      AND (q.next_retry_at IS NULL OR q.next_retry_at <= NOW())
      AND q.retry_count < 5
      AND q.google_rate_limited = FALSE
      -- Only process if user's Google connection is active
      AND EXISTS (
        SELECT 1 FROM public.user_google_drive_connections c
        WHERE c.user_id = q.user_id 
          AND c.connection_status = 'connected'
      )
    ORDER BY q.created_at ASC
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  ) INTO claimed_ids;

  -- If we claimed any, mark them as processing
  IF array_length(claimed_ids, 1) > 0 THEN
    UPDATE public.media_upload_queue
    SET status = 'processing',
        updated_at = NOW()
    WHERE id = ANY(claimed_ids);

    -- Return the claimed rows
    RETURN QUERY
    SELECT q.id, q.user_id, q.deck_id, q.flashcard_id, q.original_filename, q.normalized_filename, q.temp_storage_path, q.retry_count
    FROM public.media_upload_queue q
    WHERE q.id = ANY(claimed_ids);
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
