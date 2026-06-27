import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { getServerEnv } from "@/lib/env";
import { locales, defaultLocale } from "@/lib/i18n/config";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("session_id");
  const locale = searchParams.get("locale") || defaultLocale;

  const env = getServerEnv();
  const primaryAppUrl = env.NEXT_PUBLIC_APP_URL || "https://flashtar.app";

  if (!sessionId) {
    return NextResponse.redirect(`${primaryAppUrl}/plan?error=missing_session`);
  }

  // Verify the session exists (using admin client since RLS is enabled)
  const supabase = createServiceClient();
  const { data: session, error } = await supabase
    .from("paddle_checkout_sessions")
    .select("id")
    .eq("id", sessionId)
    .gt("created_at", new Date(Date.now() - 10 * 60 * 1000).toISOString())
    .single();

  if (error || !session) {
    console.error("[Checkout Initiate API] Session not found, expired, or invalid:", error);
    return NextResponse.redirect(`${primaryAppUrl}/plan?error=invalid_session`);
  }

  // Validate the locale
  const finalLocale = (locales as readonly string[]).includes(locale) ? locale : defaultLocale;

  // Create redirect response
  const response = NextResponse.redirect(new URL(`/checkout?session_id=${sessionId}`, request.url));
  
  // Set the cookie (SameSite Lax, Path /, 1 hour expiry is plenty for checkout)
  response.cookies.set("NEXT_LOCALE", finalLocale, {
    path: "/",
    maxAge: 3600,
    sameSite: "lax",
  });

  return response;
}
