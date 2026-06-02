import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { flashcardsToCsv } from "@/lib/export/csv";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ deckId: string }> }
) {
  const { deckId } = await params;
  const { searchParams } = new URL(request.url);
  const format = searchParams.get("format") ?? "csv";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: deck } = await supabase
    .from("decks")
    .select("*")
    .eq("id", deckId)
    .eq("user_id", user.id)
    .single();

  if (!deck) {
    return NextResponse.json({ error: "Deck not found" }, { status: 404 });
  }

  const { data: cards } = await supabase
    .from("flashcards")
    .select("*")
    .eq("deck_id", deckId)
    .order("position");

  if (format === "csv") {
    const csv = flashcardsToCsv(deck.name, cards ?? []);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="${deck.name.replace(/[^a-z0-9]/gi, "_")}.csv"`,
      },
    });
  }

  return NextResponse.json({ error: "Use client-side export for APKG format" }, { status: 400 });
}
