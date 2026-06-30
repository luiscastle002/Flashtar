-- Migration: Add source_type to card_audios
-- Description: Records the text source side for generated audios to decouple source and destination.

ALTER TABLE public.card_audios 
ADD COLUMN IF NOT EXISTS source_type TEXT CHECK (source_type IN ('front', 'back', 'custom'));

-- Migrate existing rows to default to their destination side
UPDATE public.card_audios 
SET source_type = side 
WHERE source_type IS NULL;

-- Set default for new rows and add NOT NULL constraint
ALTER TABLE public.card_audios 
ALTER COLUMN source_type SET DEFAULT 'front',
ALTER COLUMN source_type SET NOT NULL;
