"use client";

import Link from "next/link";
import { useState } from "react";
import { Sparkles } from "lucide-react";
import { signIn, signInWithGoogle } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { translateError } from "@/lib/i18n/utils";

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const t = useTranslations("auth");
  const tRoot = useTranslations();

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    const result = await signIn(formData);
    if (result?.error) {
      toast.error(translateError(result.error, tRoot));
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setLoading(true);
    const result = await signInWithGoogle();
    if (result?.error) {
      toast.error(translateError(result.error, tRoot));
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <Link href="/" className="inline-flex items-center justify-center gap-2 font-bold text-xl mb-2">
            <Sparkles className="h-6 w-6 text-primary" />
            Flashtar
          </Link>
          <CardTitle>{t("welcome_back")}</CardTitle>
          <CardDescription>{t("sign_in_desc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form action={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">{t("email")}</Label>
              <Input id="email" name="email" type="email" placeholder="you@example.com" required />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">{t("password")}</Label>
                <Link href="/forgot-password" className="text-xs text-primary hover:underline">
                  {t("forgot_password_link")}
                </Link>
              </div>
              <Input id="password" name="password" type="password" required minLength={8} />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? t("signing_in") : t("sign_in_button")}
            </Button>
          </form>
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">{t("or_continue_with")}</span>
            </div>
          </div>
          <Button variant="outline" className="w-full" onClick={handleGoogle} disabled={loading}>
            {t("continue_google")}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            {t("dont_have_account")}{" "}
            <Link href="/signup" className="text-primary hover:underline">
              {t("sign_up_link")}
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
