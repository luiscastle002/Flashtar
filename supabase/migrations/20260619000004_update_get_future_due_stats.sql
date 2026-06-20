-- Migration: 20260619000004_update_get_future_due_stats.sql
-- Description: Modifies get_future_due_stats to include cards in state = 'new' in the due counts.

CREATE OR REPLACE FUNCTION public.get_future_due_stats(
  p_user_id UUID,
  p_deck_id UUID,
  p_timezone TEXT
)
RETURNS TABLE (
  due_bucket INTEGER,
  card_count INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    CASE
      WHEN state = 'new' THEN 0
      WHEN due_diff <= 0 THEN 0 -- Today / Overdue
      WHEN due_diff = 1 THEN 1 -- Tomorrow
      WHEN due_diff = 2 THEN 2
      WHEN due_diff = 3 THEN 3
      WHEN due_diff BETWEEN 4 AND 7 THEN 4 -- 4-7 Days
      WHEN due_diff BETWEEN 8 AND 30 THEN 5 -- 8-30 Days
      ELSE 6 -- 30+ Days
    END as due_bucket,
    COUNT(*)::INTEGER as card_count
  FROM (
    SELECT 
      state,
      DATE_PART('day', 
        date_trunc('day', due_at AT TIME ZONE p_timezone) - 
        date_trunc('day', NOW() AT TIME ZONE p_timezone)
      )::INTEGER as due_diff
    FROM public.study_cards
    WHERE user_id = p_user_id
      AND (study_deck_id = p_deck_id OR p_deck_id IS NULL)
      AND state IN ('learn', 'review', 'new')
  ) subquery
  GROUP BY due_bucket;
$$;
