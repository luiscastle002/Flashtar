"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";

const authSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export async function signUp(formData: FormData) {
  const parsed = authSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: "Invalid email or password (min 8 characters)." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: `${env.NEXT_PUBLIC_APP_URL}/auth/callback`,
    },
  });

  if (error) return { error: error.message };
  return { success: true, email: parsed.data.email };
}

export async function signIn(formData: FormData) {
  const parsed = authSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: "Invalid email or password." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) return { error: error.message };
  redirect("/dashboard");
}

export async function signInWithGoogle() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${env.NEXT_PUBLIC_APP_URL}/auth/callback`,
    },
  });

  if (error) return { error: error.message };
  if (data.url) redirect(data.url);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

export async function resetPassword(formData: FormData) {
  const email = formData.get("email");
  if (typeof email !== "string" || !z.string().email().safeParse(email).success) {
    return { error: "Please enter a valid email address." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${env.NEXT_PUBLIC_APP_URL}/auth/reset-password`,
  });

  if (error) return { error: error.message };
  return { success: "Check your email for a password reset link." };
}

export async function updatePassword(formData: FormData) {
  const password = formData.get("password");
  if (typeof password !== "string" || password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });

  if (error) return { error: error.message };
  redirect("/dashboard");
}
