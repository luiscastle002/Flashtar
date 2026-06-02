import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { generateDeckWithAI } from "@/lib/openai/generate-deck";
import { rateLimit } from "@/lib/rate-limit";
import { canGenerateDeck } from "@/lib/queries/user";

const generateSchema = z.object({
  prompt: z.string().min(10).max(2000),
  language: z.string().default("English"),
  difficulty: z.enum(["beginner", "intermediate", "advanced"]),
  cardCount: z.number().int().min(1).max(500),
  cardType: z.enum(["basic", "cloze", "mixed"]),
});

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limit = rateLimit(`generate:${user.id}`, { windowMs: 60_000, maxRequests: 5 });
  if (!limit.success) {
    return NextResponse.json({ error: "Too many requests. Please wait a moment." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = generateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request data" }, { status: 400 });
  }

  const { prompt, language, difficulty, cardCount, cardType } = parsed.data;

  const permission = await canGenerateDeck(cardCount);
  if (!permission.allowed) {
    return NextResponse.json({ error: permission.reason }, { status: 403 });
  }

  const { data: generation, error: genError } = await supabase
    .from("ai_generations")
    .insert({
      user_id: user.id,
      prompt,
      status: "processing",
      card_count: cardCount,
    })
    .select()
    .single();

  if (genError || !generation) {
    return NextResponse.json({ error: "Failed to start generation" }, { status: 500 });
  }

  try {
    const { deck, tokensUsed } = await generateDeckWithAI({
      prompt,
      language,
      difficulty,
      cardCount,
      cardType,
    });

    const { data: savedDeck, error: deckError } = await supabase
      .from("decks")
      .insert({
        user_id: user.id,
        name: deck.deckName,
        description: deck.description ?? null,
        language: language.slice(0, 10),
        card_type: cardType,
        difficulty,
      })
      .select()
      .single();

    if (deckError || !savedDeck) {
      throw new Error(deckError?.message ?? "Failed to save deck");
    }

    const flashcards = deck.cards.map((card, index) => ({
      deck_id: savedDeck.id,
      front: card.front,
      back: card.back,
      card_type: card.card_type ?? (cardType === "mixed" ? "basic" : cardType),
      position: index,
    }));

    const { error: cardsError } = await supabase.from("flashcards").insert(flashcards);
    if (cardsError) throw new Error(cardsError.message);

    await supabase
      .from("ai_generations")
      .update({
        status: "completed",
        deck_id: savedDeck.id,
        tokens_used: tokensUsed,
        card_count: deck.cards.length,
      })
      .eq("id", generation.id);

    return NextResponse.json({
      deck: savedDeck,
      cardCount: deck.cards.length,
      generationId: generation.id,
    });
  } catch (error) {
    await supabase
      .from("ai_generations")
      .update({
        status: "failed",
        error_message: error instanceof Error ? error.message : "Generation failed",
      })
      .eq("id", generation.id);

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Generation failed" },
      { status: 500 }
    );
  }
}
