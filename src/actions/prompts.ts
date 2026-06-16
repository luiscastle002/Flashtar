"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/queries/user";
import type { SavedPrompt } from "@/types";

export async function getSavedPrompts(): Promise<SavedPrompt[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("saved_prompts")
    .select("*")
    .eq("user_id", user.id)
    .order("is_favorite", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    console.error("GET_SAVED_PROMPTS_ERROR:", error);
    return [];
  }

  return (data ?? []) as SavedPrompt[];
}

export async function createSavedPrompt(name: string, content: string) {
  const user = await getCurrentUser();
  if (!user) return { error: "Not authenticated" };

  if (!name.trim()) return { error: "Prompt name cannot be empty" };
  if (!content.trim()) return { error: "Prompt content cannot be empty" };
  if (content.length > 5000) return { error: "Prompt content exceeds 5000 characters limit" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("saved_prompts")
    .insert({ user_id: user.id, name: name.trim(), content: content.trim() })
    .select()
    .single();

  if (error) return { error: error.message };
  revalidatePath("/generate");
  return { data: data as SavedPrompt };
}

export async function updateSavedPrompt(
  id: string,
  updates: Partial<Omit<SavedPrompt, "id" | "user_id" | "created_at" | "updated_at">>
) {
  const user = await getCurrentUser();
  if (!user) return { error: "Not authenticated" };

  const supabase = await createClient();

  // If setting this prompt as default, unset others first to prevent unique trigger constraint violations
  if (updates.is_default) {
    const { error: unsetError } = await supabase
      .from("saved_prompts")
      .update({ is_default: false })
      .eq("user_id", user.id);
    
    if (unsetError) {
      return { error: `Failed to clear previous defaults: ${unsetError.message}` };
    }
  }

  const { data, error } = await supabase
    .from("saved_prompts")
    .update(updates)
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) return { error: error.message };
  revalidatePath("/generate");
  return { data: data as SavedPrompt };
}

export async function deleteSavedPrompt(id: string) {
  const user = await getCurrentUser();
  if (!user) return { error: "Not authenticated" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("saved_prompts")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { error: error.message };
  revalidatePath("/generate");
  return { success: true };
}
