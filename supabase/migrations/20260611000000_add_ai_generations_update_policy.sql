-- Migration to add the missing UPDATE policy for ai_generations table
-- This allows authenticated users to update their own AI generation records (e.g. from 'processing' to 'completed' or 'failed')

CREATE POLICY "Users can update own generations"
  ON public.ai_generations
  FOR UPDATE
  USING (auth.uid() = user_id);
