-- Migration: Add deck_id to study_decks
-- Date: 2026-07-01
-- Description: Adds a deck_id column to study_decks table referencing public.decks(id) to link study decks to master decks.

ALTER TABLE public.study_decks
  ADD COLUMN IF NOT EXISTS deck_id UUID REFERENCES public.decks(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_study_decks_deck_id ON public.study_decks(deck_id) WHERE deck_id IS NOT NULL;
