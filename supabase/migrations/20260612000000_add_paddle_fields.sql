-- Migration: Add Paddle-specific columns to subscriptions to support coexistence
ALTER TABLE public.subscriptions 
ADD COLUMN billing_provider TEXT NOT NULL DEFAULT 'stripe' CHECK (billing_provider IN ('stripe', 'paddle')),
ADD COLUMN paddle_customer_id TEXT UNIQUE,
ADD COLUMN paddle_subscription_id TEXT UNIQUE;

-- Add indexes for performance optimization during Paddle webhook operations
CREATE INDEX idx_subscriptions_paddle_customer ON public.subscriptions(paddle_customer_id);
CREATE INDEX idx_subscriptions_paddle_sub ON public.subscriptions(paddle_subscription_id);
