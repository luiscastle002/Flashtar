-- Migration: Add last_studied_at to study_decks and show_card_preview to deck_study_settings
-- 20260618000004_deck_metadata_and_visibility.sql

-- 1. Add last_studied_at to study_decks
ALTER TABLE public.study_decks 
  ADD COLUMN IF NOT EXISTS last_studied_at TIMESTAMPTZ;

-- 2. Add show_card_preview to deck_study_settings
ALTER TABLE public.deck_study_settings 
  ADD COLUMN IF NOT EXISTS show_card_preview BOOLEAN NOT NULL DEFAULT TRUE;

-- 3. Create index for sorting by last_studied_at
CREATE INDEX IF NOT EXISTS idx_study_decks_last_studied_at 
  ON public.study_decks(user_id, last_studied_at DESC);

-- 4. Trigger function to update last_studied_at on study_decks when a review log is inserted
CREATE OR REPLACE FUNCTION public.update_study_deck_last_studied_at()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.study_decks
  SET last_studied_at = NEW.reviewed_at
  WHERE id = NEW.study_deck_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Create trigger on review_logs
DROP TRIGGER IF EXISTS trg_update_study_deck_last_studied_at ON public.review_logs;
CREATE TRIGGER trg_update_study_deck_last_studied_at
  AFTER INSERT ON public.review_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_study_deck_last_studied_at();

-- 6. Backfill last_studied_at for existing decks
UPDATE public.study_decks sd
SET last_studied_at = (
  SELECT MAX(reviewed_at)
  FROM public.review_logs rl
  WHERE rl.study_deck_id = sd.id
)
WHERE last_studied_at IS NULL;
