-- Migration: Add autoplay settings to deck study settings
-- Date: 2026-06-20
-- Description: Adds autoplay_audio_front and autoplay_audio_back columns to deck_study_settings table.

ALTER TABLE public.deck_study_settings 
ADD COLUMN IF NOT EXISTS autoplay_audio_front BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS autoplay_audio_back BOOLEAN NOT NULL DEFAULT FALSE;
