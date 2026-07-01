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

// ---------------------------------------------------------------------------
// getSessionQueue — calls Postgres RPC or resolves course progress overlay
// ---------------------------------------------------------------------------

export async function getSessionQueue(deckId: string) {
  const user = await getCurrentUser();
  if (!user) return { error: "errors.auth.not_authenticated", cards: [] };

  const supabase = await createClient();

  // Fetch the deck metadata to check if it's a Course deck
  const { data: deck } = await supabase
    .from("study_decks")
    .select("shared_deck_id")
    .eq("id", deckId)
    .eq("user_id", user.id)
    .single();

  if (!deck) return { error: "errors.study_decks.not_found", cards: [] };

  if (deck.shared_deck_id) {
    // ---------------------------------------------------------------------------
    // COURSE DECK PATH (Lazy Progress Overlay)
    // ---------------------------------------------------------------------------
    const { data: settings } = await supabase
      .from("deck_study_settings")
      .select("*")
      .eq("study_deck_id", deckId)
      .single();

    if (!settings) return { error: "errors.study_decks.invalid_settings", cards: [] };

    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const todayStartIso = todayStart.toISOString();

    // Count reviews already done today
    const { count: reviewsToday } = await supabase
      .from("review_logs")
      .select("id", { count: "exact", head: true })
      .eq("study_deck_id", deckId)
      .eq("user_id", user.id)
      .gte("reviewed_at", todayStartIso);

    // Count new cards already seen today
    const { count: newToday } = await supabase
      .from("review_logs")
      .select("id", { count: "exact", head: true })
      .eq("study_deck_id", deckId)
      .eq("user_id", user.id)
      .eq("state_before", "new")
      .gte("reviewed_at", todayStartIso);

    const reviewsDone = reviewsToday ?? 0;
    const newDone = newToday ?? 0;

    // 1. Fetch learn cards (due <= NOW)
    const { data: learnCards } = await supabase
      .from("study_cards")
      .select("*")
      .eq("study_deck_id", deckId)
      .eq("user_id", user.id)
      .eq("state", "learn")
      .lte("due_at", new Date().toISOString())
      .order("due_at", { ascending: true });

interface SharedCard {
  id: string;
  shared_deck_id: string;
  front: string;
  back: string;
  card_type: "basic" | "cloze" | "mixed";
  front_audio_url: string | null;
  back_audio_url: string | null;
  position: number;
  created_at: string;
  updated_at: string;
}

    // 2. Fetch review cards (due <= end of today, up to max reviews limit)
    const maxReviews = Math.max(0, settings.max_reviews_per_day - reviewsDone);
    let reviewCards: StudyCard[] = [];
    if (maxReviews > 0) {
      const tomorrowStart = new Date(todayStart);
      tomorrowStart.setUTCDate(tomorrowStart.getUTCDate() + 1);

      const { data } = await supabase
        .from("study_cards")
        .select("*")
        .eq("study_deck_id", deckId)
        .eq("user_id", user.id)
        .eq("state", "review")
        .lt("due_at", tomorrowStart.toISOString())
        .order("due_at", { ascending: true })
        .limit(maxReviews);
      reviewCards = (data ?? []) as StudyCard[];
    }

    // 3. Fetch new cards (cards in shared_cards without study_cards rows)
    const maxNew = Math.max(0, settings.new_cards_per_day - newDone);
    let newSharedCards: SharedCard[] = [];
    if (maxNew > 0) {
      const { data: progressRows } = await supabase
        .from("study_cards")
        .select("shared_card_id")
        .eq("study_deck_id", deckId)
        .eq("user_id", user.id);

      const progressSet = new Set((progressRows ?? []).map((r) => r.shared_card_id).filter(Boolean));

      const { data: courseCards } = await supabase
        .from("shared_cards")
        .select("*")
        .eq("shared_deck_id", deck.shared_deck_id)
        .order("position", { ascending: true });

      newSharedCards = ((courseCards as unknown as SharedCard[]) ?? [])
        .filter((sc) => !progressSet.has(sc.id))
        .slice(0, maxNew);
    }

    const mergedQueue = [
      ...(learnCards ?? []),
      ...reviewCards,
    ];

    // Join content from shared_cards for due progress cards
    const progressSharedCardIds = mergedQueue.map((c) => c.shared_card_id).filter(Boolean);
    let sharedCardsMap = new Map<string, SharedCard>();
    if (progressSharedCardIds.length > 0) {
      const { data: sharedCards } = await supabase
        .from("shared_cards")
        .select("*")
        .in("id", progressSharedCardIds);
      sharedCardsMap = new Map(((sharedCards as unknown as SharedCard[]) ?? []).map((sc) => [sc.id, sc]));
    }

    const finalCards: StudyCard[] = [
      ...mergedQueue.map((c) => {
        const sc = sharedCardsMap.get(c.shared_card_id);
        return {
          ...c,
          front: sc?.front ?? "",
          back: sc?.back ?? "",
          card_type: sc?.card_type ?? "basic",
          audios: [
            ...(sc?.front_audio_url ? [{
              id: `shared-${sc.id}-front`,
              // Map pronunciation to 'back' so it autoplay on flip, not on card load
              side: "back" as const,
              original_filename: "front_pronunciation",
              normalized_filename: "front_pronunciation",
              audio_files: {
                file_id: sc.front_audio_url,
                provider: "url",
                voice_id: "system",
                language: "ja",
                duration_seconds: null
              }
            }] : []),
            ...(sc?.back_audio_url ? [{
              id: `shared-${sc.id}-back`,
              side: "back" as const,
              original_filename: "back_pronunciation",
              normalized_filename: "back_pronunciation",
              audio_files: {
                file_id: sc.back_audio_url,
                provider: "url",
                voice_id: "system",
                language: "ja",
                duration_seconds: null
              }
            }] : [])
          ]
        };
      }),
      ...newSharedCards.map((sc) => ({
        id: sc.id, // Submit reviews using shared_card_id
        study_deck_id: deckId,
        user_id: user.id,
        front: sc.front,
        back: sc.back,
        card_type: sc.card_type,
        media_refs: [],
        source_flashcard_id: null,
        source_deck_id: null,
        import_id: null,
        shared_card_id: sc.id,
        state: "new" as const,
        due_at: new Date().toISOString(),
        last_reviewed_at: null,
        ease_factor: 2.5,
        interval_days: 0,
        repetitions: 0,
        lapse_count: 0,
        learning_step_index: 0,
        fsrs_stability: null,
        fsrs_difficulty: null,
        fsrs_retrievability: null,
        tags: [],
        is_flagged: false,
        position: sc.position,
        created_at: sc.created_at,
        updated_at: sc.updated_at,
        audios: [
          ...(sc.front_audio_url ? [{
            id: `shared-${sc.id}-front`,
            // Map pronunciation to 'back' so it autoplays on flip, not on card load
            side: "back" as const,
            original_filename: "front_pronunciation",
            normalized_filename: "front_pronunciation",
            audio_files: {
              file_id: sc.front_audio_url,
              provider: "url",
              voice_id: "system",
              language: "ja",
              duration_seconds: null
            }
          }] : []),
          ...(sc.back_audio_url ? [{
            id: `shared-${sc.id}-back`,
            side: "back" as const,
            original_filename: "back_pronunciation",
            normalized_filename: "back_pronunciation",
            audio_files: {
              file_id: sc.back_audio_url,
              provider: "url",
              voice_id: "system",
              language: "ja",
              duration_seconds: null
            }
          }] : [])
        ]
      }))
    ];

    return { cards: finalCards };
  }

  // ---------------------------------------------------------------------------
  // PERSONAL DECK PATH (Original RPC path)
  // ---------------------------------------------------------------------------
  const { data: queue, error: queueError } = await supabase.rpc("get_session_queue", {
    p_deck_id: deckId,
    p_user_id: user.id,
  });

  if (queueError) return { error: queueError.message, cards: [] };
  if (!queue?.length) return { cards: [] };

  const cardIds = queue.map((row: { card_id: string }) => row.card_id);
  const { data: cards, error: cardsError } = await supabase
    .from("study_cards")
    .select("*")
    .in("id", cardIds);

  if (cardsError) return { error: cardsError.message, cards: [] };

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
  confidencePct: number;
  durationMs: number;
  timezone?: string;
}) {
  const user = await getCurrentUser();
  if (!user) return { error: "errors.auth.not_authenticated" };

  const supabase = await createClient();

  let card: StudyCard | null = null;
  let isLazyInsert = false;

  // 1. Fetch the card (must belong to user)
  const { data: existingCard } = await supabase
    .from("study_cards")
    .select("*")
    .eq("id", cardId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existingCard) {
    card = existingCard;
  } else {
    // Check if cardId is a shared_card_id from a course deck
    const { data: sharedCard } = await supabase
      .from("shared_cards")
      .select("*")
      .eq("id", cardId)
      .maybeSingle();

    if (!sharedCard) {
      return { error: "errors.study_decks.card_not_found" };
    }

    // Find the user's study deck linked to this course
    const { data: studyDeck } = await supabase
      .from("study_decks")
      .select("id")
      .eq("shared_deck_id", sharedCard.shared_deck_id)
      .eq("user_id", user.id)
      .single();

    if (!studyDeck) {
      return { error: "errors.study_decks.not_found" };
    }

    // Assemble temporary StudyCard in memory
    card = {
      id: cardId, // Use shared_card_id initially
      study_deck_id: studyDeck.id,
      user_id: user.id,
      front: sharedCard.front,
      back: sharedCard.back,
      card_type: sharedCard.card_type,
      media_refs: [],
      source_flashcard_id: null,
      source_deck_id: null,
      import_id: null,
      shared_card_id: sharedCard.id,
      state: "new" as const,
      due_at: new Date().toISOString(),
      last_reviewed_at: null,
      ease_factor: 2.5,
      interval_days: 0,
      repetitions: 0,
      lapse_count: 0,
      learning_step_index: 0,
      fsrs_stability: null,
      fsrs_difficulty: null,
      fsrs_retrievability: null,
      tags: [],
      is_flagged: false,
      position: sharedCard.position,
      created_at: sharedCard.created_at,
      updated_at: sharedCard.updated_at
    };
    isLazyInsert = true;
  }

  if (!card) {
    return { error: "errors.study_decks.card_not_found" };
  }

  // Fetch deck settings
  const { data: settingsRow } = await supabase
    .from("deck_study_settings")
    .select("*")
    .eq("study_deck_id", card.study_deck_id)
    .single();

  if (!settingsRow) return { error: "errors.study_decks.invalid_settings" };

  const settings = settingsRow as DeckStudySettings;
  const rating = confidenceToRating(confidencePct);

  // Calculate new scheduling state (pure function)
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
  let insertedCardId = cardId;

  // Insert progress card row on first review for lazy initialization
  if (isLazyInsert) {
    const { data: newCard, error: insertError } = await supabase
      .from("study_cards")
      .insert({
        study_deck_id: card.study_deck_id,
        user_id: user.id,
        shared_card_id: card.shared_card_id,
        state: result.state,
        due_at: result.due_at.toISOString(),
        last_reviewed_at: new Date().toISOString(),
        ease_factor: result.ease_factor,
        interval_days: result.interval_days,
        repetitions: result.repetitions,
        lapse_count: result.lapse_count,
        learning_step_index: result.learning_step_index,
        position: card.position
      })
      .select("id")
      .single();

    if (insertError || !newCard) {
      return { error: insertError?.message ?? "Failed to insert progress card" };
    }
    insertedCardId = newCard.id;
  }

  const promises: Promise<unknown>[] = [
    // 1. Update the study card (if not lazy inserted)
    isLazyInsert
      ? Promise.resolve(null)
      : Promise.resolve(
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
        study_card_id: insertedCardId,
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

  const results = await Promise.all(promises) as { error?: { message: string } | null }[];

  if (results[0] && results[0].error) return { error: results[0].error.message };
  if (results[1] && results[1].error) return { error: results[1].error.message };

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

  // Get deck metadata to check if it's a Course deck
  const { data: deck } = await supabase
    .from("study_decks")
    .select("shared_deck_id")
    .eq("id", deckId)
    .eq("user_id", user.id)
    .single();

  if (!deck) return { error: "errors.study_decks.not_found", cards: [] };

  if (deck.shared_deck_id) {
    const { data: settings } = await supabase
      .from("deck_study_settings")
      .select("new_cards_per_day")
      .eq("study_deck_id", deckId)
      .single();

    const limit = Math.min(settings?.new_cards_per_day ?? 20, 20);

    const { data: progressRows } = await supabase
      .from("study_cards")
      .select("shared_card_id")
      .eq("study_deck_id", deckId)
      .eq("user_id", user.id);

    const progressSet = new Set((progressRows ?? []).map((r) => r.shared_card_id).filter(Boolean));

    const { data: courseCards } = await supabase
      .from("shared_cards")
      .select("*")
      .eq("shared_deck_id", deck.shared_deck_id)
      .order("position", { ascending: true });

    const newSharedCards = (courseCards ?? [])
      .filter((sc) => !progressSet.has(sc.id))
      .slice(0, limit);

    const cards = newSharedCards.map((sc) => ({
      id: sc.id,
      study_deck_id: deckId,
      user_id: user.id,
      front: sc.front,
      back: sc.back,
      card_type: sc.card_type,
      media_refs: [],
      source_flashcard_id: null,
      source_deck_id: null,
      import_id: null,
      shared_card_id: sc.id,
      state: "new" as const,
      due_at: new Date().toISOString(),
      last_reviewed_at: null,
      ease_factor: 2.5,
      interval_days: 0,
      repetitions: 0,
      lapse_count: 0,
      learning_step_index: 0,
      fsrs_stability: null,
      fsrs_difficulty: null,
      fsrs_retrievability: null,
      tags: [],
      is_flagged: false,
      position: sc.position,
      created_at: sc.created_at,
      updated_at: sc.updated_at,
      audios: [
        ...(sc.front_audio_url ? [{
          id: `shared-${sc.id}-front`,
          side: "front" as const,
          original_filename: "front_pronunciation",
          normalized_filename: "front_pronunciation",
          audio_files: {
            file_id: sc.front_audio_url,
            provider: "url",
            voice_id: "system",
            language: "ja",
            duration_seconds: null
          }
        }] : []),
        ...(sc.back_audio_url ? [{
          id: `shared-${sc.id}-back`,
          side: "back" as const,
          original_filename: "back_pronunciation",
          normalized_filename: "back_pronunciation",
          audio_files: {
            file_id: sc.back_audio_url,
            provider: "url",
            voice_id: "system",
            language: "ja",
            duration_seconds: null
          }
        }] : [])
      ]
    }));

    return { cards };
  }

  // Get deck settings to determine new_cards_per_day (Personal decks path)
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
