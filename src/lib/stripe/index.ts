import Stripe from "stripe";
import { getServerEnv } from "@/lib/env";

let stripeInstance: Stripe | null = null;

export function getStripe(): Stripe {
  if (!stripeInstance) {
    const env = getServerEnv();
    if (!env.STRIPE_SECRET_KEY) {
      throw new Error("STRIPE_SECRET_KEY is not configured");
    }
    stripeInstance = new Stripe(env.STRIPE_SECRET_KEY, {
      apiVersion: "2025-08-27.basil",
      typescript: true,
    });
  }
  return stripeInstance;
}

export const PLANS = {
  free: {
    name: "Free",
    price: 0,
    features: [
      "3 AI deck generations per month",
      "Up to 50 cards per deck",
      "Deck editing",
      "CSV export",
    ],
  },
  pro: {
    name: "Pro",
    price: 12,
    features: [
      "Unlimited AI generations",
      "Up to 500 cards per deck",
      "Priority generation",
      "APKG export",
      "Advanced AI options",
    ],
  },
} as const;
