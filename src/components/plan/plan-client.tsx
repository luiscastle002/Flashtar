"use client";

import { useState } from "react";
import { Check, X, Sparkles, CreditCard, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cancelPayPalSubscription } from "@/actions/paypal";
import { initiatePaddleCheckout, cancelPaddleSubscription } from "@/actions/paddle";
import { toast } from "sonner";
import { useLocale, useTranslations, useFormatter } from "next-intl";
import { translateError } from "@/lib/i18n/utils";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import type { Subscription } from "@/types";

interface PlanClientProps {
  subscription: Subscription | null;
}

export function PlanClient({ subscription }: PlanClientProps) {
  const t = useTranslations("plan_page");
  const tRoot = useTranslations();
  const router = useRouter();
  const locale = useLocale();
  const format = useFormatter();
  const [canceling, setCanceling] = useState(false);
  const [loadingCheckout, setLoadingCheckout] = useState(false);

  const plan = subscription?.plan ?? "free";
  const status = subscription?.status ?? "inactive";
  const [activeInterval, setActiveInterval] = useState<"monthly" | "annual">("monthly");

  const isProCanceled = plan === "pro" && status === "canceled";

  async function handleCancel() {
    if (!window.confirm(tRoot("settings.toast.cancel_confirm") || "Are you sure you want to cancel your subscription?")) return;
    setCanceling(true);
    try {
      let res;
      if (subscription?.billing_provider === "paypal") {
        res = await cancelPayPalSubscription();
      } else {
        res = await cancelPaddleSubscription();
      }

      if (res.error) {
        toast.error(translateError(res.error, tRoot) || "Failed to cancel subscription.");
      } else {
        toast.success(tRoot("settings.toast.cancel_success") || "Subscription cancelled successfully.");
        router.refresh();
      }
    } catch (error) {
      console.error("Cancellation failed:", error);
      toast.error("An error occurred during cancellation.");
    } finally {
      setCanceling(false);
    }
  }

  async function handlePaddleCheckout() {
    setLoadingCheckout(true);
    try {
      const res = await initiatePaddleCheckout(activeInterval, locale);
      if (res.error) {
        toast.error(translateError(res.error, tRoot) || tRoot("settings.toast.paddle_checkout_failed"));
      } else if (res.checkoutUrl) {
        window.location.href = res.checkoutUrl;
      }
    } catch (error) {
      console.error("Paddle checkout initiation failed:", error);
      toast.error(tRoot("settings.toast.paddle_checkout_failed"));
    } finally {
      setLoadingCheckout(false);
    }
  }

  const featuresList = [
    {
      key: "decks_limit",
      label: t("feature_title_decks"),
      free: "3 Decks",
      pro: t("feature_unlimited"),
      isImportant: true,
    },
    {
      key: "cards_limit",
      label: t("feature_cards_deck"),
      free: "50 Cards",
      pro: t("feature_unlimited"),
      isImportant: true,
    },
    {
      key: "ai_decks",
      label: t("feature_ai_decks"),
      free: "3 / month",
      pro: t("feature_unlimited"),
      isImportant: true,
    },
    {
      key: "priority_generation",
      label: t("feature_priority_gen"),
      free: false,
      pro: true,
      isImportant: false,
    },
    {
      key: "media_uploads",
      label: t("feature_media_upload"),
      free: false,
      pro: true,
      isImportant: false,
    },
  ];

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* Page Title */}
      <div className="flex flex-col space-y-2">
        <h1 className="text-3xl font-bold font-display uppercase tracking-widest gradient-text self-start">
          {t("title")}
        </h1>
        <p className="text-muted-foreground text-sm max-w-xl">
          {t("subtitle")}
        </p>
      </div>

      {/* Current Plan Banner */}
      <Card className="border-primary/20 bg-card/45 backdrop-blur-md shadow-lg">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 font-display text-lg uppercase tracking-wider">
              <CreditCard className="h-5 w-5 text-primary" />
              {t("current_plan_badge")}
            </CardTitle>
            <CardDescription className="text-xs">
              {subscription?.billing_provider && (
                <span>
                  Billing via <strong className="capitalize">{subscription.billing_provider}</strong>
                </span>
              )}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "px-3 py-1 text-xs font-display uppercase tracking-wider font-bold rounded-full border",
                plan === "pro"
                  ? "bg-primary/10 text-primary border-primary/20"
                  : "bg-muted text-muted-foreground border-border"
              )}
            >
              {plan === "pro" ? t("pro_title") : t("free_title")}
            </span>
            {subscription?.status && (
              <span className="text-xs text-muted-foreground capitalize border border-border px-2 py-0.5 rounded-md bg-muted/40">
                {subscription.status} {subscription.billing_interval ? `(${subscription.billing_interval === "annual" ? t("billing_interval_annual") : t("billing_interval_monthly")})` : ""}
              </span>
            )}
          </div>
        </CardHeader>
        {plan === "pro" && (
          <CardContent className="border-t pt-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1 text-sm">
                {isProCanceled ? (
                  <p className="text-muted-foreground italic">
                    Subscription canceled. You retain Pro access until{" "}
                    <strong className="font-sans">
                      {subscription?.current_period_end
                        ? format.dateTime(new Date(subscription.current_period_end), {
                            year: "numeric",
                            month: "numeric",
                            day: "numeric",
                          })
                        : "period end"}
                    </strong>.
                  </p>
                ) : (
                  <p className="text-muted-foreground">
                    Next billing date:{" "}
                    <strong className="font-sans">
                      {subscription?.current_period_end
                        ? format.dateTime(new Date(subscription.current_period_end), {
                            year: "numeric",
                            month: "numeric",
                            day: "numeric",
                          })
                        : "N/A"}
                    </strong>.
                  </p>
                )}
              </div>
              {!isProCanceled && (subscription?.billing_provider === "paypal" || subscription?.billing_provider === "paddle") && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleCancel}
                  disabled={canceling}
                  className="w-full sm:w-auto"
                >
                  {canceling ? (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      {tRoot("common.deleting")}
                    </>
                  ) : (
                    t("cancel_subscription") || "Cancel Subscription"
                  )}
                </Button>
              )}
              {subscription?.billing_provider && subscription.billing_provider !== "paypal" && subscription.billing_provider !== "paddle" && (
                <div className="flex flex-col gap-2 p-3 rounded-lg border border-yellow-500/20 bg-yellow-500/5 max-w-md">
                  <p className="text-xs text-yellow-600 dark:text-yellow-400">
                    {t("legacy_notice", {
                      provider: subscription.billing_provider === "stripe" ? "Stripe" : subscription.billing_provider,
                    })}
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        )}
      </Card>
      {/* Pricing Cards Grid */}
      <div className="grid md:grid-cols-2 gap-8 items-stretch">
        {/* Free Plan Card */}
        <Card className={cn("flex flex-col h-full bg-card/45 backdrop-blur-md border border-border shadow-sm")}>
          <CardHeader className="pb-4">
            <CardTitle className="text-xl font-display uppercase tracking-widest font-bold">
              {t("free_title")}
            </CardTitle>
            <CardDescription className="text-xs">
              Essential flashcard generation
            </CardDescription>
            <div className="mt-4">
              <span className="text-4xl font-extrabold font-display">$0</span>
              <span className="text-muted-foreground text-sm"> {t("per_month")}</span>
            </div>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col pt-0 justify-between gap-6">
            <ul className="space-y-3 flex-1 text-sm">
              <li className="flex items-center gap-2">
                <Check className="h-4 w-4 text-emerald-500 shrink-0" />
                <span>3 AI Decks / month</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-4 w-4 text-emerald-500 shrink-0" />
                <span>50 Cards / deck limit</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-4 w-4 text-emerald-500 shrink-0" />
                <span>Standard generation speed</span>
              </li>
              <li className="flex items-center gap-2 text-muted-foreground/60">
                <X className="h-4 w-4 text-red-500 shrink-0" />
                <span>Media uploads (Images/Audio)</span>
              </li>
            </ul>
            <Button className="w-full mt-auto" variant="outline" disabled={plan === "free"}>
              {plan === "free" ? t("current_plan_btn") : t("free_title")}
            </Button>
          </CardContent>
        </Card>

        {/* Pro Plan Card */}
        <Card className={cn(
          "flex flex-col h-full bg-card/45 backdrop-blur-md border shadow-xl relative transition-all duration-300",
          plan === "pro" ? "border-border" : "border-primary/50 shadow-primary/5 ring-1 ring-primary/20"
        )}>
          {plan !== "pro" && (
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-[10px] font-display uppercase tracking-widest px-3 py-1 rounded-full font-bold shadow-md">
              Recommended
            </div>
          )}
          <CardHeader className="pb-4">
            <CardTitle className="text-xl font-display uppercase tracking-widest font-bold flex items-center gap-2">
              {t("pro_title")}
              {plan !== "pro" && <Sparkles className="h-5 w-5 text-primary fill-primary/10" />}
            </CardTitle>
            <CardDescription className="text-xs">
              Unlimited power for dedicated learners
            </CardDescription>
            {/* Interval Switcher */}
            <div className="flex items-center gap-2 mt-3">
              <Button
                variant={activeInterval === "monthly" ? "default" : "outline"}
                size="sm"
                onClick={() => setActiveInterval("monthly")}
                className="font-display uppercase tracking-wider text-[10px] h-7 px-2.5"
              >
                {t("billing_interval_monthly")}
              </Button>
              <Button
                variant={activeInterval === "annual" ? "default" : "outline"}
                size="sm"
                onClick={() => setActiveInterval("annual")}
                className="font-display uppercase tracking-wider text-[10px] h-7 px-2.5"
              >
                {t("billing_interval_annual")}
              </Button>
              <span className="text-[9px] bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 px-1.5 py-0.5 rounded font-display uppercase tracking-wider font-bold shrink-0">
                {t("billing_save_percent")}
              </span>
            </div>
            <div className="mt-4">
              <span className="text-4xl font-extrabold font-display">
                {activeInterval === "monthly" ? t("pro_price_monthly") : t("pro_price_annual")}
              </span>
              <span className="text-muted-foreground text-sm"> {t("per_month")}</span>
              <div className="text-xs text-muted-foreground mt-1">
                {activeInterval === "monthly" ? t("billed_monthly") : t("billed_annually")}
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col pt-0 justify-between gap-6">
            <ul className="space-y-3 flex-1 text-sm">
              <li className="flex items-center gap-2 font-medium">
                <Check className="h-4 w-4 text-emerald-500 shrink-0" />
                <span>Unlimited AI Decks</span>
              </li>
              <li className="flex items-center gap-2 font-medium">
                <Check className="h-4 w-4 text-emerald-500 shrink-0" />
                <span>Unlimited Cards / deck</span>
              </li>
              <li className="flex items-center gap-2 font-medium">
                <Check className="h-4 w-4 text-emerald-500 shrink-0" />
                <span>Priority generation speed</span>
              </li>
              <li className="flex items-center gap-2 font-medium">
                <Check className="h-4 w-4 text-emerald-500 shrink-0" />
                <span>Upload images & audio files</span>
              </li>
            </ul>

            {plan === "free" ? (
              <Button
                className="w-full"
                onClick={handlePaddleCheckout}
                disabled={loadingCheckout}
              >
                {loadingCheckout ? (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    {tRoot("common.loading") || "Loading..."}
                  </>
                ) : (
                  t("unlock_pro_cta") || "Unlock Pro Access"
                )}
              </Button>
            ) : (
              <Button className="w-full" disabled variant="secondary">
                {t("current_plan_btn")}
              </Button>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Comparison Table */}
      <Card className="border border-border bg-card/45 backdrop-blur-md shadow-sm">
        <CardHeader>
          <CardTitle className="font-display text-lg uppercase tracking-wider">
            {t("features_title")}
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto pt-0">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="border-b text-xs font-semibold text-muted-foreground uppercase">
                <th className="py-3 px-4">Feature</th>
                <th className="py-3 px-4">{t("free_title")}</th>
                <th className="py-3 px-4 text-primary">{t("pro_title")}</th>
              </tr>
            </thead>
            <tbody>
              {featuresList.map((item) => (
                <tr key={item.key} className="border-b last:border-0 hover:bg-muted/10 transition-colors">
                  <td className="py-3 px-4 font-medium">{item.label}</td>
                  <td className="py-3 px-4 text-muted-foreground">
                    {typeof item.free === "boolean" ? (
                      item.free ? (
                        <Check className="h-4 w-4 text-emerald-500" />
                      ) : (
                        <X className="h-4 w-4 text-red-500" />
                      )
                    ) : (
                      item.free
                    )}
                  </td>
                  <td className={cn("py-3 px-4", item.isImportant ? "font-semibold text-primary" : "text-muted-foreground")}>
                    {typeof item.pro === "boolean" ? (
                      item.pro ? (
                        <Check className="h-4 w-4 text-primary fill-primary/5" />
                      ) : (
                        <X className="h-4 w-4 text-red-500" />
                      )
                    ) : (
                      item.pro
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
