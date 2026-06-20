-- Migration: Audio Generation & Google Drive Integration
-- Date: 2026-06-20
-- Description: Sets up connections, audio files, references, credits tracker, and upload queue.

-- 1. Create Enums if they do not exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'audio_provider') THEN
    CREATE TYPE public.audio_provider AS ENUM ('google-drive', 'dropbox', 'onedrive', 'flashtar-storage');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'audio_source') THEN
    CREATE TYPE public.audio_source AS ENUM ('tts', 'upload', 'import');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'google_connection_status') THEN
    CREATE TYPE public.google_connection_status AS ENUM ('connected', 'expired', 'revoked', 'reconnect_required');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'media_queue_status') THEN
    CREATE TYPE public.media_queue_status AS ENUM ('pending', 'processing', 'completed', 'failed', 'quota_exceeded', 'rate_limited');
  END IF;
END$$;

-- 2. Google Drive Connections Table
CREATE TABLE IF NOT EXISTS public.user_google_drive_connections (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  google_email TEXT NOT NULL,
  encrypted_refresh_token TEXT NOT NULL,
  root_folder_id TEXT,
  audio_folder_id TEXT,
  connection_status public.google_connection_status NOT NULL DEFAULT 'connected',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Audio Files Table (Content-Addressable Storage Metadata)
CREATE TABLE IF NOT EXISTS public.audio_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  audio_hash TEXT NOT NULL,
  provider public.audio_provider NOT NULL DEFAULT 'google-drive',
  file_id TEXT NOT NULL,
  voice_id TEXT NOT NULL,
  language TEXT NOT NULL,
  file_size INTEGER,
  duration_seconds NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_user_audio_hash UNIQUE (user_id, audio_hash)
);

-- 4. Card Audios Reference Table
CREATE TABLE IF NOT EXISTS public.card_audios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flashcard_id UUID NOT NULL REFERENCES public.flashcards(id) ON DELETE CASCADE,
  side TEXT NOT NULL CHECK (side IN ('front', 'back')),
  audio_file_id UUID NOT NULL REFERENCES public.audio_files(id) ON DELETE CASCADE,
  original_filename TEXT,
  normalized_filename TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Audio Usage Tracker (Summary View)
CREATE TABLE IF NOT EXISTS public.audio_usage (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  monthly_limit INTEGER NOT NULL DEFAULT 100000,
  used_this_month INTEGER NOT NULL DEFAULT 0,
  period_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  period_end TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '1 month'),
  last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Audio Usage History (Detailed Transaction Logs)
CREATE TABLE IF NOT EXISTS public.audio_usage_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  characters_consumed INTEGER NOT NULL,
  action_type TEXT NOT NULL CHECK (action_type IN ('tts_generation', 're_sync', 'purchase_extra', 'monthly_grant', 'refund')),
  source_details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Media Upload Queue (APKG Import Processing Queue)
CREATE TABLE IF NOT EXISTS public.media_upload_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  deck_id UUID NOT NULL REFERENCES public.decks(id) ON DELETE CASCADE,
  flashcard_id UUID NOT NULL REFERENCES public.flashcards(id) ON DELETE CASCADE,
  original_filename TEXT NOT NULL,
  normalized_filename TEXT NOT NULL,
  temp_storage_path TEXT NOT NULL, -- Path to Supabase private storage bucket object
  status public.media_queue_status NOT NULL DEFAULT 'pending',
  retry_count INTEGER NOT NULL DEFAULT 0,
  google_rate_limited BOOLEAN NOT NULL DEFAULT FALSE,
  error_message TEXT,
  next_retry_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. Add Indexes
CREATE INDEX IF NOT EXISTS idx_audio_files_user ON public.audio_files(user_id);
CREATE INDEX IF NOT EXISTS idx_audio_files_hash ON public.audio_files(audio_hash);
CREATE INDEX IF NOT EXISTS idx_audio_files_provider_file ON public.audio_files(provider, file_id);

CREATE INDEX IF NOT EXISTS idx_card_audios_flashcard_id ON public.card_audios(flashcard_id);
CREATE INDEX IF NOT EXISTS idx_card_audios_audio_file ON public.card_audios(audio_file_id);
CREATE INDEX IF NOT EXISTS idx_card_audios_normalized ON public.card_audios(normalized_filename);

CREATE INDEX IF NOT EXISTS idx_audio_usage_history_user ON public.audio_usage_history(user_id);

CREATE INDEX IF NOT EXISTS idx_media_upload_queue_worker ON public.media_upload_queue(status, next_retry_at) 
  WHERE status IN ('pending', 'failed', 'rate_limited');
CREATE INDEX IF NOT EXISTS idx_media_upload_queue_user ON public.media_upload_queue(user_id);

-- 9. Triggers for updated_at
CREATE OR REPLACE FUNCTION public.handle_updated_at_generic()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS user_google_drive_connections_updated_at ON public.user_google_drive_connections;
CREATE TRIGGER user_google_drive_connections_updated_at
  BEFORE UPDATE ON public.user_google_drive_connections
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at_generic();

DROP TRIGGER IF EXISTS audio_files_updated_at ON public.audio_files;
CREATE TRIGGER audio_files_updated_at
  BEFORE UPDATE ON public.audio_files
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at_generic();

DROP TRIGGER IF EXISTS card_audios_updated_at ON public.card_audios;
CREATE TRIGGER card_audios_updated_at
  BEFORE UPDATE ON public.card_audios
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at_generic();

DROP TRIGGER IF EXISTS audio_usage_updated_at ON public.audio_usage;
CREATE TRIGGER audio_usage_updated_at
  BEFORE UPDATE ON public.audio_usage
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at_generic();

DROP TRIGGER IF EXISTS audio_usage_history_updated_at ON public.audio_usage_history;
CREATE TRIGGER audio_usage_history_updated_at
  BEFORE UPDATE ON public.audio_usage_history
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at_generic();

DROP TRIGGER IF EXISTS media_upload_queue_updated_at ON public.media_upload_queue;
CREATE TRIGGER media_upload_queue_updated_at
  BEFORE UPDATE ON public.media_upload_queue
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at_generic();

-- 10. Enable Row-Level Security
ALTER TABLE public.user_google_drive_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audio_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.card_audios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audio_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audio_usage_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media_upload_queue ENABLE ROW LEVEL SECURITY;

-- 11. Define Policies
CREATE POLICY "Users can manage own Google Drive connection"
  ON public.user_google_drive_connections FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own audio files"
  ON public.audio_files FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own card audios"
  ON public.card_audios FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.flashcards f
      JOIN public.decks d ON f.deck_id = d.id
      WHERE f.id = flashcard_id AND d.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage own audio usage"
  ON public.audio_usage FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can view own usage history"
  ON public.audio_usage_history FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own upload queue"
  ON public.media_upload_queue FOR ALL USING (auth.uid() = user_id);
