"use client";

import { useState, useEffect, useRef } from "react";
import { CreditCard, User, Key, Mail, Loader2 } from "lucide-react";
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
import { useRouter } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { compressToIcon, getProfileAvatarDisplayUrl } from "@/lib/utils/image";
import { updateProfileAvatar, resetToGoogleAvatar, getGoogleAvatar, updatePreferredLanguage } from "@/actions/profile";
import type { Locale } from "@/lib/i18n/config";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTranslations } from "next-intl";
import { translateError } from "@/lib/i18n/utils";


interface SettingsClientProps {
  profile: Profile | null;
  subscription: Subscription | null;
}

export function SettingsClient({ profile, subscription }: SettingsClientProps) {
  const t = useTranslations("settings");
  const tRoot = useTranslations();

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
  const [langLoading, setLangLoading] = useState(false);

  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [googleAvatarUrl, setGoogleAvatarUrl] = useState<string | null>(null);
  const [currentProfile, setCurrentProfile] = useState<Profile | null>(profile);

  useEffect(() => {
    setCurrentProfile(profile);
  }, [profile]);

  useEffect(() => {
    getGoogleAvatar().then((url) => setGoogleAvatarUrl(url));
  }, []);

  const initials = currentProfile?.full_name
    ? currentProfile.full_name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()
    : currentProfile?.email?.slice(0, 2).toUpperCase() ?? "U";

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error(t("toast.size_exceeded"));
      return;
    }

    const allowedTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      toast.error(t("toast.unsupported_format"));
      return;
    }

    setAvatarUploading(true);

    try {
      const compressedBlob = await compressToIcon(file, 256);

      const clientSupabase = createClient();
      const { data: { user } } = await clientSupabase.auth.getUser();
      if (!user) {
        toast.error(t("toast.session_not_found"));
        setAvatarUploading(false);
        return;
      }

      const fileName = `${user.id}.webp`;
      
      const { error: uploadError } = await clientSupabase.storage
        .from("profile-icons")
        .upload(fileName, compressedBlob, {
          contentType: "image/webp",
          upsert: true,
        });

      if (uploadError) {
        toast.error(`${tRoot("errors.profile.avatar_resolve_failed")}: ${uploadError.message}`);
        setAvatarUploading(false);
        return;
      }

      const dbPath = `profile-icons/${fileName}`;
      const res = await updateProfileAvatar(dbPath);

      if (res.error) {
        toast.error(translateError(res.error, tRoot));
      } else {
        toast.success(t("toast.picture_updated"));
        if (res.data) {
          setCurrentProfile(res.data as Profile);
        }
        router.refresh();
      }
    } catch (err) {
      console.error(err);
      toast.error(tRoot("errors.profile.avatar_resolve_failed"));
    } finally {
      setAvatarUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleRemoveAvatar() {
    setAvatarUploading(true);
    try {
      const res = await resetToGoogleAvatar();
      if (res.error) {
        toast.error(translateError(res.error, tRoot));
      } else {
        toast.success(t("toast.picture_removed"));
        if (res.data) {
          setCurrentProfile(res.data as Profile);
        }
        router.refresh();
      }
    } catch {
      toast.error(tRoot("errors.profile.avatar_resolve_failed"));
    } finally {
      setAvatarUploading(false);
    }
  }

  async function handleUseGoogleAvatar() {
    if (!googleAvatarUrl) {
      toast.error(t("toast.no_google_photo"));
      return;
    }
    setAvatarUploading(true);
    try {
      const res = await resetToGoogleAvatar();
      if (res.error) {
        toast.error(translateError(res.error, tRoot));
      } else {
        toast.success(t("toast.switched_google"));
        if (res.data) {
          setCurrentProfile(res.data as Profile);
        }
        router.refresh();
      }
    } catch {
      toast.error(tRoot("errors.profile.avatar_resolve_failed"));
    } finally {
      setAvatarUploading(false);
    }
  }

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
      else toast.error(translateError(data.error, tRoot) || t("toast.stripe_checkout_failed"));
    } catch {
      toast.error(t("toast.stripe_checkout_failed"));
    } finally {
      setLoading(null);
    }
  }

  async function handlePaddleCheckout() {
    if (!paddle) {
      toast.error(t("toast.billing_initializing"));
      return;
    }
    if (!env.NEXT_PUBLIC_PADDLE_PRICE_ID) {
      toast.error(t("toast.paddle_missing_price"));
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
      toast.error(t("toast.paddle_checkout_failed"));
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
      else toast.error(translateError(data.error, tRoot) || t("toast.stripe_portal_failed"));
    } catch {
      toast.error(t("toast.stripe_portal_failed"));
    } finally {
      setLoading(null);
    }
  }

  const [canceling, setCanceling] = useState(false);

  async function handlePaddleCancel() {
    if (!window.confirm(t("toast.cancel_confirm"))) return;
    setCanceling(true);
    try {
      const res = await cancelPaddleSubscription();
      if (res.error) {
        toast.error(translateError(res.error, tRoot));
      } else {
        toast.success(t("toast.cancel_success"));
      }
    } catch {
      toast.error(tRoot("errors.billing.cancel_failed"));
    } finally {
      setCanceling(false);
    }
  }

  async function handlePaddlePortal() {
    if (!paddle) {
      toast.error(t("toast.billing_initializing"));
      return;
    }
    setLoading("portal");
    try {
      const res = await getPaddleUpdateTx();
      if (res.error) {
        toast.error(translateError(res.error, tRoot));
        return;
      }
      if (res.transactionId) {
        paddle.Checkout.open({
          transactionId: res.transactionId,
        });
      } else {
        toast.error(t("toast.stripe_portal_failed"));
      }
    } catch (error) {
      console.error("Paddle portal failed:", error);
      toast.error(t("toast.stripe_portal_failed"));
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
        toast.error(translateError(res.error, tRoot));
      } else {
        toast.success(t("toast.email_change_requested"));
        setNewEmail("");
      }
    } catch {
      toast.error(t("toast.email_update_failed"));
    } finally {
      setEmailLoading(false);
    }
  }

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword.length < 8) {
      toast.error(t("toast.password_short"));
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error(t("toast.passwords_mismatch"));
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
        toast.error(translateError(res.error, tRoot));
      } else {
        toast.success(t("toast.password_updated"));
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      }
    } catch {
      toast.error(t("toast.password_update_failed"));
    } finally {
      setPasswordLoading(false);
    }
  }

  async function handleLanguageChange(val: string) {
    const langCode = val as Locale;
    setLangLoading(true);
    try {
      // 1. Set the cookie NEXT_LOCALE with 1 year expiration
      document.cookie = `NEXT_LOCALE=${langCode}; path=/; max-age=31536000; SameSite=Lax`;

      // 2. Call the server action to update database
      const res = await updatePreferredLanguage(langCode);
      if (res && "error" in res && res.error) {
        toast.error(translateError(res.error, tRoot));
      } else {
        toast.success(t("toast.language_updated"));
        if (res && "data" in res && res.data) {
          setCurrentProfile(res.data as Profile);
        }
        router.refresh();
      }
    } catch {
      toast.error(t("toast.language_update_failed"));
    } finally {
      setLangLoading(false);
    }
  }

  const localizedFeatures = plan === "pro"
    ? (t.raw("pricing.pro_features") as string[])
    : (t.raw("pricing.free_features") as string[]);

  return (
    <DashboardShell currentPath="/settings" profile={profile}>
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">{t("title")}</h1>
          <p className="text-muted-foreground">{t("subtitle")}</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              {t("profile")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Profile Picture Section */}
            <div className="flex flex-col sm:flex-row items-center gap-6 pb-6 border-b border-border">
              <div className="relative shrink-0">
                <Avatar className="h-24 w-24 border-2 border-border shadow-sm">
                  <AvatarImage 
                    src={getProfileAvatarDisplayUrl(currentProfile) ?? undefined} 
                    alt={currentProfile?.full_name ?? ""} 
                  />
                  <AvatarFallback className="text-xl font-bold bg-muted text-muted-foreground">{initials}</AvatarFallback>
                </Avatar>
                {avatarUploading && (
                  <div className="absolute inset-0 bg-background/60 backdrop-blur-sm rounded-full flex items-center justify-center">
                    <Loader2 className="h-6 w-6 text-primary animate-spin" />
                  </div>
                )}
              </div>
              
              <div className="space-y-2 text-center sm:text-left">
                <h3 className="text-sm font-semibold">{t("profile_picture")}</h3>
                <p className="text-xs text-muted-foreground">
                  {t("avatar_limits")}
                </p>
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept=".png,.jpg,.jpeg,.webp"
                    className="hidden"
                    onChange={handleFileSelect}
                    disabled={avatarUploading}
                  />
                  
                  {currentProfile?.avatar_type === "custom" ? (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={avatarUploading}
                      >
                        {t("replace_photo")}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={handleRemoveAvatar}
                        disabled={avatarUploading}
                      >
                        {t("remove_photo")}
                      </Button>
                    </>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={avatarUploading}
                    >
                      {t("upload_photo")}
                    </Button>
                  )}
                  
                  {googleAvatarUrl && currentProfile?.avatar_type !== "google" && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleUseGoogleAvatar}
                      disabled={avatarUploading}
                    >
                      {t("use_google_photo")}
                    </Button>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label>{tRoot("auth.email")}</Label>
              <Input value={profile?.email ?? ""} disabled />
            </div>
            <div className="space-y-2">
              <Label>{t("full_name")}</Label>
              <Input value={profile?.full_name ?? ""} disabled />
            </div>
            <div className="space-y-2">
              <Label htmlFor="preferred-language">{t("preferred_language")}</Label>
              <Select
                value={currentProfile?.preferred_language ?? "en"}
                onValueChange={handleLanguageChange}
                disabled={langLoading}
              >
                <SelectTrigger id="preferred-language">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">English 🇺🇸</SelectItem>
                  <SelectItem value="es">Español 🇪🇸</SelectItem>
                  <SelectItem value="pt">Português 🇧🇷</SelectItem>
                  <SelectItem value="ja">日本語 🇯🇵</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              {t("change_email")}
            </CardTitle>
            <CardDescription>
              {t("change_email_desc")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleEmailChange} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-email">{t("new_email_address")}</Label>
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
                {emailLoading ? tRoot("auth.updating") : t("update_email_button")}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              {t("change_password")}
            </CardTitle>
            <CardDescription>
              {t("change_password_desc")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {checkingUser ? (
              <p className="text-sm text-muted-foreground animate-pulse">{t("checking_status")}</p>
            ) : isEmailUser ? (
              <form onSubmit={handlePasswordChange} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="current-password">{t("current_password")}</Label>
                  <Input
                    id="current-password"
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-password">{t("new_password")}</Label>
                  <Input
                    id="new-password"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm-password">{t("confirm_password")}</Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                  />
                </div>
                <Button type="submit" disabled={passwordLoading}>
                  {passwordLoading ? tRoot("auth.updating") : t("update_password_button")}
                </Button>
              </form>
            ) : (
              <p className="text-sm text-muted-foreground">
                {t("oauth_notice")}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              {t("subscription")}
            </CardTitle>
            <CardDescription>
              {t("current_plan", { plan: planInfo.name })}
              {subscription?.status && (
                <span className="ml-2 text-xs capitalize">({subscription.status})</span>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="space-y-1 text-sm text-muted-foreground">
              {localizedFeatures.map((f) => (
                <li key={f}>• {f}</li>
              ))}
            </ul>
            {plan === "free" ? (
              <div className="flex flex-wrap gap-2">
                <Button onClick={handlePaddleCheckout} disabled={loading === "checkout"}>
                  {loading === "checkout" ? tRoot("common.loading") : t("upgrade_pro_button", { price: 12 })}
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {subscription?.billing_provider === "paddle" ? (
                  <>
                    <Button onClick={handlePaddlePortal} disabled={loading === "portal"}>
                      {loading === "portal" ? tRoot("common.loading") : t("update_payment_paddle")}
                    </Button>
                    <Button variant="destructive" onClick={handlePaddleCancel} disabled={canceling}>
                      {canceling ? tRoot("common.deleting") : t("cancel_subscription")}
                    </Button>
                  </>
                ) : (
                  <Button variant="outline" onClick={handlePortal} disabled={loading === "portal"}>
                    {loading === "portal" ? tRoot("common.loading") : t("manage_subscription_stripe")}
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
