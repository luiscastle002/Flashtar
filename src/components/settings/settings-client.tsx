"use client";

import { useState, useEffect } from "react";
import { CreditCard, User, Key, Mail } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PLANS } from "@/lib/stripe";
import { toast } from "sonner";
import type { Profile, Subscription } from "@/types";
import { env } from "@/lib/env";
import { initializePaddle, type Paddle } from "@paddle/paddle-js";
import { getPaddleUpdateTx, cancelPaddleSubscription } from "@/actions/paddle";
import { createClient } from "@/lib/supabase/client";
import { changePassword, changeEmail } from "@/actions/auth";

interface SettingsClientProps {
  profile: Profile | null;
  subscription: Subscription | null;
}

export function SettingsClient({ profile, subscription }: SettingsClientProps) {
  const [loading, setLoading] = useState<"checkout" | "portal" | null>(null);
  const [paddle, setPaddle] = useState<Paddle | null>(null);
  const plan = subscription?.plan ?? "free";
  const planInfo = PLANS[plan];

  const [isEmailUser, setIsEmailUser] = useState(false);
  const [checkingUser, setCheckingUser] = useState(true);
  const [newEmail, setNewEmail] = useState("");
  const [emailLoading, setEmailLoading] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);

  useEffect(() => {
    if (env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN) {
      initializePaddle({
        environment: env.NEXT_PUBLIC_PADDLE_ENV,
        token: env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN,
      }).then((p) => {
        if (p) setPaddle(p);
      });
    }

    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        const emailIdentity = user.identities?.some((id) => id.provider === "email");
        setIsEmailUser(!!emailIdentity);
      }
      setCheckingUser(false);
    });
  }, []);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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

  async function handlePaddleCheckout() {
    if (!paddle) {
      toast.error("Billing system is initializing. Please try again in a moment.");
      return;
    }
    if (!env.NEXT_PUBLIC_PADDLE_PRICE_ID) {
      toast.error("Paddle price configuration is missing.");
      return;
    }
    setLoading("checkout");
    try {
      paddle.Checkout.open({
        items: [{ priceId: env.NEXT_PUBLIC_PADDLE_PRICE_ID, quantity: 1 }],
        customData: { userId: profile?.id },
      });
    } catch (error) {
      console.error("Paddle checkout failed:", error);
      toast.error("Could not initiate checkout.");
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

  const [canceling, setCanceling] = useState(false);

  async function handlePaddleCancel() {
    if (!window.confirm("Are you sure you want to cancel your subscription?")) return;
    setCanceling(true);
    try {
      const res = await cancelPaddleSubscription();
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success("Subscription successfully canceled at the end of the billing period.");
      }
    } catch {
      toast.error("Failed to cancel subscription");
    } finally {
      setCanceling(false);
    }
  }

  async function handlePaddlePortal() {
    if (!paddle) {
      toast.error("Billing system is initializing. Please try again in a moment.");
      return;
    }
    setLoading("portal");
    try {
      const res = await getPaddleUpdateTx();
      if (res.error) {
        toast.error(res.error);
        return;
      }
      if (res.transactionId) {
        paddle.Checkout.open({
          transactionId: res.transactionId,
        });
      } else {
        toast.error("Could not retrieve billing details.");
      }
    } catch (error) {
      console.error("Paddle portal failed:", error);
      toast.error("Could not open billing details.");
    } finally {
      setLoading(null);
    }
  }

  async function handleEmailChange(e: React.FormEvent) {
    e.preventDefault();
    if (!newEmail) return;
    setEmailLoading(true);
    try {
      const formData = new FormData();
      formData.append("email", newEmail);
      const res = await changeEmail(formData);
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success(res.success ?? "Email change requested.");
        setNewEmail("");
      }
    } catch {
      toast.error("Failed to request email change.");
    } finally {
      setEmailLoading(false);
    }
  }

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword.length < 8) {
      toast.error("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("New passwords do not match.");
      return;
    }
    setPasswordLoading(true);
    try {
      const formData = new FormData();
      if (currentPassword) {
        formData.append("currentPassword", currentPassword);
      }
      formData.append("newPassword", newPassword);
      formData.append("confirmPassword", confirmPassword);

      const res = await changePassword(formData);
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success(res.success ?? "Password updated successfully!");
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      }
    } catch {
      toast.error("Failed to update password.");
    } finally {
      setPasswordLoading(false);
    }
  }

  return (
    <DashboardShell currentPath="/settings" profile={profile}>
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
              <Mail className="h-5 w-5" />
              Change Email
            </CardTitle>
            <CardDescription>
              Update your account email address. Confirmation links will be sent to both your current and new email addresses.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleEmailChange} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-email">New Email Address</Label>
                <Input
                  id="new-email"
                  type="email"
                  placeholder="new@example.com"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" disabled={emailLoading}>
                {emailLoading ? "Updating..." : "Update Email"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              Change Password
            </CardTitle>
            <CardDescription>
              Update your security credentials.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {checkingUser ? (
              <p className="text-sm text-muted-foreground animate-pulse">Checking credentials status...</p>
            ) : isEmailUser ? (
              <form onSubmit={handlePasswordChange} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="current-password">Current Password</Label>
                  <Input
                    id="current-password"
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-password">New Password</Label>
                  <Input
                    id="new-password"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm-password">Confirm Password</Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                  />
                </div>
                <Button type="submit" disabled={passwordLoading}>
                  {passwordLoading ? "Updating..." : "Update Password"}
                </Button>
              </form>
            ) : (
              <p className="text-sm text-muted-foreground">
                You are currently signed in using Google/OAuth. Password management is handled by your identity provider.
              </p>
            )}
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
              <div className="flex flex-wrap gap-2">
                <Button onClick={handlePaddleCheckout} disabled={loading === "checkout"}>
                  {loading === "checkout" ? "Loading..." : "Upgrade to Pro — $12/month"}
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {subscription?.billing_provider === "paddle" ? (
                  <>
                    <Button onClick={handlePaddlePortal} disabled={loading === "portal"}>
                      {loading === "portal" ? "Opening..." : "Update Payment Method (Paddle)"}
                    </Button>
                    <Button variant="destructive" onClick={handlePaddleCancel} disabled={canceling}>
                      {canceling ? "Canceling..." : "Cancel Subscription"}
                    </Button>
                  </>
                ) : (
                  <Button variant="outline" onClick={handlePortal} disabled={loading === "portal"}>
                    {loading === "portal" ? "Redirecting..." : "Manage Subscription (Stripe)"}
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}
