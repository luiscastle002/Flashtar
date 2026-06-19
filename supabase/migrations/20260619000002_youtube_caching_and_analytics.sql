-- Migration: 20260619000002_youtube_caching_and_analytics.sql
-- Create caching and analytics tables for YouTube transcript pipeline

-- 1. Create youtube_transcript_cache table
CREATE TABLE IF NOT EXISTS public.youtube_transcript_cache (
  video_id TEXT NOT NULL,
  language TEXT NOT NULL,
  content TEXT NOT NULL,
  segments JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (video_id, language)
);

-- Enable RLS for youtube_transcript_cache
ALTER TABLE public.youtube_transcript_cache ENABLE ROW LEVEL SECURITY;

-- RLS Policies for youtube_transcript_cache
CREATE POLICY "Allow authenticated read cache" ON public.youtube_transcript_cache
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated insert cache" ON public.youtube_transcript_cache
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Allow authenticated update cache" ON public.youtube_transcript_cache
  FOR UPDATE TO authenticated USING (true);

-- 2. Create youtube_import_analytics table
CREATE TABLE IF NOT EXISTS public.youtube_import_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  attempts INT NOT NULL DEFAULT 1,
  success BOOLEAN NOT NULL,
  duration_ms INT NOT NULL,
  error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS for youtube_import_analytics
ALTER TABLE public.youtube_import_analytics ENABLE ROW LEVEL SECURITY;

-- RLS Policies for youtube_import_analytics
CREATE POLICY "Allow authenticated insert analytics" ON public.youtube_import_analytics
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Allow users to read their own analytics" ON public.youtube_import_analytics
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
