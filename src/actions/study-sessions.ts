"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/queries/user";
import type { StudyCard, DeckStudySettings, CardAudio } from "@/types";
import { scheduleCard, confidenceToRating } from "@/lib/scheduling/sm2";
import type { SupabaseClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// startStudySession
// ---------------------------------------------------------------------------

export async function startStudySession(deckId: string) {
  const user = await getCurrentUser();
  if (!user) return { error: "errors.auth.not_authenticated" };

  const supabase = await createClient();

  // Verify deck belongs to user
  const { data: deck } = await supabase
    .from("study_decks")
    .select("id")
    .eq("id", deckId)
    .eq("user_id", user.id)
    .single();

  if (!deck) return { error: "errors.study_decks.not_found" };

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
  if (!user) return { error: "errors.auth.not_authenticated", cards: [] };

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

  const cardsWithAudios = await attachAudiosToCards(supabase, sorted);

  return { cards: cardsWithAudios };
}

// ---------------------------------------------------------------------------
// submitReview
// ---------------------------------------------------------------------------

export async function submitReview({
  sessionId,
  cardId,
  confidencePct,
  durationMs,
  timezone,
}: {
  sessionId: string;
  cardId: string;
  confidencePct: number;  // 0–100 from confidence bar
  durationMs: number;     // how long user spent on the card
  timezone?: string;
}) {
  const user = await getCurrentUser();
  if (!user) return { error: "errors.auth.not_authenticated" };

  const supabase = await createClient();

  // Fetch the card (must belong to user)
  const { data: card, error: cardError } = await supabase
    .from("study_cards")
    .select("*")
    .eq("id", cardId)
    .eq("user_id", user.id)
    .single();

  if (cardError || !card) return { error: "errors.study_decks.card_not_found" };

  // Fetch deck settings
  const { data: settingsRow } = await supabase
    .from("deck_study_settings")
    .select("*")
    .eq("study_deck_id", card.study_deck_id)
    .single();

  if (!settingsRow) return { error: "errors.study_decks.invalid_settings" };

  const settings = settingsRow as DeckStudySettings;
  const rating = confidenceToRating(confidencePct);

  // Calculate new scheduling state (pure function — no DB)
  const result = scheduleCard(card as StudyCard, rating, settings);

  // Fetch current session stats to update incrementally
  const { data: session } = await supabase
    .from("study_sessions")
    .select("cards_studied, cards_again, cards_hard, cards_good, cards_easy, new_cards_seen, duration_ms")
    .eq("id", sessionId)
    .eq("user_id", user.id)
    .single();

  // Determine timezone-adjusted local date
  let today = new Date().toISOString().split("T")[0];
  if (timezone) {
    try {
      const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
      const parts = formatter.formatToParts(new Date());
      const year = parts.find((p) => p.type === "year")?.value;
      const month = parts.find((p) => p.type === "month")?.value;
      const day = parts.find((p) => p.type === "day")?.value;
      if (year && month && day) {
        today = `${year}-${month}-${day}`;
      }
    } catch (e) {
      console.error("Error formatting date with timezone:", e);
    }
  }

  const isNew = card.state === "new";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const promises: Promise<any>[] = [
    // 1. Update the study card
    Promise.resolve(
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
        .eq("user_id", user.id)
    ),

    // 2. Insert the review log
    Promise.resolve(
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
      })
    ),
  ];

  // 3. Update active session incrementally
  if (session) {
    const totalStudied = (session.cards_studied || 0) + 1;
    const totalGood = (session.cards_good || 0) + (rating === "good" ? 1 : 0);
    const totalEasy = (session.cards_easy || 0) + (rating === "easy" ? 1 : 0);
    const retentionPct = Math.round(((totalGood + totalEasy) / totalStudied) * 100);

    promises.push(
      Promise.resolve(
        supabase
          .from("study_sessions")
          .update({
            cards_studied: totalStudied,
            cards_again: (session.cards_again || 0) + (rating === "again" ? 1 : 0),
            cards_hard: (session.cards_hard || 0) + (rating === "hard" ? 1 : 0),
            cards_good: totalGood,
            cards_easy: totalEasy,
            new_cards_seen: (session.new_cards_seen || 0) + (isNew ? 1 : 0),
            duration_ms: (session.duration_ms || 0) + durationMs,
            retention_pct: retentionPct,
          })
          .eq("id", sessionId)
          .eq("user_id", user.id)
      )
    );
  }

  // 4. Update daily statistics aggregates (Global and per-deck)
  const statsCalls = [null, card.study_deck_id].map((deckId) =>
    Promise.resolve(
      supabase.rpc("increment_user_study_stats", {
        p_user_id: user.id,
        p_stat_date: today,
        p_study_deck_id: deckId,
        p_study_time_ms: durationMs,
        p_cards_reviewed: 1,
        p_cards_again: rating === "again" ? 1 : 0,
        p_cards_hard: rating === "hard" ? 1 : 0,
        p_cards_good: rating === "good" ? 1 : 0,
        p_cards_easy: rating === "easy" ? 1 : 0,
        p_new_cards_seen: isNew ? 1 : 0,
        p_retention_pct: rating === "good" || rating === "easy" ? 100 : 0,
      })
    )
  );

  promises.push(...statsCalls);

  const results = await Promise.all(promises);

  if (results[0].error) return { error: results[0].error.message };
  if (results[1].error) return { error: results[1].error.message };

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
  if (!user) return { error: "errors.auth.not_authenticated" };

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

  if (sessionError || !session) return { error: sessionError?.message ?? "errors.study_decks.session_not_found" };

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
  if (!user) return { error: "errors.auth.not_authenticated", cards: [] };

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
  const cardsWithAudios = await attachAudiosToCards(supabase, cards ?? []);
  return { cards: cardsWithAudios };
}

// ---------------------------------------------------------------------------
// Helper function to attach audios to study cards
// ---------------------------------------------------------------------------
async function attachAudiosToCards(supabase: SupabaseClient, cards: StudyCard[]): Promise<StudyCard[]> {
  if (!cards || cards.length === 0) return [];

  const flashcardIds = cards
    .map((c) => c.source_flashcard_id)
    .filter(Boolean) as string[];

  const audiosMap: Record<string, CardAudio[]> = {};
  if (flashcardIds.length > 0) {
    const { data: cardAudios } = await supabase
      .from("card_audios")
      .select(`
        id,
        flashcard_id,
        side,
        original_filename,
        normalized_filename,
        audio_files (
          file_id,
          provider,
          voice_id,
          language,
          duration_seconds
        )
      `)
      .in("flashcard_id", flashcardIds);

    if (cardAudios) {
      const casted = cardAudios as unknown as Array<{ flashcard_id: string } & CardAudio>;
      for (const audio of casted) {
        if (!audiosMap[audio.flashcard_id]) {
          audiosMap[audio.flashcard_id] = [];
        }
        audiosMap[audio.flashcard_id].push(audio);
      }
    }
  }

  return cards.map((card) => ({
    ...card,
    audios: card.source_flashcard_id ? (audiosMap[card.source_flashcard_id] || []) : [],
  })) as StudyCard[];
}
