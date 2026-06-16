-- Migration: 20260616000000_add_saved_prompts.sql
-- Creates the saved_prompts table for users to manage custom prompt templates.

CREATE TABLE IF NOT EXISTS public.saved_prompts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL CHECK (char_length(name) >= 1),
    content TEXT NOT NULL CHECK (char_length(content) <= 5000),
    is_favorite BOOLEAN NOT NULL DEFAULT FALSE,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Optimize queries for retrieving prompts by user, sorted by favorite status
CREATE INDEX IF NOT EXISTS idx_saved_prompts_user 
ON public.saved_prompts(user_id, is_favorite DESC, created_at DESC);

-- Ensure only one default prompt per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_saved_prompts_single_default
ON public.saved_prompts(user_id)
WHERE is_default = TRUE;

-- Enable Row Level Security
ALTER TABLE public.saved_prompts ENABLE ROW LEVEL SECURITY;

-- Enable CRUD policies
CREATE POLICY "Users can view own prompts" 
    ON public.saved_prompts FOR SELECT 
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own prompts" 
    ON public.saved_prompts FOR INSERT 
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own prompts" 
    ON public.saved_prompts FOR UPDATE 
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own prompts" 
    ON public.saved_prompts FOR DELETE 
    USING (auth.uid() = user_id);

-- Register trigger for updated_at column automatic tracking
CREATE OR REPLACE TRIGGER saved_prompts_updated_at
    BEFORE UPDATE ON public.saved_prompts
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
