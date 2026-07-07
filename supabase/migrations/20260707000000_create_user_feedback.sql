-- Create user_feedback table
CREATE TABLE IF NOT EXISTS public.user_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    path TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.user_feedback ENABLE ROW LEVEL SECURITY;

-- Policy: Allow authenticated users to insert their own feedback
CREATE POLICY "Users can insert their own feedback" ON public.user_feedback
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

-- Add comments for documentation
COMMENT ON TABLE public.user_feedback IS 'Stores feedback collected from users via the Black Hole Companion.';
COMMENT ON COLUMN public.user_feedback.user_id IS 'References the user who submitted the feedback.';
COMMENT ON COLUMN public.user_feedback.content IS 'The text feedback content.';
COMMENT ON COLUMN public.user_feedback.path IS 'The page pathname where the feedback was submitted.';
COMMENT ON COLUMN public.user_feedback.metadata IS 'JSON metadata capturing browser, screen, and future AI fields.';
