import { decryptToken } from "../utils/crypto";
import { createClient } from "../supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

interface TokenRefreshResponse {
  accessToken: string;
  expiresIn: number;
}

interface UploadFileResponse {
  fileId: string;
}

/**
 * Exchange an OAuth authorization code for Google Access and Refresh Tokens.
 */
export async function exchangeAuthCodeForTokens(code: string, redirectUri: string) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  
  if (!clientId || !clientSecret) {
    throw new Error("Google OAuth credentials are not configured in environment variables.");
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    console.error("Google Token Exchange Error:", errorData);
    throw new Error(errorData.error_description || errorData.error || "Failed to exchange authorization code.");
  }

  return response.json(); // Contains access_token, refresh_token, expires_in
}

/**
 * Refreshes the Google OAuth Access Token using a Refresh Token.
 */
export async function refreshGoogleAccessToken(refreshToken: string): Promise<TokenRefreshResponse> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("Google OAuth credentials are not configured in environment variables.");
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    console.error("Google Access Token Refresh Error:", errorData);
    throw new Error(errorData.error || "Failed to refresh Google access token.");
  }

  const data = await response.json();
  return {
    accessToken: data.access_token,
    expiresIn: data.expires_in,
  };
}

/**
 * Searches for a folder in Google Drive. Returns its ID if found, otherwise null.
 */
export async function findFolderInDrive(accessToken: string, folderName: string, parentId?: string): Promise<string | null> {
  let query = `name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  if (parentId) {
    query += ` and '${parentId}' in parents`;
  }

  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id)`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok) {
    const err = await response.json();
    console.error("findFolderInDrive error:", err);
    return null;
  }

  const data = await response.json();
  if (data.files && data.files.length > 0) {
    return data.files[0].id;
  }
  return null;
}

/**
 * Creates a new folder in Google Drive.
 */
export async function createFolderInDrive(accessToken: string, folderName: string, parentId?: string): Promise<string> {
  const body: Record<string, unknown> = {
    name: folderName,
    mimeType: "application/vnd.google-apps.folder",
  };

  if (parentId) {
    body.parents = [parentId];
  }

  const response = await fetch("https://www.googleapis.com/drive/v3/files", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.json();
    console.error("createFolderInDrive error:", err);
    throw new Error("Failed to create folder in Google Drive.");
  }

  const data = await response.json();
  return data.id;
}

/**
 * High-level helper: Fetches active access token for a user.
 * Automatically refreshes it if expired (and updates connection).
 *
 * @param userId - The user's UUID.
 * @param supabaseClient - Optional pre-built Supabase client. Pass `createAdminClient()`
 *   when calling from a background worker that has no authenticated session (RLS bypass).
 *   Defaults to the cookie-based user client.
 */
export async function getGoogleAccessTokenForUser(
  userId: string,
  supabaseClient?: SupabaseClient
): Promise<string> {
  // Use provided client or fall back to the cookie-based user client.
  const supabase = supabaseClient ?? (await createClient());

  const { data: connection, error } = await supabase
    .from("user_google_drive_connections")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (error || !connection) {
    throw new Error("GOOGLE_DRIVE_NOT_CONNECTED");
  }

  if (connection.connection_status === "revoked" || connection.connection_status === "reconnect_required") {
    throw new Error("GOOGLE_DRIVE_CONNECTION_INVALID");
  }

  // Since we only store the encrypted_refresh_token (never the short-lived access_token),
  // we always exchange it for a fresh access token on every server-side call.
  try {
    const decryptedRefresh = decryptToken(connection.encrypted_refresh_token);
    const refreshed = await refreshGoogleAccessToken(decryptedRefresh);
    return refreshed.accessToken;
  } catch (refreshErr) {
    console.error("[Google] Failed to refresh access token for user:", userId, refreshErr);

    // Mark the connection as requiring reconnection so the user is prompted.
    await supabase
      .from("user_google_drive_connections")
      .update({ connection_status: "reconnect_required" })
      .eq("user_id", userId);

    throw new Error("GOOGLE_DRIVE_REFRESH_FAILED");
  }
}

/**
 * Binary-safe helper to construct multipart/related POST body.
 */
