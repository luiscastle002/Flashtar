"use server";

import { getPaddle } from "@/lib/paddle";
import { getCurrentUser, getSubscription } from "@/lib/queries/user";
import { createServiceClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

/**
 * Cancels an active Paddle subscription at the end of the billing period
 */
export async function cancelPaddleSubscription() {
  const user = await getCurrentUser();
  if (!user) return { error: "Not authenticated" };

  const subscription = await getSubscription(user.id);
  if (
    !subscription ||
    subscription.billing_provider !== "paddle" ||
    !subscription.paddle_subscription_id
  ) {
    return { error: "No active Paddle subscription found" };
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
    const message = error instanceof Error ? error.message : "Failed to cancel subscription";
    return { error: message };
  }
}

/**
 * Generates an update transaction ID to allow users to update their credit card details via Paddle checkout overlay
 */
export async function getPaddleUpdateTx() {
  const user = await getCurrentUser();
  if (!user) return { error: "Not authenticated" };

  const subscription = await getSubscription(user.id);
  if (
    !subscription ||
    subscription.billing_provider !== "paddle" ||
    !subscription.paddle_subscription_id
  ) {
    return { error: "No active Paddle subscription found" };
  }

  try {
    const paddle = getPaddle();
    const transaction = await paddle.subscriptions.getPaymentMethodChangeTransaction(
      subscription.paddle_subscription_id
    );
    return { transactionId: transaction.id };
  } catch (error) {
    console.error("Failed to generate payment update transaction:", error);
    const message = error instanceof Error ? error.message : "Failed to generate update link";
    return { error: message };
  }
}
