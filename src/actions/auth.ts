"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { cookies } from "next/headers";
import { locales, defaultLocale, type Locale } from "@/lib/i18n/config";

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
    return { error: "errors.auth.invalid_email_password" };
  }

  // Get current locale cookie during signup
  const cookieStore = await cookies();
  const localeCookie = cookieStore.get("NEXT_LOCALE")?.value || defaultLocale;
  const finalLocale = (locales as readonly string[]).includes(localeCookie)
    ? (localeCookie as Locale)
    : defaultLocale;

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: `${env.NEXT_PUBLIC_APP_URL}/auth/callback`,
      data: {
        preferred_language: finalLocale,
      },
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
    return { error: "errors.auth.invalid_credentials" };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) return { error: error.message };

  // Fetch the profile upon successful login to get preferred_language
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("preferred_language")
      .eq("id", user.id)
      .single();

    if (profile?.preferred_language) {
      const finalLocale = (locales as readonly string[]).includes(profile.preferred_language)
        ? (profile.preferred_language as Locale)
        : defaultLocale;

      // Set NEXT_LOCALE cookie with path, max-age, and SameSite configuration
      const cookieStore = await cookies();
      cookieStore.set("NEXT_LOCALE", finalLocale, {
        path: "/",
        maxAge: 31536000,
        sameSite: "lax",
      });
    }
  }

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
    return { error: "errors.auth.invalid_email" };
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
    return { error: "errors.auth.password_too_short" };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });

  if (error) return { error: error.message };
  redirect("/dashboard");
}

export async function changePassword(formData: FormData) {
  const currentPassword = formData.get("currentPassword");
  const newPassword = formData.get("newPassword");
  const confirmPassword = formData.get("confirmPassword");

  if (typeof newPassword !== "string" || newPassword.length < 8) {
    return { error: "errors.auth.password_too_short" };
  }
  if (newPassword !== confirmPassword) {
    return { error: "errors.auth.passwords_mismatch" };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: "errors.auth.not_authenticated" };
  }

  const isEmailUser = user.identities?.some((id) => id.provider === "email");
  if (isEmailUser) {
    if (!currentPassword || typeof currentPassword !== "string") {
      return { error: "errors.auth.current_password_required" };
    }
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: user.email!,
      password: currentPassword,
    });
    if (signInError) {
      return { error: "errors.auth.incorrect_password" };
    }
  }

  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) return { error: error.message };

  return { success: "Password updated successfully!" };
}

export async function changeEmail(formData: FormData) {
  const newEmail = formData.get("email");
  if (typeof newEmail !== "string" || !z.string().email().safeParse(newEmail).success) {
    return { error: "errors.auth.invalid_email" };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: "errors.auth.not_authenticated" };
  }

  if (user.email === newEmail) {
    return { error: "errors.auth.email_not_different" };
  }

  const { error } = await supabase.auth.updateUser({ email: newEmail });
  if (error) return { error: error.message };

  return {
    success: "Confirmation links sent! Please check both your current and new email addresses to confirm the change.",
  };
}
