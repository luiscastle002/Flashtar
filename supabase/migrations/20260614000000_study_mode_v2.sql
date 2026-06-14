-- =============================================================================
-- Flashtar Study Mode v2 Schema
-- Migration: 20260614000000_study_mode_v2.sql
--
-- Creates all tables for native spaced repetition study mode.
-- Additive only — no modifications to existing tables.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

CREATE TYPE public.card_study_state AS ENUM (
  'new',        -- Never studied
  'learn',      -- In active learning steps (short intervals)
  'review',     -- Graduated from learning, periodic review
  'suspended',  -- User-paused, ignored by scheduler
  'buried',     -- Day-paused (daily limit overflow or manual)
  'leech'       -- Failed too many times, auto-suspended + flagged
);

CREATE TYPE public.import_source AS ENUM (
  'generated_deck',  -- From AI generation (existing decks table)
  'csv',             -- CSV file upload
  'apkg',            -- Anki .apkg package import
  'manual'           -- Cards created directly in study deck
);

CREATE TYPE public.import_status AS ENUM (
  'pending',
  'processing',
  'completed',
  'failed',
  'partial'          -- Completed with some skipped rows
);

CREATE TYPE public.media_type AS ENUM (
  'image',
  'audio',
  'video',
  'gif',
  'document'
);

-- ---------------------------------------------------------------------------
-- study_decks
-- Permanent learning collections (not the same as AI-generated decks)
-- ---------------------------------------------------------------------------

CREATE TABLE public.study_decks (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name         TEXT        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  description  TEXT        CHECK (char_length(description) <= 1000),
  emoji        TEXT,                          -- e.g. '🇯🇵' for visual identity
  color        TEXT        DEFAULT '#6366f1', -- hex accent color for UI theming
  is_archived  BOOLEAN     NOT NULL DEFAULT FALSE,
  card_count   INTEGER     NOT NULL DEFAULT 0 CHECK (card_count >= 0), -- denormalized
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_study_decks_user_id         ON public.study_decks(user_id);
CREATE INDEX idx_study_decks_user_active     ON public.study_decks(user_id, is_archived, created_at DESC);

ALTER TABLE public.study_decks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own study decks"
  ON public.study_decks FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own study decks"
  ON public.study_decks FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own study decks"
  ON public.study_decks FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own study decks"
  ON public.study_decks FOR DELETE
  USING (auth.uid() = user_id);

CREATE TRIGGER study_decks_updated_at
  BEFORE UPDATE ON public.study_decks
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ---------------------------------------------------------------------------
-- deck_study_settings
-- 1:1 with study_decks. All SM-2 tuning parameters per deck.
-- ---------------------------------------------------------------------------

CREATE TABLE public.deck_study_settings (
  id                   UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  study_deck_id        UUID    NOT NULL UNIQUE REFERENCES public.study_decks(id) ON DELETE CASCADE,

  -- Daily limits
  new_cards_per_day    INTEGER NOT NULL DEFAULT 20  CHECK (new_cards_per_day  BETWEEN 0 AND 9999),
  max_reviews_per_day  INTEGER NOT NULL DEFAULT 200 CHECK (max_reviews_per_day BETWEEN 0 AND 9999),

  -- Learning phase (array of step durations, e.g. '1m', '10m', '1d')
  learning_steps       TEXT[]  NOT NULL DEFAULT ARRAY['1m', '10m'],
  graduating_interval  INTEGER NOT NULL DEFAULT 1   CHECK (graduating_interval  >= 1), -- days
  easy_interval        INTEGER NOT NULL DEFAULT 4   CHECK (easy_interval        >= 1), -- days

  -- Relearning (after Again on a review card)
  relearning_steps     TEXT[]  NOT NULL DEFAULT ARRAY['10m'],

  -- Leech handling
  leech_threshold      INTEGER NOT NULL DEFAULT 8   CHECK (leech_threshold BETWEEN 1 AND 50),
  leech_action         TEXT    NOT NULL DEFAULT 'suspend' CHECK (leech_action IN ('suspend', 'tag_only')),

  -- Interval bounds
  maximum_interval     INTEGER NOT NULL DEFAULT 36500 CHECK (maximum_interval >= 1), -- days (100 years)
  ease_minimum         REAL    NOT NULL DEFAULT 1.3   CHECK (ease_minimum BETWEEN 1.0 AND 3.0),

  -- UI preferences
  new_card_order       TEXT    NOT NULL DEFAULT 'due'  CHECK (new_card_order IN ('due', 'random')),
  show_confidence_bar  BOOLEAN NOT NULL DEFAULT TRUE,  -- FALSE = classic AGHE buttons

  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.deck_study_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can access own deck settings"
  ON public.deck_study_settings FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.study_decks sd
      WHERE sd.id = study_deck_id AND sd.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.study_decks sd
      WHERE sd.id = study_deck_id AND sd.user_id = auth.uid()
    )
  );

