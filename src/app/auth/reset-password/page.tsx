"use client";

import { useState } from "react";
import { updatePassword } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { translateError } from "@/lib/i18n/utils";

export default function ResetPasswordPage() {
  const [loading, setLoading] = useState(false);
  const t = useTranslations("auth");
  const tRoot = useTranslations();

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    const result = await updatePassword(formData);
    if (result?.error) {
      toast.error(translateError(result.error, tRoot));
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{t("set_new_password_title")}</CardTitle>
          <CardDescription>{t("set_new_password_desc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">{t("new_password_label")}</Label>
              <Input id="password" name="password" type="password" required minLength={8} />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? t("updating") : t("update_password_button")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
