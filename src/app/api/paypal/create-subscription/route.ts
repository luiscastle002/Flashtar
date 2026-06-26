import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { createPayPalSubscription } from "@/lib/paypal";
import { getServerEnv } from "@/lib/env";
import { resolveBillingPlan } from "@/lib/billing/resolver";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const interval = body.interval === "annual" ? "annual" : "monthly";

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const env = getServerEnv();
    const planId = resolveBillingPlan("paypal", interval);
    if (!env.NEXT_PUBLIC_PAYPAL_CLIENT_ID || !planId) {
      return NextResponse.json({ error: `PayPal is not configured for interval: ${interval}` }, { status: 500 });
    }

    const returnUrl = `${env.NEXT_PUBLIC_APP_URL}/settings?checkout=success`;
    const cancelUrl = `${env.NEXT_PUBLIC_APP_URL}/settings?checkout=canceled`;

    const subscription = await createPayPalSubscription(
      user.id,
      user.email || "",
      returnUrl,
      cancelUrl,
      interval
    );

    const approveLink = subscription.links.find((l) => l.rel === "approve");
    if (!approveLink) {
      return NextResponse.json(
        { error: "No approval link returned from PayPal" },
        { status: 500 }
      );
    }

    // Record the subscription ID in the database before redirecting.
    // This allows us to track approval state and prevent race conditions.
    const adminSupabase = createServiceClient();
    const { error: dbError } = await adminSupabase
      .from("subscriptions")
      .upsert(
        {
          user_id: user.id,
          billing_provider: "paypal",
          paypal_subscription_id: subscription.id,
          status: "inactive",
          billing_interval: interval,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );

    if (dbError) {
      console.error("[PayPal API] Failed to record subscription in DB:", dbError);
      return NextResponse.json({ error: "Database error occurred" }, { status: 500 });
    }

    return NextResponse.json({
      url: approveLink.href,
      subscriptionId: subscription.id,
    });
  } catch (error) {
    console.error("[PayPal API] Subscription creation error:", error);
    const message = error instanceof Error ? error.message : "Failed to create subscription";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
