"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, getProfile } from "@/lib/queries/user";
import { getProfileAvatarUrl } from "@/lib/utils/image";

/**
 * Extracts Google avatar URL from user metadata
 */
export async function getGoogleAvatar(): Promise<string | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  return user.user_metadata?.avatar_url ?? user.user_metadata?.picture ?? null;
}

/**
 * Returns the active profile avatar URL, appending a cache-buster timestamp if custom
 */
export async function getProfileAvatar(): Promise<string | null> {
  const profile = await getProfile();
  if (!profile) return null;

  if (profile.avatar_type === "custom" && profile.custom_avatar_path) {
    const url = getProfileAvatarUrl(profile.custom_avatar_path);
    if (url) {
      const ts = new Date(profile.updated_at).getTime();
      return `${url}?t=${ts}`;
    }
  }
  return profile.avatar_url;
}

/**
 * Updates the user's profile to use a custom uploaded image
 */
export async function updateProfileAvatar(customAvatarPath: string) {
  const user = await getCurrentUser();
  if (!user) return { error: "Not authenticated" };

  if (!customAvatarPath) return { error: "Custom avatar path is required" };

  const supabase = await createClient();
  const publicUrl = getProfileAvatarUrl(customAvatarPath);
  if (!publicUrl) return { error: "Failed to resolve avatar URL" };

  const { data, error } = await supabase
    .from("profiles")
    .update({
      avatar_type: "custom",
      custom_avatar_path: customAvatarPath,
      avatar_url: publicUrl,
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id)
    .select()
    .single();

  if (error) return { error: error.message };

  revalidatePath("/settings");
  revalidatePath("/dashboard");
  return { success: true, data };
}

/**
 * Resets the user's profile to use their Google avatar (if available) and removes custom image from storage
 */
export async function resetToGoogleAvatar() {
  const user = await getCurrentUser();
  if (!user) return { error: "Not authenticated" };

  const profile = await getProfile();
  if (!profile) return { error: "Profile not found" };

  const supabase = await createClient();

  // If there's an existing custom avatar in storage, delete it to prevent orphaned files
  if (profile.custom_avatar_path) {
    // Relative path to the bucket: "userId.webp"
    const relativePath = profile.custom_avatar_path.replace("profile-icons/", "");
    await supabase.storage.from("profile-icons").remove([relativePath]);
  }

  // Get Google avatar from metadata
  const googleAvatarUrl = user.user_metadata?.avatar_url ?? user.user_metadata?.picture ?? null;

  const { data, error } = await supabase
    .from("profiles")
    .update({
      avatar_type: "google",
      custom_avatar_path: null,
      avatar_url: googleAvatarUrl,
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id)
    .select()
    .single();

  if (error) return { error: error.message };

  revalidatePath("/settings");
  revalidatePath("/dashboard");
  return { success: true, data };
}
