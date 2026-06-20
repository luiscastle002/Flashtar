"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/queries/user";
import { getGoogleAccessTokenForUser } from "@/lib/integrations/google";

/**
 * Retrieves the Google Picker configuration for the connected user.
 */
export async function getGooglePickerConfig() {
  const user = await getCurrentUser();
  if (!user) return { error: "errors.auth.not_authenticated" };

  const supabase = await createClient();
  const { data: connection, error } = await supabase
    .from("user_google_drive_connections")
    .select("audio_folder_id, connection_status")
    .eq("user_id", user.id)
    .single();

  if (error || !connection) {
    return { error: "Google Drive is not connected." };
  }

  if (connection.connection_status !== "connected") {
    return { error: "Google Drive connection needs to be re-connected." };
  }

  try {
    const accessToken = await getGoogleAccessTokenForUser(user.id);
    return {
      accessToken,
      clientId: process.env.GOOGLE_CLIENT_ID,
      audioFolderId: connection.audio_folder_id,
    };
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return { error: `Failed to retrieve active token: ${errMsg}` };
  }
}

/**
 * Generates the Google Drive OAuth Authorization Redirect URL.
 */
export async function getGoogleAuthUrl() {
  const user = await getCurrentUser();
  if (!user) return { error: "errors.auth.not_authenticated" };

  const clientId = process.env.GOOGLE_CLIENT_ID;
  
  // Enforce correct redirection domain matching current host or app url fallback
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const redirectUri = `${appUrl}/api/integrations/google/callback`;
  
  if (!clientId) {
    return { error: "Google OAuth Client ID is not configured." };
  }

  const scopes = [
    "https://www.googleapis.com/auth/drive.file",
    "https://www.googleapis.com/auth/userinfo.email"
  ];

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: scopes.join(" "),
    access_type: "offline",
    prompt: "consent",
    state: user.id, // CSRF/mapping token
  });

  const url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  return { url };
}

/**
 * Disconnects the Google Drive integration for the user.
 */
export async function disconnectGoogleDrive() {
  const user = await getCurrentUser();
  if (!user) return { error: "errors.auth.not_authenticated" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("user_google_drive_connections")
    .delete()
    .eq("user_id", user.id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/settings");
  return { success: true };
}

/**
 * Resets the status of user's quota_exceeded or failed queue items back to pending.
 */
export async function reSyncFailedUploads() {
  const user = await getCurrentUser();
  if (!user) return { error: "errors.auth.not_authenticated" };

  const supabase = await createClient();
  
  // Update status from quota_exceeded/failed/rate_limited to pending
  const { data, error } = await supabase
    .from("media_upload_queue")
    .update({
      status: "pending",
      retry_count: 0,
      google_rate_limited: false,
      error_message: null,
      next_retry_at: null,
      updated_at: new Date().toISOString()
    })
    .eq("user_id", user.id)
    .in("status", ["quota_exceeded", "failed", "rate_limited"])
    .select();

  if (error) {
    return { error: error.message };
  }

  // Create usage history entry to log the re-sync action
  await supabase.from("audio_usage_history").insert({
    user_id: user.id,
    characters_consumed: 0,
    action_type: "re_sync",
    source_details: { reset_count: data?.length ?? 0 }
  });

  revalidatePath("/settings");
  return { success: true, count: data?.length ?? 0 };
}

