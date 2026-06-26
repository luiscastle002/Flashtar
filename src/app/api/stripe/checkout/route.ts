import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
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
    const priceId = resolveBillingPlan("stripe", interval);
    if (!env.STRIPE_SECRET_KEY || !priceId) {
      return NextResponse.json({ error: `Stripe not configured for interval: ${interval}` }, { status: 500 });
    }

    const { data: subscription } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("user_id", user.id)
      .single();

    const stripe = getStripe();
    let customerId = subscription?.stripe_customer_id;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;

      const adminSupabase = createServiceClient();
      await adminSupabase
        .from("subscriptions")
        .update({ stripe_customer_id: customerId })
        .eq("user_id", user.id);
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${env.NEXT_PUBLIC_APP_URL}/dashboard?checkout=success`,
      cancel_url: `${env.NEXT_PUBLIC_APP_URL}/pricing?checkout=canceled`,
      metadata: { user_id: user.id },
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("Stripe checkout session creation failed:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
