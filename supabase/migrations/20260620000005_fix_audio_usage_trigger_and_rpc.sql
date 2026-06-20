-- Migration: Fix Audio Usage Trigger and Implement Credit Reservation Model
-- Date: 2026-06-20
-- Description: Drops the erroneous generic trigger on audio_usage, adds table-specific last_updated trigger, creates credit reservations table, and implements reservation RPCs.

-- 1. Correct Trigger for audio_usage (Update last_updated instead of updated_at)
DROP TRIGGER IF EXISTS audio_usage_updated_at ON public.audio_usage;

CREATE OR REPLACE FUNCTION public.handle_audio_usage_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.last_updated = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audio_usage_updated_at
  BEFORE UPDATE ON public.audio_usage
  FOR EACH ROW EXECUTE FUNCTION public.handle_audio_usage_updated_at();

-- 2. Define Credit Reservation Status Enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'credit_reservation_status') THEN
    CREATE TYPE public.credit_reservation_status AS ENUM ('reserved', 'committed', 'released');
  END IF;
END$$;

-- 3. Create Audio Credit Reservations Table
CREATE TABLE IF NOT EXISTS public.audio_credit_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  characters_count INTEGER NOT NULL,
  status public.credit_reservation_status NOT NULL DEFAULT 'reserved',
  idempotency_key TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Enable Row-Level Security
ALTER TABLE public.audio_credit_reservations ENABLE ROW LEVEL SECURITY;

-- 5. Create RLS Policies
DROP POLICY IF EXISTS "Users can manage own credit reservations" ON public.audio_credit_reservations;
CREATE POLICY "Users can manage own credit reservations"
  ON public.audio_credit_reservations FOR ALL USING (auth.uid() = user_id);

-- 6. Apply generic updated_at trigger to reservations table
DROP TRIGGER IF EXISTS audio_credit_reservations_updated_at ON public.audio_credit_reservations;
CREATE TRIGGER audio_credit_reservations_updated_at
  BEFORE UPDATE ON public.audio_credit_reservations
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at_generic();

-- 7. Define reserve_audio_credits function
CREATE OR REPLACE FUNCTION public.reserve_audio_credits(
  p_user_id UUID,
  p_chars INT,
  p_idempotency_key TEXT
) RETURNS BOOLEAN AS $$
DECLARE
  v_used INT;
  v_reserved INT;
  v_limit INT;
BEGIN
  -- If reservation already exists with committed or reserved status, return true
  IF EXISTS (
    SELECT 1 FROM public.audio_credit_reservations 
    WHERE idempotency_key = p_idempotency_key AND status IN ('reserved', 'committed')
  ) THEN
    RETURN TRUE;
  END IF;

  -- Get current limit & usage
  SELECT used_this_month, monthly_limit INTO v_used, v_limit
  FROM public.audio_usage WHERE user_id = p_user_id;
  
  IF v_limit IS NULL THEN
    -- Default profile initialization if missing
    INSERT INTO public.audio_usage (user_id) VALUES (p_user_id)
    ON CONFLICT (user_id) DO NOTHING;

    SELECT used_this_month, monthly_limit INTO v_used, v_limit
    FROM public.audio_usage WHERE user_id = p_user_id;
  END IF;

  -- Get active reservations sum
  SELECT COALESCE(SUM(characters_count), 0) INTO v_reserved
  FROM public.audio_credit_reservations
  WHERE user_id = p_user_id AND status = 'reserved';

  IF (v_used + v_reserved + p_chars) > v_limit THEN
    RETURN FALSE; -- Insufficient quota
  END IF;

  -- Insert reservation
  INSERT INTO public.audio_credit_reservations (user_id, characters_count, status, idempotency_key)
  VALUES (p_user_id, p_chars, 'reserved', p_idempotency_key)
  ON CONFLICT (idempotency_key) DO NOTHING;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. Define commit_audio_credits function
CREATE OR REPLACE FUNCTION public.commit_audio_credits(
  p_user_id UUID,
  p_idempotency_key TEXT
) RETURNS BOOLEAN AS $$
DECLARE
  v_chars INT;
BEGIN
  -- Find the reservation
  SELECT characters_count INTO v_chars
  FROM public.audio_credit_reservations
  WHERE user_id = p_user_id AND idempotency_key = p_idempotency_key AND status = 'reserved';

  IF v_chars IS NULL THEN
    -- Return true if already committed
    IF EXISTS (
      SELECT 1 FROM public.audio_credit_reservations 
      WHERE user_id = p_user_id AND idempotency_key = p_idempotency_key AND status = 'committed'
    ) THEN
      RETURN TRUE;
    END IF;
    RETURN FALSE;
  END IF;

  -- Transition status to committed
  UPDATE public.audio_credit_reservations
  SET status = 'committed',
      updated_at = NOW()
  WHERE user_id = p_user_id AND idempotency_key = p_idempotency_key;

  -- Increment usage
  INSERT INTO public.audio_usage (user_id, used_this_month)
  VALUES (p_user_id, v_chars)
  ON CONFLICT (user_id) DO UPDATE SET
    used_this_month = public.audio_usage.used_this_month + v_chars,
    last_updated = NOW();

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9. Define release_audio_credits function
CREATE OR REPLACE FUNCTION public.release_audio_credits(
  p_user_id UUID,
  p_idempotency_key TEXT
) RETURNS BOOLEAN AS $$
BEGIN
  -- Transition status to released if it is currently reserved
  UPDATE public.audio_credit_reservations
  SET status = 'released',
      updated_at = NOW()
  WHERE user_id = p_user_id AND idempotency_key = p_idempotency_key AND status = 'reserved';

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 10. Backwards Compatibility RPCs: increment_audio_usage and decrement_audio_usage
CREATE OR REPLACE FUNCTION public.increment_audio_usage(
  p_user_id UUID,
  p_chars INT
) RETURNS VOID AS $$
BEGIN
  INSERT INTO public.audio_usage (user_id, used_this_month)
  VALUES (p_user_id, p_chars)
  ON CONFLICT (user_id) DO UPDATE SET
    used_this_month = public.audio_usage.used_this_month + p_chars,
    last_updated = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.decrement_audio_usage(
  p_user_id UUID,
  p_chars INT
) RETURNS VOID AS $$
BEGIN
  UPDATE public.audio_usage
  SET used_this_month = GREATEST(0, used_this_month - p_chars),
      last_updated = NOW()
  WHERE user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
