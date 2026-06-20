"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, canCreateStudyDeck } from "@/lib/queries/user";

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const studyDeckSchema = z.object({
  name: z.string().min(1, "Name is required").max(200, "Name too long"),
  description: z.string().max(1000, "Description too long").nullable().optional(),
  emoji: z.string().max(10).nullable().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Invalid hex color").optional(),
  icon_type: z.enum(["emoji", "image"]).optional(),
  custom_icon_path: z.string().max(1000).nullable().optional(),
});

const settingsSchema = z.object({
  new_cards_per_day: z.number().int().min(0).max(9999),
  max_reviews_per_day: z.number().int().min(0).max(9999),
  learning_steps: z.array(z.string().regex(/^\d+(\.\d+)?[mhd]$/i, "Invalid step format (e.g. '1m', '10m', '1d')")),
  graduating_interval: z.number().int().min(1),
  easy_interval: z.number().int().min(1),
  relearning_steps: z.array(z.string().regex(/^\d+(\.\d+)?[mhd]$/i)),
  leech_threshold: z.number().int().min(1).max(50),
  leech_action: z.enum(["suspend", "tag_only"]),
  maximum_interval: z.number().int().min(1),
  ease_minimum: z.number().min(1.0).max(3.0),
  new_card_order: z.enum(["due", "random"]),
  show_confidence_bar: z.boolean(),
  show_card_preview: z.boolean().optional(),
  autoplay_audio_front: z.boolean().optional(),
  autoplay_audio_back: z.boolean().optional(),
});

// ---------------------------------------------------------------------------
// createStudyDeck
// ---------------------------------------------------------------------------

export async function createStudyDeck(input: z.input<typeof studyDeckSchema>) {
  const user = await getCurrentUser();
  if (!user) return { error: "errors.auth.not_authenticated" };

  // Billing gate: check deck limit
  const gate = await canCreateStudyDeck();
  if (!gate.allowed) {
    return { error: gate.reason ?? "errors.study_decks.limit_reached" };
  }

  const parsed = studyDeckSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "errors.study_decks.invalid_data" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("study_decks")
    .insert({
      user_id: user.id,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      emoji: parsed.data.emoji ?? null,
      color: parsed.data.color ?? "#6366f1",
      icon_type: parsed.data.icon_type ?? "emoji",
      custom_icon_path: parsed.data.custom_icon_path ?? null,
    })
    .select()
    .single();

  if (error) return { error: error.message };

  revalidatePath("/study");
  revalidatePath("/dashboard");
  return { data };
}

// ---------------------------------------------------------------------------
// updateStudyDeck
// ---------------------------------------------------------------------------

export async function updateStudyDeck(
  deckId: string,
  input: Partial<z.infer<typeof studyDeckSchema>>
) {
  const user = await getCurrentUser();
  if (!user) return { error: "errors.auth.not_authenticated" };

  const parsed = studyDeckSchema.partial().safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "errors.study_decks.invalid_data" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("study_decks")
    .update(parsed.data)
    .eq("id", deckId)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) return { error: error.message };

  revalidatePath("/study");
  revalidatePath(`/study/${deckId}`);
  return { data };
}

// ---------------------------------------------------------------------------
// archiveStudyDeck
// ---------------------------------------------------------------------------

export async function archiveStudyDeck(deckId: string, archive = true) {
  const user = await getCurrentUser();
  if (!user) return { error: "errors.auth.not_authenticated" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("study_decks")
    .update({ is_archived: archive })
    .eq("id", deckId)
    .eq("user_id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/study");
  revalidatePath("/dashboard");
  return { success: true };
}

// ---------------------------------------------------------------------------
// deleteStudyDeck
// ---------------------------------------------------------------------------

export async function deleteStudyDeck(deckId: string) {
  const user = await getCurrentUser();
  if (!user) return { error: "errors.auth.not_authenticated" };

  const supabase = await createClient();

  // Fetch custom_icon_path before deletion to purge storage
  const { data: deck } = await supabase
    .from("study_decks")
    .select("custom_icon_path")
    .eq("id", deckId)
    .eq("user_id", user.id)
    .single();

  if (deck?.custom_icon_path) {
    // Delete the file from the deck-icons storage bucket
    await supabase.storage.from("deck-icons").remove([deck.custom_icon_path]);
  }

  const { error } = await supabase
    .from("study_decks")
    .delete()
    .eq("id", deckId)
    .eq("user_id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/study");
  revalidatePath("/dashboard");
  return { success: true };
}

// ---------------------------------------------------------------------------
// updateDeckSettings
// ---------------------------------------------------------------------------

export async function updateDeckSettings(
  deckId: string,
  input: Partial<z.infer<typeof settingsSchema>>
) {
  const user = await getCurrentUser();
  if (!user) return { error: "errors.auth.not_authenticated" };

  const parsed = settingsSchema.partial().safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "errors.study_decks.invalid_settings" };
  }

  const supabase = await createClient();

  // Verify the deck belongs to this user before touching settings
  const { data: deck } = await supabase
    .from("study_decks")
    .select("id")
    .eq("id", deckId)
    .eq("user_id", user.id)
    .single();

  if (!deck) return { error: "errors.study_decks.not_found" };

  const { data, error } = await supabase
    .from("deck_study_settings")
    .update(parsed.data)
    .eq("study_deck_id", deckId)
    .select()
    .single();

  if (error) return { error: error.message };

  revalidatePath(`/study/${deckId}`);
  return { data };
}

// ---------------------------------------------------------------------------
// getStudyDecks
// ---------------------------------------------------------------------------

export async function getStudyDecks(includeArchived = false) {
  const user = await getCurrentUser();
  if (!user) return [];

  const supabase = await createClient();
  let query = supabase
    .from("study_decks")
    .select("*")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  if (!includeArchived) {
    query = query.eq("is_archived", false);
  }

  const { data } = await query;
  return data ?? [];
}

// ---------------------------------------------------------------------------
// getStudyDeckWithSettings
// ---------------------------------------------------------------------------

export async function getStudyDeckWithSettings(deckId: string) {
  const user = await getCurrentUser();
  if (!user) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("study_decks")
    .select("*, deck_study_settings(*)")
    .eq("id", deckId)
    .eq("user_id", user.id)
    .single();

  return data;
}

// ---------------------------------------------------------------------------
// getDeckDueCounts — calls Postgres RPC
// ---------------------------------------------------------------------------

export async function getDeckDueCounts(deckId: string) {
  const user = await getCurrentUser();
  if (!user) return null;

  const supabase = await createClient();
  const { data } = await supabase.rpc("get_study_deck_due_counts", {
    p_deck_id: deckId,
    p_user_id: user.id,
  });

  if (!data?.[0]) return { new_count: 0, learn_count: 0, review_count: 0, total_due: 0 };
  return data[0] as { new_count: number; learn_count: number; review_count: number; total_due: number };
}
