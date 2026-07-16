-- Migration: 20260716000000_shared_card_delete_trigger.sql
--
-- Problem:
--   Deleting a row from shared_cards triggers ON DELETE SET NULL on
--   study_cards.shared_card_id. After the FK nullifies the reference,
--   the check_front_or_shared constraint requires front IS NOT NULL,
--   but shared-mode study_cards intentionally store front = NULL
--   (they read content from the linked shared_cards row at query time).
--   This caused the DELETE to abort with a constraint violation.
--
-- Fix:
--   A BEFORE DELETE trigger that copies front/back from the shared card
--   into every referencing study_cards row BEFORE the FK cascade fires.
--   Once the trigger runs, front is populated, so when SET NULL clears
--   shared_card_id the constraint is already satisfied.
--
--   The check_front_or_shared constraint is left completely unchanged.
--   The FK action (ON DELETE SET NULL) is left completely unchanged.
--   User SRS progress (ease, interval, repetitions, etc.) is preserved.

-- 1. Trigger function
CREATE OR REPLACE FUNCTION public.handle_shared_card_deleted()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
BEGIN
  -- Copy front/back from the shared card into every study_cards row
  -- that references it, BEFORE the FK ON DELETE SET NULL nullifies the
  -- shared_card_id. This preserves the user's SRS progress and keeps
  -- the orphaned row valid against the check_front_or_shared constraint.
  --
  -- We unconditionally overwrite front/back because OLD is the canonical
  -- truth at the moment of deletion. Any cached or partially-populated
  -- value should be replaced with the definitive content.
  UPDATE public.study_cards
  SET
    front      = OLD.front,
    back       = OLD.back,
    updated_at = NOW()
  WHERE shared_card_id = OLD.id;

  RETURN OLD;
END;
$$;

-- 2. Attach to shared_cards BEFORE DELETE (one row at a time)
CREATE TRIGGER before_shared_card_delete
  BEFORE DELETE ON public.shared_cards
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_shared_card_deleted();
