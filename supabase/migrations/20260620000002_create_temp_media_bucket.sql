-- Migration: Create temp-media-imports storage bucket
-- Date: 2026-06-20
-- Description: Sets up the private storage bucket for staging APKG media uploads with user-level security policies.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'temp-media-imports',
  'temp-media-imports',
  false,
  52428800, -- 50MB limit
  ARRAY['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/x-m4a']
)
ON CONFLICT (id) DO UPDATE
SET 
  public = false,
  file_size_limit = 52428800,
  allowed_mime_types = ARRAY['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/x-m4a'];

-- Enable RLS and define policies for temp-media-imports
-- Note: storage.objects policies apply to objects inside the bucket

DROP POLICY IF EXISTS "Users can upload their own temp media imports" ON storage.objects;
CREATE POLICY "Users can upload their own temp media imports"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'temp-media-imports' 
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users can view their own temp media imports" ON storage.objects;
CREATE POLICY "Users can view their own temp media imports"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'temp-media-imports' 
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users can update their own temp media imports" ON storage.objects;
CREATE POLICY "Users can update their own temp media imports"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'temp-media-imports' 
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users can delete their own temp media imports" ON storage.objects;
CREATE POLICY "Users can delete their own temp media imports"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'temp-media-imports' 
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
