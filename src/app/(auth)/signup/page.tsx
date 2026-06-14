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

export default function SignUpPage() {
  const [loading, setLoading] = useState(false);
  const [successEmail, setSuccessEmail] = useState<string | null>(null);

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    const result = await signUp(formData);
    if (result?.error) {
      toast.error(result.error);
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
      toast.error(result.error);
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
            <CardTitle>Verify your email</CardTitle>
            <CardDescription>One last step to get started</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 text-center">
            <div className="space-y-2">
              <p className="text-sm font-semibold text-green-600 dark:text-green-400">
                Account created successfully.
              </p>
              <p className="text-sm text-muted-foreground">
                Please check your email <strong className="text-foreground">{successEmail}</strong> and click the verification link before signing in.
              </p>
            </div>
            <Button asChild className="w-full">
              <Link href="/login">Back to Login</Link>
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
          <CardTitle>Create your account</CardTitle>
          <CardDescription>Start generating AI flashcards for free</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form action={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" placeholder="you@example.com" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" name="password" type="password" required minLength={8} />
              <p className="text-xs text-muted-foreground">Minimum 8 characters</p>
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Creating account..." : "Create account"}
            </Button>
          </form>
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">Or continue with</span>
            </div>
          </div>
          <Button variant="outline" className="w-full" onClick={handleGoogle} disabled={loading}>
            Continue with Google
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link href="/login" className="text-primary hover:underline">
              Sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
