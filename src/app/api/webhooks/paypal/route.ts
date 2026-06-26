import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { verifyPayPalWebhook } from "@/lib/paypal";
import { createServiceClient } from "@/lib/supabase/admin";
import type { SubscriptionStatus, Plan } from "@/types";
import { resolveBillingPlan } from "@/lib/billing/resolver";

export async function POST(request: Request) {
  const body = await request.text();
  const rawHeaders = await headers();

  // Convert headers map into a plain object
  const headersObj: Record<string, string> = {};
  rawHeaders.forEach((value, key) => {
    headersObj[key] = value;
  });

  const verified = await verifyPayPalWebhook(headersObj, body);
  if (!verified) {
    console.error("[PayPal Webhook] Signature verification failed");
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  let event;
  try {
    event = JSON.parse(body);
  } catch (err) {
    console.error("[PayPal Webhook] Failed to parse payload:", err);
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const eventId = event.id;

  // 1. Guard against duplicate delivery (idempotency check)
  const { data: existingEvent } = await supabase
    .from("webhook_events")
    .select("id")
    .eq("id", eventId)
    .single();

  if (existingEvent) {
    console.log(`[PayPal Webhook] Event ${eventId} already processed.`);
    return NextResponse.json({ received: true });
  }

  // 2. Log webhook event as processed
  await supabase.from("webhook_events").insert({
    id: eventId,
    billing_provider: "paypal",
    event_type: event.event_type,
    payload: event,
    status: "processed",
  });

  const resource = event.resource;
  const subscriptionId = resource.id || resource.billing_agreement_id;

  if (!subscriptionId) {
    console.warn(`[PayPal Webhook] Event ${event.event_type} does not contain subscription ID`);
    return NextResponse.json({ received: true });
  }

  const mapSubscriptionStatus = (paypalStatus: string): SubscriptionStatus => {
    switch (paypalStatus?.toUpperCase()) {
      case "ACTIVE":
        return "active";
      case "SUSPENDED":
        return "past_due";
      case "CANCELLED":
        return "canceled";
      case "EXPIRED":
      case "APPROVAL_PENDING":
      default:
        return "inactive";
    }
  };

  switch (event.event_type) {
    case "BILLING.SUBSCRIPTION.ACTIVATED": {
      const userId = resource.custom_id;
      const customerId = resource.subscriber?.payer_id || null;
      const status = mapSubscriptionStatus(resource.status);

      const isAnnual = resource.plan_id === resolveBillingPlan("paypal", "annual");
      const interval = isAnnual ? "annual" : "monthly";

      // Compute billing cycle period
      const startTime = resource.start_time || resource.status_update_time || new Date().toISOString();
      const periodStart = new Date(startTime).toISOString();
      
      const dateSeed = new Date(startTime);
      if (isAnnual) {
        dateSeed.setFullYear(dateSeed.getFullYear() + 1);
      } else {
        dateSeed.setMonth(dateSeed.getMonth() + 1);
      }
      const periodEnd = dateSeed.toISOString();

      if (userId) {
        console.log("[PayPal Webhook] subscription activated for user:", userId);
        await supabase
          .from("subscriptions")
          .upsert(
            {
              user_id: userId,
              billing_provider: "paypal",
              paypal_customer_id: customerId,
              paypal_subscription_id: subscriptionId,
              plan: "pro" as Plan,
              status,
              billing_interval: interval,
              current_period_start: periodStart,
              current_period_end: periodEnd,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "user_id" }
          );
      }
      break;
    }

    case "BILLING.SUBSCRIPTION.CANCELLED": {
      console.log(`[PayPal Webhook] subscription cancelled: ${subscriptionId}`);
      await supabase
        .from("subscriptions")
        .update({
          status: "canceled",
          updated_at: new Date().toISOString(),
        })
        .eq("paypal_subscription_id", subscriptionId);
      break;
    }

    case "BILLING.SUBSCRIPTION.SUSPENDED": {
      console.log(`[PayPal Webhook] subscription suspended: ${subscriptionId}`);
      await supabase
        .from("subscriptions")
        .update({
          status: "past_due",
          updated_at: new Date().toISOString(),
        })
        .eq("paypal_subscription_id", subscriptionId);
      break;
    }

    case "BILLING.SUBSCRIPTION.EXPIRED":
    case "BILLING.SUBSCRIPTION.CANCELLED_FOR_NON_PAYMENT": {
      console.log(`[PayPal Webhook] subscription expired/terminated: ${subscriptionId}`);
      await supabase
        .from("subscriptions")
        .update({
          plan: "free" as Plan,
          status: "inactive",
          updated_at: new Date().toISOString(),
        })
        .eq("paypal_subscription_id", subscriptionId);
      break;
    }

    case "PAYMENT.SALE.COMPLETED": {
      console.log(`[PayPal Webhook] renewal payment completed: ${subscriptionId}`);

      // Locate user subscription to update boundaries
      const { data: sub } = await supabase
        .from("subscriptions")
        .select("billing_interval, current_period_end")
        .eq("paypal_subscription_id", subscriptionId)
        .single();

      const isAnnual = sub?.billing_interval === "annual";
      const startSeed = sub?.current_period_end ? new Date(sub.current_period_end) : new Date();
      const periodStart = startSeed.toISOString();
      
      const nextDate = new Date(startSeed);
      if (isAnnual) {
        nextDate.setFullYear(nextDate.getFullYear() + 1);
      } else {
        nextDate.setMonth(nextDate.getMonth() + 1);
      }
      const periodEnd = nextDate.toISOString();

      await supabase
        .from("subscriptions")
        .update({
          status: "active",
          plan: "pro" as Plan,
          current_period_start: periodStart,
          current_period_end: periodEnd,
          updated_at: new Date().toISOString(),
        })
        .eq("paypal_subscription_id", subscriptionId);
      break;
    }
  }

  return NextResponse.json({ received: true });
}
