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

export default function ForgotPasswordPage() {
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    const result = await resetPassword(formData);
    if (result?.error) {
      toast.error(result.error);
    } else if (result?.success) {
      toast.success(result.success);
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
          <CardTitle>Reset password</CardTitle>
          <CardDescription>
            {sent ? "Check your email for a reset link" : "Enter your email to receive a reset link"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!sent && (
            <form action={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" name="email" type="email" placeholder="you@example.com" required />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Sending..." : "Send reset link"}
              </Button>
            </form>
          )}
          <p className="text-center text-sm text-muted-foreground mt-4">
            <Link href="/login" className="text-primary hover:underline">
              Back to sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
