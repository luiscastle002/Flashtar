import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { 
  exchangeAuthCodeForTokens, 
  findFolderInDrive, 
  createFolderInDrive 
} from "@/lib/integrations/google";
import { encryptToken } from "@/lib/utils/crypto";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  // 1. Check for Google OAuth Consent Screen errors
  if (error) {
    console.error("[Google OAuth Callback] Error parameter received from Google:", error);
    return NextResponse.redirect(new URL(`/settings?google_drive=error&code=oauth_denied&details=${encodeURIComponent(error)}`, request.url));
  }

  if (!code) {
    console.error("[Google OAuth Callback] Code parameter is missing.");
    return NextResponse.redirect(new URL("/settings?google_drive=error&code=missing_code", request.url));
  }

  // 2. Validate Environment Variables before proceeding
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const encryptionKey = process.env.DRIVE_TOKEN_ENCRYPTION_KEY;

  if (!clientId || !clientSecret) {
    console.error("[Google OAuth Callback] Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET env variables.");
    return NextResponse.redirect(new URL("/settings?google_drive=error&code=missing_credentials", request.url));
  }

  if (!encryptionKey) {
    console.error("[Google OAuth Callback] Missing DRIVE_TOKEN_ENCRYPTION_KEY env variable.");
    return NextResponse.redirect(new URL("/settings?google_drive=error&code=missing_encryption_key", request.url));
  }

  // 3. Authenticate Supabase User
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    console.error("[Google OAuth Callback] Supabase user authentication failed:", userError?.message || "No user session");
    return NextResponse.redirect(new URL("/settings?google_drive=error&code=unauthorized", request.url));
  }

  try {
    // 4. Exchange Auth Code (Enforcing static production APP_URL match)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
    // Strip trailing slash if present to avoid redirect_uri mismatch
    const normalizedAppUrl = appUrl.endsWith("/") ? appUrl.slice(0, -1) : appUrl;
    const redirectUri = `${normalizedAppUrl}/api/integrations/google/callback`;
    
    console.log(`[Google OAuth Callback] Exchanging code. redirectUri: ${redirectUri}`);
    
    const tokens = await exchangeAuthCodeForTokens(code, redirectUri);
    const { access_token, refresh_token } = tokens;

    if (!access_token) {
      throw new Error("Google token response did not contain an access_token.");
    }

    // 5. Retrieve Google User Email
    const userinfoResp = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    
    let googleEmail = "connected-account@google.com";
    if (userinfoResp.ok) {
      const userinfo = await userinfoResp.json();
      if (userinfo.email) {
        googleEmail = userinfo.email;
      }
    } else {
      console.warn("[Google OAuth Callback] Failed to fetch Google userinfo profile, using fallback email.");
    }

    // 6. Handle Encrypted Refresh Token
    let encryptedRefreshToken = "";
    if (refresh_token) {
      encryptedRefreshToken = encryptToken(refresh_token);
    } else {
      console.warn("[Google OAuth Callback] No refresh token returned. Checking existing database connections...");
      const { data: existingConn } = await supabase
        .from("user_google_drive_connections")
        .select("encrypted_refresh_token")
        .eq("user_id", user.id)
        .single();
      
      if (existingConn?.encrypted_refresh_token) {
        encryptedRefreshToken = existingConn.encrypted_refresh_token;
      } else {
        console.error("[Google OAuth Callback] No refresh token returned and no existing connection found.");
        return NextResponse.redirect(new URL("/settings?google_drive=consent_required", request.url));
      }
    }

    // 7. Setup Directory Structure
    let rootFolderId = await findFolderInDrive(access_token, "Flashtar");
    if (!rootFolderId) {
      rootFolderId = await createFolderInDrive(access_token, "Flashtar");
    }

    let audioFolderId = await findFolderInDrive(access_token, "Audio", rootFolderId);
    if (!audioFolderId) {
      audioFolderId = await createFolderInDrive(access_token, "Audio", rootFolderId);
    }

    // 8. Upsert connection metadata
    const { error: upsertError } = await supabase
      .from("user_google_drive_connections")
      .upsert({
        user_id: user.id,
        google_email: googleEmail,
        encrypted_refresh_token: encryptedRefreshToken,
        root_folder_id: rootFolderId,
        audio_folder_id: audioFolderId,
        connection_status: "connected",
        updated_at: new Date().toISOString(),
      });

    if (upsertError) {
      console.error("[Google OAuth Callback] Supabase upsert error:", upsertError.message);
      return NextResponse.redirect(new URL(`/settings?google_drive=error&code=database_error&details=${encodeURIComponent(upsertError.message)}`, request.url));
    }

    console.log(`[Google OAuth Callback] Successfully connected user ${user.id} to Google Drive.`);
    return NextResponse.redirect(new URL("/settings?google_drive=connected", request.url));
  } catch (err) {
    const errorObj = err as Error;
    console.error("[Google OAuth Callback] Integration crash details:", {
      message: errorObj.message,
      stack: errorObj.stack,
    });
    return NextResponse.redirect(new URL(`/settings?google_drive=error&code=callback_crash&details=${encodeURIComponent(errorObj.message)}`, request.url));
  }
}
