-- Migration: Sync Flashcards to Study Cards
-- Date: 2026-06-20
-- Description: Automatically propagates card text edits and deletions from master flashcards to study_cards snapshot.

-- 1. Function for updates
CREATE OR REPLACE FUNCTION public.sync_flashcard_edits_to_study_cards()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.study_cards
  SET 
    front = NEW.front,
    back = NEW.back,
    card_type = NEW.card_type,
    updated_at = NOW()
  WHERE source_flashcard_id = NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Create update trigger
DROP TRIGGER IF EXISTS trigger_sync_flashcard_edits_to_study_cards ON public.flashcards;
CREATE TRIGGER trigger_sync_flashcard_edits_to_study_cards
  AFTER UPDATE OF front, back, card_type ON public.flashcards
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_flashcard_edits_to_study_cards();

-- 3. Function for deletions
CREATE OR REPLACE FUNCTION public.sync_flashcard_deletions_to_study_cards()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM public.study_cards
  WHERE source_flashcard_id = OLD.id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Create delete trigger
DROP TRIGGER IF EXISTS trigger_sync_flashcard_deletions_to_study_cards ON public.flashcards;
CREATE TRIGGER trigger_sync_flashcard_deletions_to_study_cards
  AFTER DELETE ON public.flashcards
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_flashcard_deletions_to_study_cards();
