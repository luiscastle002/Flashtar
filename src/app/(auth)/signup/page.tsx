"use client";

import Link from "next/link";
import { useState } from "react";
import { Sparkles } from "lucide-react";
import { signUp, signInWithGoogle } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { translateError } from "@/lib/i18n/utils";

export default function SignUpPage() {
  const [loading, setLoading] = useState(false);
  const [successEmail, setSuccessEmail] = useState<string | null>(null);
  const t = useTranslations("auth");
  const tRoot = useTranslations();

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    const result = await signUp(formData);
    if (result?.error) {
      toast.error(translateError(result.error, tRoot));
      setLoading(false);
    } else if (result?.success) {
      setSuccessEmail(result.email || (formData.get("email") as string));
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

  if (successEmail) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <Link href="/" className="inline-flex items-center justify-center gap-2 font-bold text-xl mb-2">
              <Sparkles className="h-6 w-6 text-primary" />
              Flashtar
            </Link>
            <CardTitle>{t("verify_email_title")}</CardTitle>
            <CardDescription>{t("verify_email_desc")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 text-center">
            <div className="space-y-2">
              <p className="text-sm font-semibold text-green-600 dark:text-green-400">
                {t("created_success")}
              </p>
              <p className="text-sm text-muted-foreground">
                {t("check_email_instructions", { email: successEmail })}
              </p>
            </div>
            <Button asChild className="w-full">
              <Link href="/login">{t("back_to_login")}</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <Link href="/" className="inline-flex items-center justify-center gap-2 font-bold text-xl mb-2">
            <Sparkles className="h-6 w-6 text-primary" />
            Flashtar
          </Link>
          <CardTitle>{t("create_account_title")}</CardTitle>
          <CardDescription>{t("create_account_desc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form action={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">{t("email")}</Label>
              <Input id="email" name="email" type="email" placeholder="you@example.com" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{t("password")}</Label>
              <Input id="password" name="password" type="password" required minLength={8} />
              <p className="text-xs text-muted-foreground">{t("min_characters")}</p>
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? t("creating_account") : t("create_account_button")}
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
            {t("already_have_account")}{" "}
            <Link href="/login" className="text-primary hover:underline">
              {t("sign_in_link")}
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
