import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { flashcardsToCsv } from "@/lib/export/csv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  const safeName =
  (deck.name ?? "deck").replace(/[^a-z0-9]/gi, "_");

  if (format === "csv") {
    const csv = flashcardsToCsv(deck.name, cards ?? []);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="${safeName}.csv"`,
      },
    });
  }

  if (format === "apkg") {
    return NextResponse.json(
      { error: "APKG export is now generated directly in the browser." },
      { status: 400 }
    );
  }

  return NextResponse.json({ error: "Unsupported export format" }, { status: 400 });
}
