import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Sync Google avatar immediately upon login callback
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase.from("profiles").select("avatar_url, avatar_type").eq("id", user.id).single();
        if (profile) {
          const avatarType = profile.avatar_type;
          if (!avatarType || avatarType === 'google') {
            const googleAvatar = user.user_metadata?.avatar_url ?? user.user_metadata?.picture ?? null;
            if (googleAvatar && googleAvatar !== profile.avatar_url) {
              await supabase
                .from("profiles")
                .update({
                  avatar_url: googleAvatar,
                  avatar_type: 'google',
                  updated_at: new Date().toISOString(),
                })
                .eq("id", user.id);
            }
          }
        }
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
