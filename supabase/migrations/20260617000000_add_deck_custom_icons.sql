-- Add custom icon columns to study_decks
ALTER TABLE public.study_decks
  ADD COLUMN icon_type TEXT NOT NULL DEFAULT 'emoji' CHECK (icon_type IN ('emoji', 'image')),
  ADD COLUMN custom_icon_path TEXT;

-- Create storage bucket for deck-icons
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'deck-icons',
  'deck-icons',
  true,
  102400, -- 100KB limit
  ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET 
  public = true,
  file_size_limit = 102400,
  allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];

-- Enable RLS for the bucket's storage objects (handled globally by Supabase, but policies are needed)
CREATE POLICY "Public read access for deck-icons"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'deck-icons');

CREATE POLICY "Users can upload their own deck-icons"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'deck-icons' 
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can update their own deck-icons"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'deck-icons' 
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can delete their own deck-icons"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'deck-icons' 
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
