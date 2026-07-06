"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, X, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

interface PricingSectionProps {
  user: unknown;
}

export function PricingSection({ user }: PricingSectionProps) {
  const t = useTranslations("plan_page");
  const [activeInterval, setActiveInterval] = useState<"monthly" | "annual">("monthly");

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
    <div className="space-y-12 max-w-5xl mx-auto">
      {/* Pricing Cards Grid */}
      <div className="grid md:grid-cols-2 gap-8 items-stretch">
        {/* Free Plan Card */}
        <Card className="flex flex-col h-full bg-card/45 backdrop-blur-md border border-border shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-xl font-display font-semibold tracking-tight">
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
            <Button className="w-full mt-auto" variant="outline" asChild>
              <Link href={user ? "/dashboard" : "/signup"}>
                {user ? t("current_plan_btn") : t("unlock_pro_cta")}
              </Link>
            </Button>
          </CardContent>
        </Card>

        {/* Pro Plan Card */}
        <Card className="flex flex-col h-full bg-card/45 backdrop-blur-md border border-primary/55 shadow-xl relative transition-all duration-300">
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-[10px] font-display uppercase tracking-widest px-3 py-1 rounded-full font-bold shadow-md">
            Recommended
          </div>
          <CardHeader className="pb-4">
            <CardTitle className="text-xl font-display font-semibold tracking-tight flex items-center gap-2">
              {t("pro_title")}
              <Sparkles className="h-5 w-5 text-primary fill-primary/10" />
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
                className="font-display text-[10px] h-7 px-2.5 font-semibold"
              >
                {t("billing_interval_monthly")}
              </Button>
              <Button
                variant={activeInterval === "annual" ? "default" : "outline"}
                size="sm"
                onClick={() => setActiveInterval("annual")}
                className="font-display text-[10px] h-7 px-2.5 font-semibold"
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

            <Button className="w-full mt-auto" variant="default" asChild>
              <Link href={user ? "/plan" : "/signup"}>
                {t("upgrade_btn")}
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Comparison Table */}
      <Card className="border border-border bg-card/45 backdrop-blur-md shadow-sm">
        <CardHeader>
          <CardTitle className="font-display text-lg tracking-tight">
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
