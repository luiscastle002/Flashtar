-- =============================================================================
-- Flashtar Scaling & Search Optimization Migration
-- Migration: 20260618000003_scaling_and_search.sql
-- =============================================================================

-- Enable pg_trgm extension for fast substring/ILIKE matches
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 1. Add search_text column to study_cards for materialized/denormalized text
ALTER TABLE public.study_cards 
  ADD COLUMN IF NOT EXISTS search_text TEXT;

-- 2. HTML and Cloze stripping logic
CREATE OR REPLACE FUNCTION public.strip_html_and_cloze(input TEXT)
RETURNS TEXT AS $$
DECLARE
  v_stripped TEXT;
BEGIN
  IF input IS NULL THEN
    RETURN '';
  END IF;
  -- Strip HTML tags
  v_stripped := regexp_replace(input, '<[^>]*>', ' ', 'g');
  -- Strip common HTML entities
  v_stripped := regexp_replace(v_stripped, '&nbsp;|&#160;|&amp;|&lt;|&gt;', ' ', 'g');
  -- Extract cloze text (e.g. {{c1::cloze_text}} -> cloze_text)
  v_stripped := regexp_replace(v_stripped, '\{\{c\d+::([^:}]+)(?:::[^}]+)?\}\}', '\1', 'g');
  -- Clean up extra spaces
  RETURN trim(regexp_replace(v_stripped, '\s+', ' ', 'g'));
END;
$$ LANGUAGE plpgsql IMMUTABLE STRICT;

-- 3. Trigger function to keep search_text synchronized on insert/update of front/back
CREATE OR REPLACE FUNCTION public.sync_study_card_search_text()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_text := trim(
    COALESCE(public.strip_html_and_cloze(NEW.front), '') || ' ' || 
    COALESCE(public.strip_html_and_cloze(NEW.back), '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger definition
DROP TRIGGER IF EXISTS trigger_study_cards_search_text_sync ON public.study_cards;
CREATE TRIGGER trigger_study_cards_search_text_sync
  BEFORE INSERT OR UPDATE OF front, back ON public.study_cards
  FOR EACH ROW EXECUTE FUNCTION public.sync_study_card_search_text();

-- Populate search_text for existing cards
UPDATE public.study_cards 
SET search_text = trim(
  COALESCE(public.strip_html_and_cloze(front), '') || ' ' || 
  COALESCE(public.strip_html_and_cloze(back), '')
);

-- 4. Subscription limit triggers (1,000 for free tier, 50,000 for pro tier)
CREATE OR REPLACE FUNCTION public.check_user_card_limit()
RETURNS TRIGGER AS $$
DECLARE
  v_plan public.plan_type;
  v_card_count integer;
  v_limit integer;
BEGIN
  -- Fetch user's subscription plan
  SELECT plan INTO v_plan
  FROM public.subscriptions
  WHERE user_id = NEW.user_id;

  v_plan := COALESCE(v_plan, 'free'::public.plan_type);

  -- Count existing cards owned by this user
  SELECT COUNT(*)::integer INTO v_card_count
  FROM public.study_cards
  WHERE user_id = NEW.user_id;

  -- Enforce tier limit
  IF v_plan = 'pro' THEN
    v_limit := 50000;
  ELSE
    v_limit := 1000; -- Free limit is 1,000 cards
  END IF;

  IF v_card_count >= v_limit THEN
    RAISE EXCEPTION 'errors.study_decks.limit_reached' USING DETAIL = v_limit::text;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_check_card_limit ON public.study_cards;
CREATE TRIGGER trigger_check_card_limit
  BEFORE INSERT ON public.study_cards
  FOR EACH ROW EXECUTE FUNCTION public.check_user_card_limit();

-- 5. Review logs auto-archiving function for Free tier (30-day history purging)
CREATE OR REPLACE FUNCTION public.purge_expired_free_logs()
RETURNS void AS $$
BEGIN
  DELETE FROM public.review_logs
  WHERE user_id IN (
    SELECT user_id 
    FROM public.subscriptions 
    WHERE plan = 'free'::public.plan_type
  )
  AND reviewed_at < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Optimizing indexes
-- GIN Trigram index for search_text (enables fast ILIKE substring matching)
CREATE INDEX IF NOT EXISTS idx_study_cards_search_trgm 
  ON public.study_cards USING gin (search_text gin_trgm_ops);

-- Composite indexes for pagination sorting (with state suspended toggle)
CREATE INDEX IF NOT EXISTS idx_study_cards_user_deck_state_front_id 
  ON public.study_cards (user_id, study_deck_id, state, front, id);

CREATE INDEX IF NOT EXISTS idx_study_cards_user_deck_state_created_id 
  ON public.study_cards (user_id, study_deck_id, state, created_at DESC, id DESC);

-- Composite indexes for pagination sorting (without state filter)
CREATE INDEX IF NOT EXISTS idx_study_cards_user_deck_front_id 
  ON public.study_cards (user_id, study_deck_id, front, id);

CREATE INDEX IF NOT EXISTS idx_study_cards_user_deck_created_id 
  ON public.study_cards (user_id, study_deck_id, created_at DESC, id DESC);

-- Composite index for review logs performance
CREATE INDEX IF NOT EXISTS idx_review_logs_user_deck_date 
  ON public.review_logs (user_id, study_deck_id, reviewed_at DESC);
