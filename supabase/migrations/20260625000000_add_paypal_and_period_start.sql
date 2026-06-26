-- Migration: Add PayPal columns and current_period_start column, update billing_provider check constraint

-- 1. Add current_period_start
ALTER TABLE public.subscriptions
ADD COLUMN IF NOT EXISTS current_period_start TIMESTAMPTZ;

-- 2. Add PayPal columns
ALTER TABLE public.subscriptions
ADD COLUMN IF NOT EXISTS paypal_customer_id TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS paypal_subscription_id TEXT UNIQUE;

-- 3. Update check constraint for billing_provider
-- Drop old constraint if named standardly
ALTER TABLE public.subscriptions
DROP CONSTRAINT IF EXISTS subscriptions_billing_provider_check;

-- Add updated constraint allowing paypal
ALTER TABLE public.subscriptions
ADD CONSTRAINT subscriptions_billing_provider_check
CHECK (billing_provider IN ('stripe', 'paddle', 'paypal'));

-- 4. Retroactively populate current_period_start for existing subscriptions
UPDATE public.subscriptions
SET current_period_start = COALESCE(
  current_period_end - INTERVAL '1 month',
  created_at
)
WHERE current_period_start IS NULL;

-- 5. Add indexes for PayPal subscription query performance
CREATE INDEX IF NOT EXISTS idx_subscriptions_paypal_customer ON public.subscriptions(paypal_customer_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_paypal_sub ON public.subscriptions(paypal_subscription_id);
