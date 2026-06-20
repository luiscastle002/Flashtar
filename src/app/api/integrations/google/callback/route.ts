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

  if (error) {
    console.error("Google OAuth error callback:", error);
    return NextResponse.redirect(new URL("/settings?google_drive=error", request.url));
  }

  if (!code) {
    return NextResponse.json({ error: "Missing authorization code" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // 1. Exchange authorization code for tokens
    // The redirect URI must exactly match the one configured in the Google Cloud Console
    const redirectUri = `${new URL(request.url).origin}/api/integrations/google/callback`;
    const tokens = await exchangeAuthCodeForTokens(code, redirectUri);
    const { access_token, refresh_token } = tokens;

    if (!refresh_token) {
      // In some cases, Google does not return a refresh token if the app was already authorized.
      // E.g., user is reconnecting. We should prompt them to reconnect or ensure we have prompt=consent.
      console.warn("No refresh token returned by Google OAuth. The user may need to revoke access or prompt=consent was missed.");
    }

    // 2. Retrieve user's Google email to display on Settings
    const userinfoResp = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    
    let googleEmail = "connected-account@google.com";
    if (userinfoResp.ok) {
      const userinfo = await userinfoResp.json();
      if (userinfo.email) {
        googleEmail = userinfo.email;
      }
    }

    // 3. Encrypt the refresh token
    // If we didn't get a refresh token, check if we already have one stored
    let encryptedRefreshToken = "";
    if (refresh_token) {
      encryptedRefreshToken = encryptToken(refresh_token);
    } else {
      const { data: existingConn } = await supabase
        .from("user_google_drive_connections")
        .select("encrypted_refresh_token")
        .eq("user_id", user.id)
        .single();
      
      if (existingConn) {
        encryptedRefreshToken = existingConn.encrypted_refresh_token;
      } else {
        // We absolutely need a refresh token for background operations
        console.error("No refresh token returned and no existing token found in database.");
        return NextResponse.redirect(new URL("/settings?google_drive=consent_required", request.url));
      }
    }

    // 4. Initialize Folder hierarchy on user's Google Drive
    let rootFolderId = await findFolderInDrive(access_token, "Flashtar");
    if (!rootFolderId) {
      rootFolderId = await createFolderInDrive(access_token, "Flashtar");
    }

    let audioFolderId = await findFolderInDrive(access_token, "Audio", rootFolderId);
    if (!audioFolderId) {
      audioFolderId = await createFolderInDrive(access_token, "Audio", rootFolderId);
    }

    // 5. Save/upsert connection metadata to user_google_drive_connections table
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
      console.error("Failed to save Google Drive connection in database:", upsertError);
      throw upsertError;
    }

    // 6. Redirect back to settings page with connected status
    return NextResponse.redirect(new URL("/settings?google_drive=connected", request.url));
  } catch (err) {
    console.error("Google OAuth Callback Handler crash:", err);
    return NextResponse.redirect(new URL("/settings?google_drive=error", request.url));
  }
}