CREATE TRIGGER deck_study_settings_updated_at
  BEFORE UPDATE ON public.deck_study_settings
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ---------------------------------------------------------------------------
-- study_sessions
-- One row per study session. Groups individual card reviews.
-- ---------------------------------------------------------------------------

CREATE TABLE public.study_sessions (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  study_deck_id   UUID        NOT NULL REFERENCES public.study_decks(id) ON DELETE CASCADE,
  user_id         UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at        TIMESTAMPTZ,
  duration_ms     INTEGER,      -- populated on session end

  -- Aggregated counts (populated on session end)
  cards_studied   INTEGER     NOT NULL DEFAULT 0,
  cards_again     INTEGER     NOT NULL DEFAULT 0,
  cards_hard      INTEGER     NOT NULL DEFAULT 0,
  cards_good      INTEGER     NOT NULL DEFAULT 0,
  cards_easy      INTEGER     NOT NULL DEFAULT 0,
  new_cards_seen  INTEGER     NOT NULL DEFAULT 0,
  retention_pct   REAL,         -- (good + easy) / total × 100

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_study_sessions_user_date ON public.study_sessions(user_id, started_at DESC);
CREATE INDEX idx_study_sessions_deck      ON public.study_sessions(study_deck_id, started_at DESC);

ALTER TABLE public.study_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own study sessions"
  ON public.study_sessions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own study sessions"
  ON public.study_sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own study sessions"
  ON public.study_sessions FOR UPDATE
  USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- imports
-- Tracks each import event (generated deck / CSV / APKG → study deck).
-- ---------------------------------------------------------------------------

CREATE TABLE public.imports (
  id                UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID            NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  study_deck_id     UUID            NOT NULL REFERENCES public.study_decks(id) ON DELETE CASCADE,
  source_type       public.import_source NOT NULL,
  source_deck_id    UUID            REFERENCES public.decks(id) ON DELETE SET NULL,
  source_file_name  TEXT,
  source_file_url   TEXT,           -- Supabase Storage URL for uploaded files

  status            public.import_status NOT NULL DEFAULT 'pending',
  total_cards       INTEGER         NOT NULL DEFAULT 0,
  imported_cards    INTEGER         NOT NULL DEFAULT 0,
  skipped_cards     INTEGER         NOT NULL DEFAULT 0,
  error_message     TEXT,

  started_at        TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_imports_user       ON public.imports(user_id, created_at DESC);
CREATE INDEX idx_imports_study_deck ON public.imports(study_deck_id);
CREATE INDEX idx_imports_source_deck ON public.imports(source_deck_id) WHERE source_deck_id IS NOT NULL;

ALTER TABLE public.imports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own imports"
  ON public.imports FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own imports"
  ON public.imports FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own imports"
  ON public.imports FOR UPDATE
  USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- media_assets
-- Checksum-deduplicated registry of uploaded media files.
-- ---------------------------------------------------------------------------

CREATE TABLE public.media_assets (
  id           UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID              NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  storage_path TEXT              NOT NULL,  -- Supabase Storage path
  public_url   TEXT              NOT NULL,
  file_name    TEXT              NOT NULL,
  media_type   public.media_type NOT NULL,
  mime_type    TEXT              NOT NULL,
  size_bytes   BIGINT            NOT NULL CHECK (size_bytes > 0),
  width_px     INTEGER,          -- for images / GIFs
  height_px    INTEGER,          -- for images / GIFs
  duration_ms  INTEGER,          -- for audio / video
  checksum     TEXT,             -- SHA-256 hex for deduplication
  created_at   TIMESTAMPTZ       NOT NULL DEFAULT NOW(),

  UNIQUE (user_id, storage_path)
);

CREATE INDEX idx_media_assets_user     ON public.media_assets(user_id);
CREATE INDEX idx_media_assets_checksum ON public.media_assets(user_id, checksum) WHERE checksum IS NOT NULL;
CREATE INDEX idx_media_assets_type     ON public.media_assets(user_id, media_type);

ALTER TABLE public.media_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own media assets"
  ON public.media_assets FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own media assets"
  ON public.media_assets FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own media assets"
  ON public.media_assets FOR DELETE
  USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- study_cards
-- Content snapshot of a flashcard within a study deck.
-- Holds ALL scheduling state for Modified SM-2 and future FSRS.
-- ---------------------------------------------------------------------------

CREATE TABLE public.study_cards (
  id                  UUID                    PRIMARY KEY DEFAULT gen_random_uuid(),
  study_deck_id       UUID                    NOT NULL REFERENCES public.study_decks(id) ON DELETE CASCADE,
  user_id             UUID                    NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  -- Content snapshot (copied from flashcards at import time)
  front               TEXT                    NOT NULL,
  back                TEXT                    NOT NULL DEFAULT '',
  card_type           public.card_type        NOT NULL DEFAULT 'basic',
  media_refs          UUID[]                  DEFAULT '{}',  -- references media_assets.id

  -- Source tracking (nullable — cards can be created directly)
  source_flashcard_id UUID                    REFERENCES public.flashcards(id) ON DELETE SET NULL,
  source_deck_id      UUID                    REFERENCES public.decks(id)     ON DELETE SET NULL,
  import_id           UUID                    REFERENCES public.imports(id)   ON DELETE SET NULL,

  -- Scheduling state
  state               public.card_study_state NOT NULL DEFAULT 'new',
  due_at              TIMESTAMPTZ             NOT NULL DEFAULT NOW(),
  last_reviewed_at    TIMESTAMPTZ,

  -- Modified SM-2 fields
  ease_factor         REAL                    NOT NULL DEFAULT 2.5 CHECK (ease_factor >= 1.0),
  interval_days       REAL                    NOT NULL DEFAULT 0   CHECK (interval_days >= 0),
  repetitions         INTEGER                 NOT NULL DEFAULT 0   CHECK (repetitions >= 0),
  lapse_count         INTEGER                 NOT NULL DEFAULT 0   CHECK (lapse_count >= 0),
  learning_step_index INTEGER                 NOT NULL DEFAULT 0   CHECK (learning_step_index >= 0),

  -- FSRS v5 fields (NULL until user migrates to FSRS — Phase 3)
  fsrs_stability      REAL,
  fsrs_difficulty     REAL,
  fsrs_retrievability REAL,

  -- Metadata
  tags                TEXT[]                  DEFAULT '{}',
  is_flagged          BOOLEAN                 NOT NULL DEFAULT FALSE,
  position            INTEGER                 NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ             NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ             NOT NULL DEFAULT NOW()
);

-- Performance-critical indexes for scheduler
CREATE INDEX idx_study_cards_deck_state   ON public.study_cards(study_deck_id, state);
CREATE INDEX idx_study_cards_deck_due     ON public.study_cards(study_deck_id, due_at)
  WHERE state IN ('learn', 'review');                          -- partial: only schedulable cards
CREATE INDEX idx_study_cards_deck_new     ON public.study_cards(study_deck_id, position)
  WHERE state = 'new';                                         -- partial: new cards queue
CREATE INDEX idx_study_cards_user_id      ON public.study_cards(user_id);
CREATE INDEX idx_study_cards_source       ON public.study_cards(source_flashcard_id)
  WHERE source_flashcard_id IS NOT NULL;
CREATE INDEX idx_study_cards_tags         ON public.study_cards USING GIN(tags);
CREATE INDEX idx_study_cards_flagged      ON public.study_cards(study_deck_id, is_flagged)
  WHERE is_flagged = TRUE;

ALTER TABLE public.study_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own study cards"
  ON public.study_cards FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own study cards"
  ON public.study_cards FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own study cards"
  ON public.study_cards FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own study cards"
  ON public.study_cards FOR DELETE
  USING (auth.uid() = user_id);

CREATE TRIGGER study_cards_updated_at
  BEFORE UPDATE ON public.study_cards
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ---------------------------------------------------------------------------
-- review_logs
-- One row per card review. Write-heavy, read-rarely.
-- Source of truth for statistics + future FSRS optimizer.
-- ---------------------------------------------------------------------------

CREATE TABLE public.review_logs (
  id               UUID                    PRIMARY KEY DEFAULT gen_random_uuid(),
  study_card_id    UUID                    NOT NULL REFERENCES public.study_cards(id) ON DELETE CASCADE,
  study_deck_id    UUID                    NOT NULL REFERENCES public.study_decks(id) ON DELETE CASCADE,
  user_id          UUID                    NOT NULL REFERENCES public.profiles(id)    ON DELETE CASCADE,
  session_id       UUID                    REFERENCES public.study_sessions(id)       ON DELETE SET NULL,

  -- The raw confidence value from the UI (0–100)
  confidence_pct   SMALLINT                NOT NULL CHECK (confidence_pct BETWEEN 0 AND 100),
  -- The SM-2 bucket it mapped to
  rating           TEXT                    NOT NULL CHECK (rating IN ('again', 'hard', 'good', 'easy')),

  -- Scheduling state before/after for debugging + FSRS optimizer
  state_before     public.card_study_state NOT NULL,
  state_after      public.card_study_state NOT NULL,
  interval_before  REAL                    NOT NULL DEFAULT 0,
  interval_after   REAL                    NOT NULL DEFAULT 0,
  ease_before      REAL,
  ease_after       REAL,

  -- Timing
  review_duration_ms INTEGER,             -- milliseconds user spent on this card
  reviewed_at      TIMESTAMPTZ            NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_review_logs_user_date  ON public.review_logs(user_id, reviewed_at DESC);
CREATE INDEX idx_review_logs_deck_date  ON public.review_logs(study_deck_id, reviewed_at DESC);
CREATE INDEX idx_review_logs_card       ON public.review_logs(study_card_id);
CREATE INDEX idx_review_logs_session    ON public.review_logs(session_id) WHERE session_id IS NOT NULL;

ALTER TABLE public.review_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own review logs"
  ON public.review_logs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own review logs"
  ON public.review_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- user_study_stats
-- Daily aggregated rollups. Updated at session end (UPSERT pattern).
-- Powers dashboard, heatmap, streak without scanning review_logs.
-- ---------------------------------------------------------------------------

CREATE TABLE public.user_study_stats (
  id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID    NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  stat_date       DATE    NOT NULL,
  study_deck_id   UUID    REFERENCES public.study_decks(id) ON DELETE CASCADE, -- NULL = global/all decks

  -- Daily aggregates
  cards_reviewed  INTEGER NOT NULL DEFAULT 0,
  cards_again     INTEGER NOT NULL DEFAULT 0,
  cards_hard      INTEGER NOT NULL DEFAULT 0,
  cards_good      INTEGER NOT NULL DEFAULT 0,
  cards_easy      INTEGER NOT NULL DEFAULT 0,
  new_cards_seen  INTEGER NOT NULL DEFAULT 0,
  study_time_ms   BIGINT  NOT NULL DEFAULT 0,
  retention_pct   REAL,

  UNIQUE (user_id, stat_date, study_deck_id)
);

CREATE INDEX idx_user_study_stats_user_date ON public.user_study_stats(user_id, stat_date DESC);
CREATE INDEX idx_user_study_stats_deck_date ON public.user_study_stats(study_deck_id, stat_date DESC)
  WHERE study_deck_id IS NOT NULL;

ALTER TABLE public.user_study_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own study stats"
  ON public.user_study_stats FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can upsert own study stats"
  ON public.user_study_stats FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own study stats"
  ON public.user_study_stats FOR UPDATE
  USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Postgres Helper Functions
-- ---------------------------------------------------------------------------

-- get_study_deck_due_counts
-- Returns new/learn/review counts for a deck (used by session construction
-- and the /study index page).
CREATE OR REPLACE FUNCTION public.get_study_deck_due_counts(p_deck_id UUID, p_user_id UUID)
RETURNS TABLE (
  new_count     INTEGER,
  learn_count   INTEGER,
  review_count  INTEGER,
  total_due     INTEGER
) AS $$
  SELECT
    COUNT(*) FILTER (WHERE state = 'new')::INTEGER                              AS new_count,
    COUNT(*) FILTER (WHERE state = 'learn' AND due_at <= NOW())::INTEGER        AS learn_count,
    COUNT(*) FILTER (WHERE state = 'review' AND due_at <= NOW()::DATE + 1)::INTEGER AS review_count,
    COUNT(*) FILTER (
      WHERE (state = 'new')
         OR (state = 'learn'  AND due_at <= NOW())
         OR (state = 'review' AND due_at <= NOW()::DATE + 1)
    )::INTEGER                                                                  AS total_due
  FROM public.study_cards
  WHERE study_deck_id = p_deck_id
    AND user_id       = p_user_id;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- get_session_queue
-- Constructs an ordered list of card IDs for a study session.
-- Enforces daily limits and buries overflow cards.
-- Order: learn (time-sensitive) → review → new
CREATE OR REPLACE FUNCTION public.get_session_queue(
  p_deck_id  UUID,
  p_user_id  UUID
)
RETURNS TABLE (card_id UUID, card_state public.card_study_state)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_settings        deck_study_settings%ROWTYPE;
  v_reviews_today   INTEGER;
  v_new_today       INTEGER;
BEGIN
  -- Load settings for this deck
  SELECT * INTO v_settings
  FROM deck_study_settings
  WHERE study_deck_id = p_deck_id;

  IF NOT FOUND THEN
    RETURN; -- No settings row → no cards served
  END IF;

  -- Count reviews already done today
  SELECT COUNT(*)::INTEGER INTO v_reviews_today
  FROM review_logs
  WHERE study_deck_id = p_deck_id
    AND user_id       = p_user_id
    AND reviewed_at   >= date_trunc('day', NOW() AT TIME ZONE 'UTC');

  -- Count new cards already seen today
  SELECT COUNT(*)::INTEGER INTO v_new_today
  FROM review_logs
  WHERE study_deck_id = p_deck_id
    AND user_id       = p_user_id
    AND state_before  = 'new'
    AND reviewed_at   >= date_trunc('day', NOW() AT TIME ZONE 'UTC');

  -- Return: learn cards due right now (always included, time-sensitive)
  RETURN QUERY
    SELECT sc.id, sc.state
    FROM study_cards sc
    WHERE sc.study_deck_id = p_deck_id
      AND sc.user_id       = p_user_id
      AND sc.state         = 'learn'
      AND sc.due_at        <= NOW()
    ORDER BY sc.due_at ASC;

  -- Return: review cards due today (up to daily limit minus already done)
  RETURN QUERY
    SELECT sc.id, sc.state
    FROM study_cards sc
    WHERE sc.study_deck_id = p_deck_id
      AND sc.user_id       = p_user_id
      AND sc.state         = 'review'
      AND sc.due_at        < (NOW()::DATE + 1)  -- due today or earlier
    ORDER BY sc.due_at ASC
    LIMIT GREATEST(0, v_settings.max_reviews_per_day - v_reviews_today);

  -- Return: new cards (up to daily limit minus already seen today)
  RETURN QUERY
    SELECT sc.id, sc.state
    FROM study_cards sc
    WHERE sc.study_deck_id = p_deck_id
      AND sc.user_id       = p_user_id
      AND sc.state         = 'new'
    ORDER BY
      CASE WHEN v_settings.new_card_order = 'random' THEN random() ELSE sc.position::float END
    LIMIT GREATEST(0, v_settings.new_cards_per_day - v_new_today);
END;
$$;

-- restore_buried_cards
-- Called by daily cron at midnight UTC.
-- Restores buried cards to their pre-burial state.
CREATE OR REPLACE FUNCTION public.restore_buried_cards()
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  UPDATE public.study_cards
  SET state = CASE
    WHEN repetitions = 0 THEN 'new'::public.card_study_state
    WHEN interval_days < 1 THEN 'learn'::public.card_study_state
    ELSE 'review'::public.card_study_state
  END,
  updated_at = NOW()
  WHERE state = 'buried';
$$;

-- ---------------------------------------------------------------------------
-- Denormalized card_count maintenance trigger
-- Keeps study_decks.card_count accurate on insert/delete of study_cards
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_study_card_count_change()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.study_decks
    SET card_count = card_count + 1
    WHERE id = NEW.study_deck_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.study_decks
    SET card_count = GREATEST(0, card_count - 1)
    WHERE id = OLD.study_deck_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER study_card_count_insert
  AFTER INSERT ON public.study_cards
  FOR EACH ROW EXECUTE FUNCTION public.handle_study_card_count_change();

CREATE TRIGGER study_card_count_delete
  AFTER DELETE ON public.study_cards
  FOR EACH ROW EXECUTE FUNCTION public.handle_study_card_count_change();

-- ---------------------------------------------------------------------------
-- Auto-create deck_study_settings when a study_deck is created
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_new_study_deck()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.deck_study_settings (study_deck_id)
  VALUES (NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_study_deck_created
  AFTER INSERT ON public.study_decks
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_study_deck();
