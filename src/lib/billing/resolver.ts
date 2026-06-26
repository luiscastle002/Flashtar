import { getServerEnv } from "@/lib/env";

export type BillingProvider = "paypal" | "stripe" | "paddle";
export type BillingInterval = "monthly" | "annual";

export function resolveBillingPlan(provider: BillingProvider, interval: BillingInterval): string {
  const env = getServerEnv();

  switch (provider) {
    case "paypal":
      if (interval === "annual") {
        return env.PAYPAL_PRO_ANNUAL_PLAN_ID || "";
      }
      return env.PAYPAL_PRO_MONTHLY_PLAN_ID || env.NEXT_PUBLIC_PAYPAL_PRO_PLAN_ID || "";

    case "stripe":
      if (interval === "annual") {
        return env.STRIPE_PRO_ANNUAL_PRICE_ID || "";
      }
      return env.STRIPE_PRO_MONTHLY_PRICE_ID || env.STRIPE_PRO_PRICE_ID || "";

    case "paddle":
      if (interval === "annual") {
        return env.PADDLE_PRO_ANNUAL_PRICE_ID || "";
      }
      return env.PADDLE_PRO_MONTHLY_PRICE_ID || env.NEXT_PUBLIC_PADDLE_PRICE_ID || "";

    default:
      throw new Error(`Unsupported billing provider: ${provider}`);
  }
}
