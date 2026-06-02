"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/queries/user";

const deckSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  language: z.string().default("en"),
  card_type: z.enum(["basic", "cloze", "mixed"]).default("basic"),
  difficulty: z.enum(["beginner", "intermediate", "advanced"]).default("intermediate"),
});

export async function createDeck(input: z.input<typeof deckSchema>) {
  const user = await getCurrentUser();
  if (!user) return { error: "Not authenticated" };

  const parsed = deckSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid deck data" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("decks")
    .insert({ ...parsed.data, user_id: user.id })
    .select()
    .single();

  if (error) return { error: error.message };
  revalidatePath("/decks");
  revalidatePath("/dashboard");
  return { data };
}

export async function updateDeck(
  deckId: string,
  input: Partial<z.infer<typeof deckSchema>>
) {
  const user = await getCurrentUser();
  if (!user) return { error: "Not authenticated" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("decks")
    .update(input)
    .eq("id", deckId)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) return { error: error.message };
  revalidatePath("/decks");
  revalidatePath(`/decks/${deckId}`);
  revalidatePath("/dashboard");
  return { data };
}

export async function deleteDeck(deckId: string) {
  const user = await getCurrentUser();
  if (!user) return { error: "Not authenticated" };

  const supabase = await createClient();
  const { error } = await supabase.from("decks").delete().eq("id", deckId).eq("user_id", user.id);

  if (error) return { error: error.message };
  revalidatePath("/decks");
  revalidatePath("/dashboard");
  return { success: true };
}

export async function duplicateDeck(deckId: string) {
  const user = await getCurrentUser();
  if (!user) return { error: "Not authenticated" };

  const supabase = await createClient();
  const { data: deck } = await supabase
    .from("decks")
    .select("*")
    .eq("id", deckId)
    .eq("user_id", user.id)
    .single();

  if (!deck) return { error: "Deck not found" };

  const { data: cards } = await supabase
    .from("flashcards")
    .select("*")
    .eq("deck_id", deckId)
    .order("position");

  const { data: newDeck, error: deckError } = await supabase
    .from("decks")
    .insert({
      user_id: user.id,
      name: `${deck.name} (Copy)`,
      description: deck.description,
      language: deck.language,
      card_type: deck.card_type,
      difficulty: deck.difficulty,
    })
    .select()
    .single();

  if (deckError || !newDeck) return { error: deckError?.message ?? "Failed to duplicate deck" };

  if (cards?.length) {
    await supabase.from("flashcards").insert(
      cards.map((card) => ({
        deck_id: newDeck.id,
        front: card.front,
        back: card.back,
        card_type: card.card_type,
        position: card.position,
      }))
    );
  }

  revalidatePath("/decks");
  revalidatePath("/dashboard");
  return { data: newDeck };
}
