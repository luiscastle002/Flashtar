"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/queries/user";
import type { StudyCard, DeckStudySettings } from "@/types";
import { scheduleCard, confidenceToRating } from "@/lib/scheduling/sm2";

// ---------------------------------------------------------------------------
// startStudySession
// ---------------------------------------------------------------------------

export async function startStudySession(deckId: string) {
  const user = await getCurrentUser();
  if (!user) return { error: "Not authenticated" };

  const supabase = await createClient();

  // Verify deck belongs to user
  const { data: deck } = await supabase
    .from("study_decks")
    .select("id")
    .eq("id", deckId)
    .eq("user_id", user.id)
    .single();

  if (!deck) return { error: "Deck not found" };

  const { data: session, error } = await supabase
    .from("study_sessions")
    .insert({
      study_deck_id: deckId,
      user_id: user.id,
      started_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) return { error: error.message };
  return { data: session };
}

// ---------------------------------------------------------------------------
// getSessionQueue — calls Postgres RPC
// ---------------------------------------------------------------------------

export async function getSessionQueue(deckId: string) {
  const user = await getCurrentUser();
  if (!user) return { error: "Not authenticated", cards: [] };

  const supabase = await createClient();

  // Get ordered card IDs from the RPC
  const { data: queue, error: queueError } = await supabase.rpc("get_session_queue", {
    p_deck_id: deckId,
    p_user_id: user.id,
  });

  if (queueError) return { error: queueError.message, cards: [] };
  if (!queue?.length) return { cards: [] };

  // Fetch full card data for those IDs (preserving the RPC order)
  const cardIds = queue.map((row: { card_id: string }) => row.card_id);
  const { data: cards, error: cardsError } = await supabase
    .from("study_cards")
    .select("*")
    .in("id", cardIds);

  if (cardsError) return { error: cardsError.message, cards: [] };

  // Re-sort to match the RPC ordering
  const orderMap = new Map(cardIds.map((id: string, i: number) => [id, i]));
  const sorted = (cards ?? []).sort(
    (a, b) => (orderMap.get(a.id) as number) - (orderMap.get(b.id) as number)
  );

  return { cards: sorted as StudyCard[] };
}

// ---------------------------------------------------------------------------
// submitReview
// ---------------------------------------------------------------------------

export async function submitReview({
  sessionId,
  cardId,
  confidencePct,
  durationMs,
}: {
  sessionId: string;
  cardId: string;
  confidencePct: number;  // 0–100 from confidence bar
  durationMs: number;     // how long user spent on the card
}) {
  const user = await getCurrentUser();
  if (!user) return { error: "Not authenticated" };

  const supabase = await createClient();

  // Fetch the card (must belong to user)
  const { data: card, error: cardError } = await supabase
    .from("study_cards")
    .select("*")
    .eq("id", cardId)
    .eq("user_id", user.id)
    .single();

  if (cardError || !card) return { error: "Card not found" };

  // Fetch deck settings
  const { data: settingsRow } = await supabase
    .from("deck_study_settings")
    .select("*")
    .eq("study_deck_id", card.study_deck_id)
    .single();

  if (!settingsRow) return { error: "Deck settings not found" };

  const settings = settingsRow as DeckStudySettings;
  const rating = confidenceToRating(confidencePct);

  // Calculate new scheduling state (pure function — no DB)
  const result = scheduleCard(card as StudyCard, rating, settings);

  // Persist: update study_card + insert review_log in parallel
  const [updateResult, logResult] = await Promise.all([
    supabase
      .from("study_cards")
      .update({
        state: result.state,
        due_at: result.due_at.toISOString(),
        last_reviewed_at: new Date().toISOString(),
        ease_factor: result.ease_factor,
        interval_days: result.interval_days,
        repetitions: result.repetitions,
        lapse_count: result.lapse_count,
        learning_step_index: result.learning_step_index,
      })
      .eq("id", cardId)
      .eq("user_id", user.id),

    supabase.from("review_logs").insert({
      study_card_id: cardId,
      study_deck_id: card.study_deck_id,
      user_id: user.id,
      session_id: sessionId,
      confidence_pct: confidencePct,
      rating,
      state_before: card.state,
      state_after: result.state,
      interval_before: card.interval_days,
      interval_after: result.interval_days,
      ease_before: card.ease_factor,
      ease_after: result.ease_factor,
      review_duration_ms: durationMs,
      reviewed_at: new Date().toISOString(),
    }),
  ]);

  if (updateResult.error) return { error: updateResult.error.message };
  if (logResult.error) return { error: logResult.error.message };

  return { data: { rating, result } };
}

// ---------------------------------------------------------------------------
// endStudySession
// ---------------------------------------------------------------------------

export async function endStudySession(
  sessionId: string,
  stats: {
    cardsStudied: number;
    cardsAgain: number;
    cardsHard: number;
    cardsGood: number;
    cardsEasy: number;
    newCardsSeen: number;
    durationMs: number;
  }
) {
  const user = await getCurrentUser();
  if (!user) return { error: "Not authenticated" };

  const supabase = await createClient();

  const retentionPct =
    stats.cardsStudied > 0
      ? Math.round(((stats.cardsGood + stats.cardsEasy) / stats.cardsStudied) * 100)
      : null;

  // Update session with final stats
  const { data: session, error: sessionError } = await supabase
    .from("study_sessions")
    .update({
      ended_at: new Date().toISOString(),
      duration_ms: stats.durationMs,
      cards_studied: stats.cardsStudied,
      cards_again: stats.cardsAgain,
      cards_hard: stats.cardsHard,
      cards_good: stats.cardsGood,
      cards_easy: stats.cardsEasy,
      new_cards_seen: stats.newCardsSeen,
      retention_pct: retentionPct,
    })
    .eq("id", sessionId)
    .eq("user_id", user.id)
    .select("study_deck_id")
    .single();

  if (sessionError || !session) return { error: sessionError?.message ?? "Session not found" };

  // Upsert daily stats — global row (study_deck_id = NULL) + per-deck row
  const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
  const statRows = [
    { study_deck_id: null },
    { study_deck_id: session.study_deck_id },
  ].map((extra) => ({
    user_id: user.id,
    stat_date: today,
    study_time_ms: stats.durationMs,
    cards_reviewed: stats.cardsStudied,
    cards_again: stats.cardsAgain,
    cards_hard: stats.cardsHard,
    cards_good: stats.cardsGood,
    cards_easy: stats.cardsEasy,
    new_cards_seen: stats.newCardsSeen,
    retention_pct: retentionPct,
    ...extra,
  }));

  await supabase
    .from("user_study_stats")
    .upsert(statRows, {
      onConflict: "user_id,stat_date,study_deck_id",
      ignoreDuplicates: false,
    });
  // Note: upsert errors are non-fatal — stats are best-effort

  revalidatePath(`/study/${session.study_deck_id}`);
  revalidatePath("/study");
  revalidatePath("/dashboard");

  return { data: { retentionPct, sessionId } };
}

// ---------------------------------------------------------------------------
// addMoreNewCards
// Called from the session completion screen "Study More New Cards" button.
// Returns up to min(new_cards_per_day, 20) additional new cards.
// ---------------------------------------------------------------------------

export async function addMoreNewCards(deckId: string) {
  const user = await getCurrentUser();
  if (!user) return { error: "Not authenticated", cards: [] };

  const supabase = await createClient();

  // Get deck settings to determine new_cards_per_day
  const { data: settings } = await supabase
    .from("deck_study_settings")
    .select("new_cards_per_day")
    .eq("study_deck_id", deckId)
    .single();

  const limit = Math.min(settings?.new_cards_per_day ?? 20, 20);

  const { data: cards, error } = await supabase
    .from("study_cards")
    .select("*")
    .eq("study_deck_id", deckId)
    .eq("user_id", user.id)
    .eq("state", "new")
    .order("position", { ascending: true })
    .limit(limit);

  if (error) return { error: error.message, cards: [] };
  return { cards: (cards ?? []) as StudyCard[] };
}