function buildMultipartBody(
  metadata: Record<string, unknown>,
  mediaBuffer: Buffer,
  mediaType: string
): { body: Uint8Array; contentType: string } {
  const boundary = "flashtar_boundary_" + Date.now();
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--\r\n`;

  const metadataPart = 
    delimiter +
    "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
    JSON.stringify(metadata) +
    "\r\n";

  const mediaPartHeader = 
    delimiter +
    `Content-Type: ${mediaType}\r\n\r\n`;

  const enc = new TextEncoder();
  const metadataBytes = enc.encode(metadataPart);
  const mediaPartHeaderBytes = enc.encode(mediaPartHeader);
  const closeDelimiterBytes = enc.encode(closeDelimiter);

  const totalLength = metadataBytes.length + mediaPartHeaderBytes.length + mediaBuffer.length + closeDelimiterBytes.length;
  const multipartBody = new Uint8Array(totalLength);
  
  let offset = 0;
  multipartBody.set(metadataBytes, offset);
  offset += metadataBytes.length;
  
  multipartBody.set(mediaPartHeaderBytes, offset);
  offset += mediaPartHeaderBytes.length;
  
  multipartBody.set(new Uint8Array(mediaBuffer), offset);
  offset += mediaBuffer.length;
  
  multipartBody.set(closeDelimiterBytes, offset);

  return {
    body: multipartBody,
    contentType: `multipart/related; boundary=${boundary}`,
  };
}

/**
 * Uploads an audio buffer to a user's Google Drive folder.
 * Implements automatic directory recovery if the target folder returns 404.
 */
export async function uploadAudioFileToDrive(
  userId: string,
  accessToken: string,
  fileName: string,
  audioBuffer: Buffer,
  supabaseClient?: SupabaseClient
): Promise<UploadFileResponse> {
  const supabase = supabaseClient ?? (await createClient());

  const { data: connection } = await supabase
    .from("user_google_drive_connections")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (!connection) {
    throw new Error("Google Drive connection not found.");
  }

  const folderId = connection.audio_folder_id;

  // Closure to execute the upload request
  const attemptUpload = async (targetFolderId: string): Promise<string> => {
    const { body, contentType } = buildMultipartBody(
      {
        name: fileName,
        parents: [targetFolderId],
      },
      audioBuffer,
      "audio/mpeg"
    );

    const response = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": contentType,
      },
      body: Buffer.from(body),
    });

    if (response.status === 403) {
      const err = await response.json();
      if (JSON.stringify(err).includes("quotaExceeded")) {
        throw new Error("GOOGLE_DRIVE_QUOTA_EXCEEDED");
      }
    }

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error("FOLDER_NOT_FOUND");
      }
      const err = await response.json();
      throw new Error(err.error?.message || "Google Drive upload failed.");
    }

    const data = await response.json();
    return data.id;
  };

  try {
    if (!folderId) {
      throw new Error("FOLDER_NOT_FOUND");
    }
    const fileId = await attemptUpload(folderId);
    return { fileId };
  } catch (err) {
    const errorObj = err as Error;
    if (errorObj.message === "FOLDER_NOT_FOUND") {
      // Recovery Flow: Re-create root and audio folder
      console.log("Audio folder missing or deleted in Google Drive. Starting automatic recovery...");
      
      let rootId = await findFolderInDrive(accessToken, "Flashtar");
      if (!rootId) {
        rootId = await createFolderInDrive(accessToken, "Flashtar");
      }
      
      let newAudioFolderId = await findFolderInDrive(accessToken, "Audio", rootId);
      if (!newAudioFolderId) {
        newAudioFolderId = await createFolderInDrive(accessToken, "Audio", rootId);
      }

      // Sync new folder IDs to DB
      await supabase
        .from("user_google_drive_connections")
        .update({
          root_folder_id: rootId,
          audio_folder_id: newAudioFolderId,
          connection_status: "connected",
        })
        .eq("user_id", userId);

      // Re-attempt upload with new folder
      const fileId = await attemptUpload(newAudioFolderId);
      return { fileId };
    }
    throw err;
  }
}

/**
 * Polls Google Drive API to verify the file is ready and accessible.
 * Returns true if ready, false if it times out.
 */
export async function waitForDriveFileReady(
  accessToken: string,
  fileId: string,
  retries = 3,
  delayMs = 500
): Promise<boolean> {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );
      if (response.ok) {
        return true;
      }
      console.warn(`[Audio] Drive file ${fileId} not ready yet (status ${response.status}). Retrying...`);
    } catch (err) {
      console.warn(`[Audio] Drive file readiness check error:`, err);
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return false;
}

/**
 * Deletes a file from Google Drive by its fileId.
 */
export async function deleteAudioFileFromDrive(
  accessToken: string,
  fileId: string
): Promise<void> {
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error(`[Google Error] Failed to delete file ${fileId} from Drive: ${response.status}`, errText);
    throw new Error("Failed to delete file from Google Drive.");
  }
}


