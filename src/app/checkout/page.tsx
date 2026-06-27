import { createServiceClient } from "@/lib/supabase/admin";
import { resolveBillingPlan } from "@/lib/billing/resolver";
import { getServerEnv } from "@/lib/env";
import { getTranslations } from "next-intl/server";
import { CheckoutClient } from "@/components/checkout/checkout-client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, ArrowLeft } from "lucide-react";
import Link from "next/link";

interface CheckoutPageProps {
  searchParams: Promise<{ session_id?: string }>;
}

export default async function CheckoutPage({ searchParams }: CheckoutPageProps) {
  const { session_id: sessionId } = await searchParams;
  const t = await getTranslations("settings");
  
  const envObj = getServerEnv();
  const primaryAppUrl = envObj.NEXT_PUBLIC_APP_URL || "https://flashtar.app";

  if (!sessionId) {
    return renderError(t("toast.paddle_checkout_failed"), primaryAppUrl);
  }

  // Atomic fetch and delete (consume) using the service role client
  const supabase = createServiceClient();
  const { data: session, error } = await supabase
    .from("paddle_checkout_sessions")
    .delete()
    .eq("id", sessionId)
    .gt("created_at", new Date(Date.now() - 10 * 60 * 1000).toISOString())
    .select()
    .single();

  if (error || !session) {
    console.error("[Checkout Page] Session validation failed:", error);
    return renderError(t("toast.paddle_checkout_failed") || "Session invalid or expired.", primaryAppUrl);
  }

  const priceId = resolveBillingPlan("paddle", session.billing_interval as "monthly" | "annual");
  const clientToken = envObj.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN;
  const paddleEnv = envObj.NEXT_PUBLIC_PADDLE_ENV;

  if (!clientToken || !priceId) {
    console.error("[Checkout Page] Paddle environment configuration or price ID is missing:", { clientToken, priceId });
    return renderError(t("toast.paddle_missing_price"), primaryAppUrl);
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4">
      <CheckoutClient
        priceId={priceId}
        userId={session.user_id}
        clientToken={clientToken}
        paddleEnv={paddleEnv}
        primaryAppUrl={primaryAppUrl}
      />
    </div>
  );
}

function renderError(message: string, primaryAppUrl: string) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4">
      <Card className="max-w-md w-full border-destructive/20 bg-card/45 backdrop-blur-md shadow-lg">
        <CardHeader className="text-center pb-4">
          <div className="mx-auto w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center text-destructive mb-3">
            <AlertCircle className="h-6 w-6" />
          </div>
          <CardTitle className="text-xl uppercase font-display tracking-wider text-destructive">
            Checkout Error
          </CardTitle>
          <CardDescription className="text-xs mt-1">
            {message}
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center pt-2">
          <Link
            href={`${primaryAppUrl}/plan`}
            className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
          >
            <ArrowLeft className="h-4 w-4" />
            Return to Plan & Billing
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
