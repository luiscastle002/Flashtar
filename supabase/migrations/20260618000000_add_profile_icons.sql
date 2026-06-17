-- Migration: 20260618000000_add_profile_icons.sql
-- Add custom avatar columns to profiles and configure the profile-icons bucket.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_type TEXT NOT NULL DEFAULT 'google' CHECK (avatar_type IN ('google', 'custom')),
  ADD COLUMN IF NOT EXISTS custom_avatar_path TEXT;

-- Create storage bucket for profile-icons
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'profile-icons',
  'profile-icons',
  true,
  102400, -- 100KB limit
  ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET 
  public = true,
  file_size_limit = 102400,
  allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];

-- Storage RLS policies for profile-icons
CREATE POLICY "Public read access for profile-icons"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'profile-icons');

CREATE POLICY "Users can upload their own profile picture"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'profile-icons' 
    AND name = auth.uid()::text || '.webp'
  );

CREATE POLICY "Users can update their own profile picture"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'profile-icons' 
    AND name = auth.uid()::text || '.webp'
  );

CREATE POLICY "Users can delete their own profile picture"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'profile-icons' 
    AND name = auth.uid()::text || '.webp'
  );
