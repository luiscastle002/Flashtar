-- Migration: 20260619000000_increment_user_study_stats.sql
-- Description: Adds a function to atomically increment daily study aggregates in user_study_stats to prevent overwriting across multiple sessions.

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
    -- Recalculate retention dynamically for the day: (good + easy) / total * 100
    retention_pct = CASE 
      WHEN (public.user_study_stats.cards_reviewed + EXCLUDED.cards_reviewed) > 0 
      THEN ROUND(
        ((public.user_study_stats.cards_good + public.user_study_stats.cards_easy + EXCLUDED.cards_good + EXCLUDED.cards_easy)::double precision / 
         (public.user_study_stats.cards_reviewed + EXCLUDED.cards_reviewed)::double precision) * 100
      )::real
      ELSE NULL
    END;
END;
$$;
