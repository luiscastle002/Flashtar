-- Migration: Add billing_interval to subscriptions table
ALTER TABLE public.subscriptions
ADD COLUMN IF NOT EXISTS billing_interval TEXT CHECK (billing_interval IN ('monthly', 'annual')) DEFAULT 'monthly';
