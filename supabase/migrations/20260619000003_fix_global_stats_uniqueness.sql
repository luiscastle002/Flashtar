-- Migration: 20260619000003_fix_global_stats_uniqueness.sql
-- Description: Aggregates duplicate global stats rows and creates a unique partial index to enforce upserts on global stats.

-- 1. Merge existing duplicate rows in user_study_stats where study_deck_id IS NULL
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN 
    SELECT user_id, stat_date, MIN(id::text)::uuid as keep_id,
           SUM(cards_reviewed) as sum_reviewed,
           SUM(cards_again) as sum_again,
           SUM(cards_hard) as sum_hard,
           SUM(cards_good) as sum_good,
           SUM(cards_easy) as sum_easy,
           SUM(new_cards_seen) as sum_new,
           SUM(study_time_ms) as sum_time
    FROM public.user_study_stats
    WHERE study_deck_id IS NULL
    GROUP BY user_id, stat_date
    HAVING COUNT(*) > 1
  LOOP
    -- Update the kept row with the aggregated sums
    UPDATE public.user_study_stats
    SET cards_reviewed = r.sum_reviewed,
        cards_again = r.sum_again,
        cards_hard = r.sum_hard,
        cards_good = r.sum_good,
        cards_easy = r.sum_easy,
        new_cards_seen = r.sum_new,
        study_time_ms = r.sum_time,
        retention_pct = CASE 
          WHEN r.sum_reviewed > 0 
          THEN ROUND(((r.sum_good + r.sum_easy)::double precision / r.sum_reviewed::double precision) * 100)::real
          ELSE NULL
        END
    WHERE id = r.keep_id;

    -- Delete all other duplicate rows for this user/date (where study_deck_id is NULL)
    DELETE FROM public.user_study_stats
    WHERE user_id = r.user_id
      AND stat_date = r.stat_date
      AND study_deck_id IS NULL
      AND id != r.keep_id;
  END LOOP;
END;
$$;

-- 2. Create the unique partial index
CREATE UNIQUE INDEX IF NOT EXISTS user_study_stats_global_unique_idx
ON public.user_study_stats (user_id, stat_date)
WHERE study_deck_id IS NULL;

-- 3. Replace increment_user_study_stats function to support the partial index
CREATE OR REPLACE FUNCTION public.increment_user_study_stats(
  p_user_id UUID,
  p_stat_date DATE,
  p_study_deck_id UUID,
  p_study_time_ms BIGINT,
  p_cards_reviewed INTEGER,
  p_cards_again INTEGER,
  p_cards_hard INTEGER,
  p_cards_good INTEGER,
  p_cards_easy INTEGER,
  p_new_cards_seen INTEGER,
  p_retention_pct REAL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_study_deck_id IS NULL THEN
    INSERT INTO public.user_study_stats (
      user_id,
      stat_date,
      study_deck_id,
      study_time_ms,
      cards_reviewed,
      cards_again,
      cards_hard,
      cards_good,
      cards_easy,
      new_cards_seen,
      retention_pct
    )
    VALUES (
      p_user_id,
      p_stat_date,
      NULL,
      p_study_time_ms,
      p_cards_reviewed,
      p_cards_again,
      p_cards_hard,
      p_cards_good,
      p_cards_easy,
      p_new_cards_seen,
      p_retention_pct
    )
    ON CONFLICT (user_id, stat_date) WHERE study_deck_id IS NULL
    DO UPDATE SET
      study_time_ms = public.user_study_stats.study_time_ms + EXCLUDED.study_time_ms,
      cards_reviewed = public.user_study_stats.cards_reviewed + EXCLUDED.cards_reviewed,
      cards_again = public.user_study_stats.cards_again + EXCLUDED.cards_again,
      cards_hard = public.user_study_stats.cards_hard + EXCLUDED.cards_hard,
      cards_good = public.user_study_stats.cards_good + EXCLUDED.cards_good,
      cards_easy = public.user_study_stats.cards_easy + EXCLUDED.cards_easy,
      new_cards_seen = public.user_study_stats.new_cards_seen + EXCLUDED.new_cards_seen,
      retention_pct = CASE 
        WHEN (public.user_study_stats.cards_reviewed + EXCLUDED.cards_reviewed) > 0 
        THEN ROUND(
          ((public.user_study_stats.cards_good + public.user_study_stats.cards_easy + EXCLUDED.cards_good + EXCLUDED.cards_easy)::double precision / 
           (public.user_study_stats.cards_reviewed + EXCLUDED.cards_reviewed)::double precision) * 100
        )::real
        ELSE NULL
      END;
  ELSE
    INSERT INTO public.user_study_stats (
      user_id,
      stat_date,
      study_deck_id,
      study_time_ms,
      cards_reviewed,
      cards_again,
      cards_hard,
      cards_good,
      cards_easy,
      new_cards_seen,
      retention_pct
    )
    VALUES (
      p_user_id,
      p_stat_date,
      p_study_deck_id,
      p_study_time_ms,
      p_cards_reviewed,
      p_cards_again,
      p_cards_hard,
      p_cards_good,
      p_cards_easy,
      p_new_cards_seen,
      p_retention_pct
    )
    ON CONFLICT (user_id, stat_date, study_deck_id)
    DO UPDATE SET
      study_time_ms = public.user_study_stats.study_time_ms + EXCLUDED.study_time_ms,
      cards_reviewed = public.user_study_stats.cards_reviewed + EXCLUDED.cards_reviewed,
      cards_again = public.user_study_stats.cards_again + EXCLUDED.cards_again,
      cards_hard = public.user_study_stats.cards_hard + EXCLUDED.cards_hard,
      cards_good = public.user_study_stats.cards_good + EXCLUDED.cards_good,
      cards_easy = public.user_study_stats.cards_easy + EXCLUDED.cards_easy,
      new_cards_seen = public.user_study_stats.new_cards_seen + EXCLUDED.new_cards_seen,
      retention_pct = CASE 
        WHEN (public.user_study_stats.cards_reviewed + EXCLUDED.cards_reviewed) > 0 
        THEN ROUND(
          ((public.user_study_stats.cards_good + public.user_study_stats.cards_easy + EXCLUDED.cards_good + EXCLUDED.cards_easy)::double precision / 
           (public.user_study_stats.cards_reviewed + EXCLUDED.cards_reviewed)::double precision) * 100
        )::real
        ELSE NULL
      END;
  END IF;
END;
$$;
