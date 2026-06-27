-- Migration: Create paddle_checkout_sessions table for cross-domain checkout
CREATE TABLE IF NOT EXISTS public.paddle_checkout_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  billing_interval TEXT NOT NULL CHECK (billing_interval IN ('monthly', 'annual')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Enable Row-Level Security
ALTER TABLE public.paddle_checkout_sessions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Users can only insert their own checkout sessions
CREATE POLICY "Users can insert their own checkout sessions" ON public.paddle_checkout_sessions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can only read their own checkout sessions
CREATE POLICY "Users can select their own checkout sessions" ON public.paddle_checkout_sessions
  FOR SELECT USING (auth.uid() = user_id);
