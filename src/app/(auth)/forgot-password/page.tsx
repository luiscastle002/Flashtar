"use client";

import Link from "next/link";
import { useState } from "react";
import { Sparkles } from "lucide-react";
import { resetPassword } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { translateError } from "@/lib/i18n/utils";

export default function ForgotPasswordPage() {
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const t = useTranslations("auth");
  const tRoot = useTranslations();

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    const result = await resetPassword(formData);
    if (result?.error) {
      toast.error(translateError(result.error, tRoot));
    } else if (result?.success) {
      toast.success(t("reset_password_desc_sent"));
      setSent(true);
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <Link href="/" className="inline-flex items-center justify-center gap-2 font-bold text-xl mb-2">
            <Sparkles className="h-6 w-6 text-primary" />
            Flashtar
          </Link>
          <CardTitle>{t("reset_password_title")}</CardTitle>
          <CardDescription>
            {sent ? t("reset_password_desc_sent") : t("reset_password_desc_enter")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!sent && (
            <form action={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">{t("email")}</Label>
                <Input id="email" name="email" type="email" placeholder="you@example.com" required />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? t("sending") : t("send_reset_link")}
              </Button>
            </form>
          )}
          <p className="text-center text-sm text-muted-foreground mt-4">
            <Link href="/login" className="text-primary hover:underline">
              {t("back_to_sign_in")}
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
