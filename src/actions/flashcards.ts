"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/queries/user";

const flashcardSchema = z.object({
  front: z.string().min(1),
  back: z.string(),
  card_type: z.enum(["basic", "cloze", "mixed"]).default("basic"),
  position: z.number().int().min(0),
});

async function verifyDeckOwnership(deckId: string, userId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("decks")
    .select("id")
    .eq("id", deckId)
    .eq("user_id", userId)
    .single();
  return !!data;
}

export async function createFlashcard(
  deckId: string,
  input: Omit<z.infer<typeof flashcardSchema>, "position"> & { position?: number }
) {
  const user = await getCurrentUser();
  if (!user) return { error: "errors.auth.not_authenticated" };
  if (!(await verifyDeckOwnership(deckId, user.id))) return { error: "errors.decks.not_found" };

  const supabase = await createClient();

  let position = input.position;
  if (position === undefined) {
    const { count } = await supabase
      .from("flashcards")
      .select("id", { count: "exact", head: true })
      .eq("deck_id", deckId);
    position = count ?? 0;
  }

  const parsed = flashcardSchema.safeParse({ ...input, position });
  if (!parsed.success) return { error: "errors.flashcards.invalid_data" };

  const { data, error } = await supabase
    .from("flashcards")
    .insert({ ...parsed.data, deck_id: deckId })
    .select()
    .single();

  if (error) return { error: error.message };
  revalidatePath(`/decks/${deckId}`);
  return { data };
}

export async function updateFlashcard(
  flashcardId: string,
  deckId: string,
  input: Partial<z.infer<typeof flashcardSchema>>
) {
  const user = await getCurrentUser();
  if (!user) return { error: "errors.auth.not_authenticated" };
  if (!(await verifyDeckOwnership(deckId, user.id))) return { error: "errors.decks.not_found" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("flashcards")
    .update(input)
    .eq("id", flashcardId)
    .eq("deck_id", deckId)
    .select()
    .single();

  if (error) return { error: error.message };
  revalidatePath(`/decks/${deckId}`);
  return { data };
}

export async function deleteFlashcard(flashcardId: string, deckId: string) {
  const user = await getCurrentUser();
  if (!user) return { error: "errors.auth.not_authenticated" };
  if (!(await verifyDeckOwnership(deckId, user.id))) return { error: "errors.decks.not_found" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("flashcards")
    .delete()
    .eq("id", flashcardId)
    .eq("deck_id", deckId);

  if (error) return { error: error.message };
  revalidatePath(`/decks/${deckId}`);
  return { success: true };
}

export async function reorderFlashcards(
  deckId: string,
  orderedIds: string[]
) {
  const user = await getCurrentUser();
  if (!user) return { error: "errors.auth.not_authenticated" };
  if (!(await verifyDeckOwnership(deckId, user.id))) return { error: "errors.decks.not_found" };

  const supabase = await createClient();
  const updates = orderedIds.map((id, index) =>
    supabase.from("flashcards").update({ position: index }).eq("id", id).eq("deck_id", deckId)
  );

  await Promise.all(updates);
  revalidatePath(`/decks/${deckId}`);
  return { success: true };
}

export async function bulkUpdateFlashcards(
  deckId: string,
  cards: Array<{ id: string; front: string; back: string; card_type?: string }>
) {
  const user = await getCurrentUser();
  if (!user) return { error: "errors.auth.not_authenticated" };
  if (!(await verifyDeckOwnership(deckId, user.id))) return { error: "errors.decks.not_found" };

  const supabase = await createClient();
  const updates = cards.map((card, index) =>
    supabase
      .from("flashcards")
      .update({
        front: card.front,
        back: card.back,
        card_type: card.card_type ?? "basic",
        position: index,
      })
      .eq("id", card.id)
      .eq("deck_id", deckId)
  );

  await Promise.all(updates);
  revalidatePath(`/decks/${deckId}`);
  return { success: true };
}
