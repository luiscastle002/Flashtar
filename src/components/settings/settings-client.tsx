"use client";

import { useState } from "react";
import { CreditCard, User } from "lucide-react";
import { DashboardShellClient } from "@/components/dashboard/dashboard-shell-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PLANS } from "@/lib/stripe";
import { toast } from "sonner";
import type { Profile, Subscription } from "@/types";

interface SettingsClientProps {
  profile: Profile | null;
  subscription: Subscription | null;
}

export function SettingsClient({ profile, subscription }: SettingsClientProps) {
  const [loading, setLoading] = useState<"checkout" | "portal" | null>(null);
  const plan = subscription?.plan ?? "free";
  const planInfo = PLANS[plan];

  async function handleCheckout() {
    setLoading("checkout");
    try {
      const res = await fetch("/api/stripe/checkout", { method: "POST" });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
      else toast.error(data.error ?? "Checkout failed");
    } catch {
      toast.error("Checkout failed");
    } finally {
      setLoading(null);
    }
  }

  async function handlePortal() {
    setLoading("portal");
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
      else toast.error(data.error ?? "Portal failed");
    } catch {
      toast.error("Could not open billing portal");
    } finally {
      setLoading(null);
    }
  }

  return (
    <DashboardShellClient currentPath="/settings" profile={profile}>
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Settings</h1>
          <p className="text-muted-foreground">Manage your account and subscription</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Profile
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input value={profile?.email ?? ""} disabled />
            </div>
            <div className="space-y-2">
              <Label>Full Name</Label>
              <Input value={profile?.full_name ?? ""} disabled />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Subscription
            </CardTitle>
            <CardDescription>
              Current plan: <span className="font-medium capitalize">{planInfo.name}</span>
              {subscription?.status && (
                <span className="ml-2 text-xs capitalize">({subscription.status})</span>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="space-y-1 text-sm text-muted-foreground">
              {planInfo.features.map((f) => (
                <li key={f}>• {f}</li>
              ))}
            </ul>
            {plan === "free" ? (
              <Button onClick={handleCheckout} disabled={loading === "checkout"}>
                {loading === "checkout" ? "Redirecting..." : "Upgrade to Pro — $12/month"}
              </Button>
            ) : (
              <Button variant="outline" onClick={handlePortal} disabled={loading === "portal"}>
                {loading === "portal" ? "Redirecting..." : "Manage Subscription"}
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardShellClient>
  );
}
