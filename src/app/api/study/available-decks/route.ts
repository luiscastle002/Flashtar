import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/queries/user";

/**
 * GET /api/study/available-decks
 * Returns the user's AI-generated decks with card counts.
 * Used by the ImportToStudyDeckButton to populate the deck list.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createClient();

  const { data: decks, error } = await supabase
    .from("decks")
    .select("id, name")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!decks?.length) {
    return NextResponse.json({ decks: [] });
  }

  // Get card counts
  const deckIds = decks.map((d) => d.id);
  const { data: flashcards } = await supabase
    .from("flashcards")
    .select("deck_id")
    .in("deck_id", deckIds);

  const countMap = (flashcards ?? []).reduce<Record<string, number>>((acc, row) => {
    acc[row.deck_id] = (acc[row.deck_id] ?? 0) + 1;
    return acc;
  }, {});

  const result = decks.map((d) => ({
    id: d.id,
    name: d.name,
    flashcard_count: countMap[d.id] ?? 0,
  }));

  return NextResponse.json({ decks: result });
}
