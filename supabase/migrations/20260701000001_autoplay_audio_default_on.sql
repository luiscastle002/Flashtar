-- Migration: Change autoplay audio defaults to enabled
-- Date: 2026-07-01
-- Description: Sets autoplay_audio_front and autoplay_audio_back default to TRUE so that
--              all new deck_study_settings rows start with audio auto-play enabled.
--              Also back-fills existing rows that were never manually changed.

-- 1. Change the column default so all future rows are ON by default
ALTER TABLE public.deck_study_settings
  ALTER COLUMN autoplay_audio_front SET DEFAULT TRUE,
  ALTER COLUMN autoplay_audio_back SET DEFAULT TRUE;

-- 2. Back-fill all existing rows that still have the original FALSE value
--    (this covers every user who never explicitly toggled the setting)
UPDATE public.deck_study_settings
SET
  autoplay_audio_front = TRUE,
  autoplay_audio_back  = TRUE
WHERE
  autoplay_audio_front = FALSE
  AND autoplay_audio_back = FALSE;
