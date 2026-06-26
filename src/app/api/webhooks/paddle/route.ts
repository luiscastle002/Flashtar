import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getPaddle } from "@/lib/paddle";
import { createServiceClient } from "@/lib/supabase/admin";
import { getServerEnv } from "@/lib/env";
import type { SubscriptionStatus, Plan } from "@/types";

export async function POST(request: Request) {
  const body = await request.text();
  const signature = (await headers()).get("paddle-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  const env = getServerEnv();
  if (!env.PADDLE_WEBHOOK_SECRET_KEY) {
    return NextResponse.json({ error: "Paddle webhook not configured" }, { status: 500 });
  }

  const paddle = getPaddle();
  let event;
  try {
    event = await paddle.webhooks.unmarshal(body, env.PADDLE_WEBHOOK_SECRET_KEY, signature);
  } catch (err) {
    console.error("Paddle Webhook verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Helper map to convert Paddle status values to our database SubscriptionStatus enum
  const mapSubscriptionStatus = (paddleStatus: string): SubscriptionStatus => {
    switch (paddleStatus) {
      case "active":
        return "active";
      case "trialing":
        return "trialing";
      case "past_due":
        return "past_due";
      case "canceled":
        return "canceled";
      case "paused":
      default:
        return "inactive";
    }
  };

  switch (event.eventType) {
    case "transaction.completed": {
      const data = event.data;
      // Occurs when a checkout or payment completes. If it represents a subscription,
      // associate the user_id (via custom_data) with the paddle subscription identifier.
      const userId = data.customData?.userId ?? data.customData?.user_id;
      const subscriptionId = data.subscriptionId;
      const customerId = data.customerId;

      if (userId && subscriptionId) {
        console.log("[Paddle Webhook] transaction.completed payload:", { userId, customerId, subscriptionId });
        const { data: dbData, error } = await supabase
          .from("subscriptions")
          .upsert(
            {
              user_id: userId,
              billing_provider: "paddle",
              paddle_customer_id: customerId,
              paddle_subscription_id: subscriptionId,
            },
            { onConflict: "user_id" }
          );
        if (error) {
          console.error("[Paddle Webhook] transaction.completed DB Error:", error);
        } else {
          console.log("[Paddle Webhook] transaction.completed DB Success:", dbData);
        }
      }
      break;
    }

    case "subscription.created": {
      const data = event.data;
      const userId = data.customData?.userId ?? data.customData?.user_id;
      const customerId = data.customerId;
      const subscriptionId = data.id;
      const status = mapSubscriptionStatus(data.status);
      const isActive = data.status === "active" || data.status === "trialing";
      const isAnnual = data.billingCycle?.interval === "year";
      const billingInterval = isAnnual ? "annual" : "monthly";

      if (userId) {
        console.log("[Paddle Webhook] subscription.created payload:", { userId, customerId, subscriptionId, status, isActive });
        const { data: dbData, error } = await supabase
          .from("subscriptions")
          .upsert(
            {
              user_id: userId,
              billing_provider: "paddle",
              paddle_customer_id: customerId,
              paddle_subscription_id: subscriptionId,
              status,
              plan: (isActive ? "pro" : "free") as Plan,
              billing_interval: billingInterval,
              current_period_end: data.currentBillingPeriod?.endsAt
                ? new Date(data.currentBillingPeriod.endsAt).toISOString()
                : null,
            },
            { onConflict: "user_id" }
          );
        if (error) {
          console.error("[Paddle Webhook] subscription.created DB Error:", error);
        } else {
          console.log("[Paddle Webhook] subscription.created DB Success:", dbData);
        }
      }
      break;
    }

    case "subscription.activated": {
      const data = event.data;
      const userId = data.customData?.userId ?? data.customData?.user_id;
      const customerId = data.customerId;
      const subscriptionId = data.id;
      const periodEnd = data.currentBillingPeriod?.endsAt;
      const isAnnual = data.billingCycle?.interval === "year";
      const billingInterval = isAnnual ? "annual" : "monthly";

      if (userId) {
        console.log("[Paddle Webhook] subscription.activated payload:", { userId, customerId, subscriptionId, periodEnd });
        const { data: dbData, error } = await supabase
          .from("subscriptions")
          .upsert(
            {
              user_id: userId,
              billing_provider: "paddle",
              paddle_customer_id: customerId,
              paddle_subscription_id: subscriptionId,
              plan: "pro",
              status: "active",
              billing_interval: billingInterval,
              current_period_end: periodEnd ? new Date(periodEnd).toISOString() : null,
            },
            { onConflict: "user_id" }
          );
        if (error) {
          console.error("[Paddle Webhook] subscription.activated DB Error:", error);
        } else {
          console.log("[Paddle Webhook] subscription.activated DB Success:", dbData);
        }
      } else {
        // Fallback if customData isn't carried (e.g. from historical contexts or other channels)
        console.log("[Paddle Webhook] subscription.activated fallback. No user_id, updating by paddle_subscription_id:", subscriptionId);
        const { data: dbData, error } = await supabase
          .from("subscriptions")
          .update({
            plan: "pro",
            status: "active",
            billing_interval: billingInterval,
            current_period_end: periodEnd ? new Date(periodEnd).toISOString() : null,
          })
          .eq("paddle_subscription_id", subscriptionId);
        if (error) {
          console.error("[Paddle Webhook] subscription.activated fallback DB Error:", error);
        } else {
          console.log("[Paddle Webhook] subscription.activated fallback DB Success:", dbData);
        }
      }
      break;
    }

    case "subscription.updated": {
      const data = event.data;
      const subscriptionId = data.id;
      const periodEnd = data.currentBillingPeriod?.endsAt;
      const status = mapSubscriptionStatus(data.status);
      const isActive = data.status === "active" || data.status === "trialing";
      const isAnnual = data.billingCycle?.interval === "year";
      const billingInterval = isAnnual ? "annual" : "monthly";

      await supabase
        .from("subscriptions")
        .update({
          plan: (isActive ? "pro" : "free") as Plan,
          status,
          billing_interval: billingInterval,
          current_period_end: periodEnd ? new Date(periodEnd).toISOString() : null,
        })
        .eq("paddle_subscription_id", subscriptionId);
      break;
    }

    case "subscription.canceled": {
      const data = event.data;
      const subscriptionId = data.id;
      await supabase
        .from("subscriptions")
        .update({
          plan: "free",
          status: "canceled",
        })
        .eq("paddle_subscription_id", subscriptionId);
      break;
    }
  }

  return NextResponse.json({ received: true });
}
