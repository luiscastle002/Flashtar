-- Migration: Add preferred_language to profiles table with CHECK constraint
ALTER TABLE public.profiles
ADD COLUMN preferred_language TEXT DEFAULT 'en'
CONSTRAINT check_preferred_language CHECK (preferred_language = ANY (ARRAY['en'::text, 'es'::text, 'pt'::text, 'ja'::text]));
