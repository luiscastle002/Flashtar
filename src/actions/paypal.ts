"use server";

import { cancelPayPalSubscription as cancelPayPalSub } from "@/lib/paypal";
import { getCurrentUser, getSubscription } from "@/lib/queries/user";
import { createServiceClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

/**
 * Cancels an active PayPal subscription
 */
export async function cancelPayPalSubscription() {
  const user = await getCurrentUser();
  if (!user) return { error: "errors.auth.not_authenticated" };

  const subscription = await getSubscription(user.id);
  if (
    !subscription ||
    subscription.billing_provider !== "paypal" ||
    !subscription.paypal_subscription_id
  ) {
    return { error: "No active PayPal subscription found" };
  }

  const res = await cancelPayPalSub(subscription.paypal_subscription_id);
  if (!res.success) {
    return { error: res.error || "Failed to cancel PayPal subscription" };
  }

  try {
    const supabase = createServiceClient();
    const { error: dbError } = await supabase
      .from("subscriptions")
      .update({ status: "canceled", updated_at: new Date().toISOString() })
      .eq("user_id", user.id);

    if (dbError) {
      console.error("Failed to update cancel status in DB:", dbError);
      return { error: "Failed to update cancellation status in database" };
    }

    revalidatePath("/settings");
    return { success: true };
  } catch (error) {
    console.error("PayPal cancellation DB update exception:", error);
    return { error: "An unexpected error occurred during database update" };
  }
}
