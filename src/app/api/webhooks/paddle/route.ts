import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getPaddle } from "@/lib/paddle";
import { Webhooks } from "@paddle/paddle-node-sdk";
import { createServiceClient } from "@/lib/supabase/admin";
import { getServerEnv } from "@/lib/env";
import type { SubscriptionStatus, Plan } from "@/types";

interface PaddleWebhookBody {
  event_id?: string;
  notification_id?: string;
  event_type?: string;
}

export async function POST(request: Request) {
  const body = await request.text();
  const signature = (await headers()).get("paddle-signature");
  const supabase = createServiceClient();

  // Safely parse body JSON to extract event details for logging and idempotency
  let rawEvent: PaddleWebhookBody | null = null;
  try {
    rawEvent = JSON.parse(body) as PaddleWebhookBody;
  } catch {
    // Ignore JSON parsing issues; unmarshal or validation will catch malformed bodies
  }

  const eventId = rawEvent?.event_id || rawEvent?.notification_id || `pad_failed_${Date.now()}`;
  const eventType = rawEvent?.event_type || "unknown";

  // Guard against duplicate webhook deliveries (idempotency check)
  const { data: existingEvent } = await supabase
    .from("webhook_events")
    .select("id")
    .eq("id", eventId)
    .single();

  if (existingEvent) {
    console.log(`[Paddle Webhook] Event ${eventId} already processed.`);
    return NextResponse.json({ received: true });
  }

  if (!signature) {
    await supabase.from("webhook_events").insert({
      id: eventId,
      billing_provider: "paddle",
      event_type: eventType,
      payload: rawEvent || { body },
      status: "failed",
      error_log: "Missing signature header",
    });
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  const env = getServerEnv();
  if (!env.PADDLE_WEBHOOK_SECRET_KEY) {
    await supabase.from("webhook_events").insert({
      id: eventId,
      billing_provider: "paddle",
      event_type: eventType,
      payload: rawEvent || { body },
      status: "failed",
      error_log: "Paddle webhook secret key not configured",
    });
    return NextResponse.json({ error: "Paddle webhook not configured" }, { status: 500 });
  }

  const paddle = getPaddle();
  let event;
  try {
    event = await paddle.webhooks.unmarshal(body, env.PADDLE_WEBHOOK_SECRET_KEY, signature);
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[Paddle Webhook] Signature verification failed:", err);
    if (process.env.NODE_ENV === "development") {
      console.warn("[Paddle Webhook] DEVELOPMENT MODE: Bypassing signature verification failure.");
      try {
        event = Webhooks.fromJson(rawEvent as unknown as Parameters<typeof Webhooks.fromJson>[0]);
      } catch (parseErr: unknown) {
        const parseErrMsg = parseErr instanceof Error ? parseErr.message : String(parseErr);
        await supabase.from("webhook_events").insert({
          id: eventId,
          billing_provider: "paddle",
          event_type: eventType,
          payload: rawEvent || { body },
          status: "failed",
          error_log: `Signature verification failed: ${errMsg}. Fallback unmarshal failed: ${parseErrMsg}`,
        });
        return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
      }
    } else {
      await supabase.from("webhook_events").insert({
        id: eventId,
        billing_provider: "paddle",
        event_type: eventType,
        payload: rawEvent || { body },
        status: "failed",
        error_log: errMsg,
      });
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }
  }

  // Log successfully unmarshalled webhook event
  await supabase.from("webhook_events").insert({
    id: event.eventId,
    billing_provider: "paddle",
    event_type: event.eventType,
    payload: rawEvent || event,
    status: "processed",
  });

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

  try {
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
          const { error } = await supabase
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
            throw new Error(`DB Error in transaction.completed: ${JSON.stringify(error)}`);
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
          const { error } = await supabase
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
            throw new Error(`DB Error in subscription.created: ${JSON.stringify(error)}`);
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
          const { error } = await supabase
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
            throw new Error(`DB Error in subscription.activated: ${JSON.stringify(error)}`);
          }
        } else {
          // Fallback if customData isn't carried (e.g. from historical contexts or other channels)
          console.log("[Paddle Webhook] subscription.activated fallback. No user_id, updating by paddle_subscription_id:", subscriptionId);
          const { error } = await supabase
            .from("subscriptions")
            .update({
              plan: "pro",
              status: "active",
              billing_interval: billingInterval,
              current_period_end: periodEnd ? new Date(periodEnd).toISOString() : null,
            })
            .eq("paddle_subscription_id", subscriptionId);
          if (error) {
            throw new Error(`DB Error in subscription.activated fallback: ${JSON.stringify(error)}`);
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

        const { error } = await supabase
          .from("subscriptions")
          .update({
            plan: (isActive ? "pro" : "free") as Plan,
            status,
            billing_interval: billingInterval,
            current_period_end: periodEnd ? new Date(periodEnd).toISOString() : null,
          })
          .eq("paddle_subscription_id", subscriptionId);
        if (error) {
          throw new Error(`DB Error in subscription.updated: ${JSON.stringify(error)}`);
        }
        break;
      }

      case "subscription.canceled": {
        const data = event.data;
        const subscriptionId = data.id;
        const { error } = await supabase
          .from("subscriptions")
          .update({
            plan: "free",
            status: "canceled",
          })
          .eq("paddle_subscription_id", subscriptionId);
        if (error) {
          throw new Error(`DB Error in subscription.canceled: ${JSON.stringify(error)}`);
        }
        break;
      }
    }
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[Paddle Webhook] Exception during webhook processing:", err);
    await supabase
      .from("webhook_events")
      .update({
        status: "failed",
        error_log: `Exception: ${errMsg}`,
      })
      .eq("id", event?.eventId || eventId);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
