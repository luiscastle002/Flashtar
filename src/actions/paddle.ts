"use server";

import { getPaddle } from "@/lib/paddle";
import { getCurrentUser, getSubscription } from "@/lib/queries/user";
import { createServiceClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { getServerEnv } from "@/lib/env";

/**
 * Cancels an active Paddle subscription at the end of the billing period
 */
export async function cancelPaddleSubscription() {
  const user = await getCurrentUser();
  if (!user) return { error: "errors.auth.not_authenticated" };

  const subscription = await getSubscription(user.id);
  if (
    !subscription ||
    subscription.billing_provider !== "paddle" ||
    !subscription.paddle_subscription_id
  ) {
    return { error: "errors.billing.no_paddle_subscription" };
  }

  try {
    const paddle = getPaddle();
    await paddle.subscriptions.cancel(subscription.paddle_subscription_id, {
      effectiveFrom: "next_billing_period",
    });

    const supabase = createServiceClient();
    await supabase
      .from("subscriptions")
      .update({ status: "canceled" })
      .eq("user_id", user.id);

    revalidatePath("/settings");
    return { success: true };
  } catch (error) {
    console.error("Failed to cancel Paddle subscription:", error);
    const message = error instanceof Error ? error.message : "errors.billing.cancel_failed";
    return { error: message };
  }
}

/**
 * Generates an update transaction ID to allow users to update their credit card details via Paddle checkout overlay
 */
export async function getPaddleUpdateTx() {
  const user = await getCurrentUser();
  if (!user) return { error: "errors.auth.not_authenticated" };

  const subscription = await getSubscription(user.id);
  if (
    !subscription ||
    subscription.billing_provider !== "paddle" ||
    !subscription.paddle_subscription_id
  ) {
    return { error: "errors.billing.no_paddle_subscription" };
  }

  try {
    const paddle = getPaddle();
    const transaction = await paddle.subscriptions.getPaymentMethodChangeTransaction(
      subscription.paddle_subscription_id
    );
    return { transactionId: transaction.id };
  } catch (error) {
    console.error("Failed to generate payment update transaction:", error);
    const message = error instanceof Error ? error.message : "errors.billing.update_link_failed";
    return { error: message };
  }
}

/**
 * Initiates cross-domain Paddle checkout by generating a single-use database session
 */
export async function initiatePaddleCheckout(interval: "monthly" | "annual", locale: string) {
  const user = await getCurrentUser();
  if (!user) return { error: "errors.auth.not_authenticated" };

  try {
    const supabase = createServiceClient();
    const { data: session, error } = await supabase
      .from("paddle_checkout_sessions")
      .insert({
        user_id: user.id,
        billing_interval: interval,
      })
      .select()
      .single();

    if (error || !session) {
      console.error("Failed to create temporary paddle checkout session:", error);
      return { error: "errors.billing.paddle_checkout_failed" };
    }

    const envObj = getServerEnv();
    const checkoutDomain = envObj.NEXT_PUBLIC_PADDLE_CHECKOUT_DOMAIN || envObj.NEXT_PUBLIC_APP_URL;
    const checkoutUrl = `${checkoutDomain}/api/checkout/initiate?session_id=${session.id}&locale=${locale}`;

    return { checkoutUrl };
  } catch (error) {
    console.error("Failed to initiate Paddle checkout:", error);
    return { error: "errors.billing.paddle_checkout_failed" };
  }
}

