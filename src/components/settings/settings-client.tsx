"use client";

import { useState, useEffect, useRef } from "react";
import { CreditCard, User, Key, Mail, Loader2, HardDrive, RefreshCw, AlertCircle } from "lucide-react";

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
import { useTranslations, useLocale } from "next-intl";
import { translateError } from "@/lib/i18n/utils";
import { getGoogleAuthUrl, disconnectGoogleDrive, reSyncFailedUploads } from "@/actions/integrations";


interface SettingsClientProps {
  profile: Profile | null;
  subscription: Subscription | null;
  googleConnection: {
    google_email: string;
    connection_status: string;
    root_folder_id: string;
    audio_folder_id: string;
  } | null;
  audioUsage: {
    monthly_limit: number;
    used_this_month: number;
    period_start: string;
    period_end: string;
  } | null;
  audioHistory: Array<{
    id: string;
    characters_consumed: number;
    action_type: string;
    created_at: string;
    source_details?: unknown;
  }>;
  hasQuotaExceeded: boolean;
}

export function SettingsClient({ 
  profile, 
  subscription,
  googleConnection,
  audioUsage,
  audioHistory,
  hasQuotaExceeded
}: SettingsClientProps) {
  const t = useTranslations("settings");
  const tRoot = useTranslations();
  const locale = useLocale();

  const formatDate = (dateStr: string) => {
    try {
      return new Intl.DateTimeFormat(locale, {
        year: "numeric",
        month: "numeric",
        day: "numeric",
      }).format(new Date(dateStr));
    } catch {
      return dateStr;
    }
  };

  const formatDateTime = (dateStr: string) => {
    try {
      return new Intl.DateTimeFormat(locale, {
        year: "numeric",
        month: "numeric",
        day: "numeric",
        hour: "numeric",
        minute: "numeric",
        second: "numeric",
      }).format(new Date(dateStr));
    } catch {
      return dateStr;
    }
  };

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

  const [googleLoading, setGoogleLoading] = useState<"connect" | "disconnect" | "re-sync" | null>(null);

  async function handleGoogleConnect() {
    setGoogleLoading("connect");
    try {
      const res = await getGoogleAuthUrl();
      if (res.error) {
        toast.error(translateError(res.error, tRoot));
      } else if (res.url) {
        window.location.href = res.url;
      } else {
        toast.error(t("google_drive.toast_connect_failed"));
      }
    } catch {
      toast.error(t("google_drive.toast_connect_failed"));
    } finally {
      setGoogleLoading(null);
    }
  }

  async function handleGoogleDisconnect() {
    if (!window.confirm(tRoot("common.delete") + "?")) return;
    setGoogleLoading("disconnect");
    try {
      const res = await disconnectGoogleDrive();
      if (res.error) {
        toast.error(t("google_drive.toast_disconnect_failed", { error: res.error }));
      } else {
        toast.success(t("google_drive.toast_disconnected"));
        router.refresh();
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      toast.error(t("google_drive.toast_disconnect_failed", { error: errMsg }));
    } finally {
      setGoogleLoading(null);
    }
  }

  async function handleGoogleReSync() {
    setGoogleLoading("re-sync");
    try {
      const res = await reSyncFailedUploads();
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success(tRoot("common.save"));
        router.refresh();
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "Failed to re-sync";
      toast.error(errMsg);
    } finally {
      setGoogleLoading(null);
    }
  }

  const localizedFeatures = plan === "pro"
    ? (t.raw("pricing.pro_features") as string[])
    : (t.raw("pricing.free_features") as string[]);

  return (
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
        
        {/* Google Drive Storage (BYOS) Card */}
        <Card className="overflow-hidden border-primary/10 shadow-lg transition-all duration-300 hover:shadow-xl">
          <div className="h-1.5 bg-gradient-to-r from-blue-500 via-green-500 to-yellow-500" />
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <HardDrive className="h-5 w-5 text-blue-500" />
              {t("google_drive.title")}
            </CardTitle>
            <CardDescription className="text-sm">
              {t("google_drive.description")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {googleConnection ? (
              <div className="rounded-xl bg-muted/40 p-4 border border-border space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <div className={`h-2.5 w-2.5 rounded-full ${
                        googleConnection.connection_status === "connected" 
                          ? "bg-green-500 animate-pulse" 
                          : "bg-destructive"
                      }`} />
                      <span className="font-semibold text-sm capitalize">
                        {googleConnection.connection_status === "connected" 
                          ? t("google_drive.status_connected") 
                          : t("google_drive.status_error")}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {googleConnection.google_email}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {googleConnection.connection_status !== "connected" && (
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={handleGoogleConnect} 
                        disabled={googleLoading !== null}
                        className="gap-2 border-primary/20 hover:bg-primary/5 hover:text-primary transition-all"
                      >
                        <RefreshCw className={`h-4 w-4 ${googleLoading === "connect" ? "animate-spin" : ""}`} />
                        {t("google_drive.reconnect_button")}
                      </Button>
                    )}
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={handleGoogleDisconnect} 
                      disabled={googleLoading !== null}
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive hover:border-destructive/20 transition-all"
                    >
                      {googleLoading === "disconnect" ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        t("google_drive.disconnect_button")
                      )}
                    </Button>
                  </div>
                </div>

                <div className="border-t border-border/60 pt-3 flex flex-col gap-1.5 text-xs text-muted-foreground">
                  <div className="flex justify-between">
                    <span>{t("google_drive.email_label")}:</span>
                    <span className="font-mono text-foreground/80">{googleConnection.google_email}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>{t("google_drive.folder_label")}:</span>
                    <span className="font-mono text-foreground/80">{googleConnection.audio_folder_id || googleConnection.root_folder_id || "N/A"}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border/80 p-6 text-center space-y-4 bg-muted/10">
                <div className="mx-auto w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-500">
                  <HardDrive className="h-6 w-6" />
                </div>
                <div className="space-y-1">
                  <h3 className="font-semibold text-sm">{t("google_drive.title")}</h3>
                  <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                    {t("google_drive.description")}
                  </p>
                </div>
                <Button 
                  onClick={handleGoogleConnect} 
                  disabled={googleLoading !== null}
                  className="bg-blue-600 hover:bg-blue-500 text-white font-medium shadow-md shadow-blue-500/20 transition-all gap-2"
                >
                  {googleLoading === "connect" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <HardDrive className="h-4 w-4" />
                  )}
                  {t("google_drive.connect_button")}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Audio Usage & Credits Card */}
        <Card className="overflow-hidden shadow-lg transition-all duration-300 hover:shadow-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <CreditCard className="h-5 w-5 text-indigo-500" />
              {t("audio_usage.title")}
            </CardTitle>
            <CardDescription className="text-sm">
              {t("audio_usage.description")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {audioUsage ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between items-end text-sm">
                    <span className="font-medium text-muted-foreground">
                      {t("audio_usage.credits_remaining", { 
                        used: audioUsage.used_this_month, 
                        limit: audioUsage.monthly_limit 
                      })}
                    </span>
                    <span className="text-xs font-semibold text-foreground">
                      {Math.max(0, 100 - Math.round((audioUsage.used_this_month / audioUsage.monthly_limit) * 100))}% remaining
                    </span>
                  </div>
                  <div className="w-full h-3 rounded-full bg-muted overflow-hidden border border-border/50">
                    <div 
                      className={`h-full rounded-full transition-all duration-500 ${
                        audioUsage.used_this_month >= audioUsage.monthly_limit 
                          ? "bg-destructive" 
                          : audioUsage.used_this_month / audioUsage.monthly_limit > 0.8 
                            ? "bg-yellow-500" 
                            : "bg-gradient-to-r from-indigo-500 to-purple-500"
                      }`}
                      style={{ width: `${Math.min(100, Math.max(0, (audioUsage.used_this_month / audioUsage.monthly_limit) * 100))}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t("audio_usage.period_ends", { date: formatDate(audioUsage.period_end) })}
                  </p>
                </div>

                {/* Quota Exceeded Warning Banner & Re-sync */}
                {hasQuotaExceeded && (
                  <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 space-y-3">
                    <div className="flex items-start gap-2.5">
                      <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <h4 className="text-sm font-semibold text-destructive text-left">Google Drive Quota Exceeded</h4>
                        <p className="text-xs text-muted-foreground text-left leading-relaxed">
                          Your Google Drive has run out of space, which has paused background audio uploads. Once you free up space in your Google Drive, click below to re-sync.
                        </p>
                      </div>
                    </div>
                    <Button 
                      onClick={handleGoogleReSync} 
                      disabled={googleLoading === "re-sync"}
                      variant="destructive"
                      size="sm"
                      className="w-full gap-2 transition-all shadow-sm"
                    >
                      {googleLoading === "re-sync" ? (
                        <RefreshCw className="h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4" />
                      )}
                      Re-sync failed uploads
                    </Button>
                  </div>
                )}

                {/* Credit Usage History Logs */}
                <div className="space-y-3 pt-2">
                  <h4 className="text-sm font-semibold flex items-center gap-1.5">
                    <RefreshCw className="h-4 w-4 text-muted-foreground" />
                    {t("audio_usage.history_title")}
                  </h4>
                  {audioHistory.length > 0 ? (
                    <div className="border border-border rounded-xl divide-y divide-border overflow-hidden bg-muted/10 max-h-[220px] overflow-y-auto custom-scrollbar">
                      {audioHistory.map((item) => (
                        <div key={item.id} className="flex justify-between items-center p-3 text-xs hover:bg-muted/30 transition-all duration-200">
                          <div className="space-y-1 text-left">
                            <p className="font-medium">
                              {t(`audio_usage.action.${item.action_type}`, { defaultValue: item.action_type })}
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                              {formatDateTime(item.created_at)}
                            </p>
                          </div>
                          <div className="text-right">
                            <span className={`font-mono font-semibold ${
                              item.characters_consumed > 0 
                                ? "text-amber-500 dark:text-amber-400" 
                                : item.characters_consumed < 0 
                                  ? "text-green-500 dark:text-green-400"
                                  : "text-muted-foreground"
                            }`}>
                              {item.characters_consumed > 0 ? `-${item.characters_consumed}` : item.characters_consumed < 0 ? `+${Math.abs(item.characters_consumed)}` : "0"} {t("audio_usage.characters", { count: Math.abs(item.characters_consumed) })}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground italic text-center py-4 bg-muted/20 border border-dashed border-border rounded-xl">
                      {t("audio_usage.no_history")}
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground animate-pulse">Loading usage credits...</p>
            )}
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
  );
}
