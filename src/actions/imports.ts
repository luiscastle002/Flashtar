"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, getSubscription } from "@/lib/queries/user";
import type { StudyCard, CardAudio } from "@/types";
import type { Plan } from "@/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cleanOrphanedCardAudios } from "./audio";

// ---------------------------------------------------------------------------
// importFromGeneratedDeck
// Snapshots flashcards from an AI-generated deck into one or more study decks.
// ---------------------------------------------------------------------------

export async function importFromGeneratedDeck(
  sourceDeckId: string,
  targetStudyDeckIds: string[]
) {
  const user = await getCurrentUser();
  if (!user) return { error: "errors.auth.not_authenticated" };
  if (!targetStudyDeckIds.length) return { error: "errors.imports.no_target_decks" };

  const supabase = await createClient();

  // Verify source deck belongs to user
  const { data: sourceDeck } = await supabase
    .from("decks")
    .select("id, name")
    .eq("id", sourceDeckId)
    .eq("user_id", user.id)
    .single();

  if (!sourceDeck) return { error: "errors.imports.source_deck_not_found" };

  // Verify all target decks belong to user
  const { data: targetDecks } = await supabase
    .from("study_decks")
    .select("id")
    .in("id", targetStudyDeckIds)
    .eq("user_id", user.id);

  if (!targetDecks?.length) return { error: "errors.imports.target_decks_not_found" };

  // Fetch source flashcards
  const { data: flashcards } = await supabase
    .from("flashcards")
    .select("id, front, back, card_type, position")
    .eq("deck_id", sourceDeckId)
    .order("position");

  if (!flashcards?.length) {
    return { error: "errors.imports.source_deck_empty" };
  }

  const results = [];

  for (const targetDeckId of targetStudyDeckIds) {
    // Check for already-imported cards (idempotency: skip duplicates)
    const { data: existing } = await supabase
      .from("study_cards")
      .select("source_flashcard_id")
      .eq("study_deck_id", targetDeckId)
      .eq("source_deck_id", sourceDeckId)
      .not("source_flashcard_id", "is", null);

    const existingIds = new Set((existing ?? []).map((r) => r.source_flashcard_id));
    const newCards = flashcards.filter((f) => !existingIds.has(f.id));

    if (!newCards.length) {
      results.push({ deckId: targetDeckId, imported: 0, skipped: flashcards.length });
      continue;
    }

    // Create import record
    const { data: importRecord } = await supabase
      .from("imports")
      .insert({
        user_id: user.id,
        study_deck_id: targetDeckId,
        source_type: "generated_deck",
        source_deck_id: sourceDeckId,
        status: "processing",
        total_cards: flashcards.length,
        started_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    // Bulk snapshot insert
    const studyCards = newCards.map((card, i) => ({
      study_deck_id: targetDeckId,
      user_id: user.id,
      front: card.front,
      back: card.back,
      card_type: card.card_type,
      source_flashcard_id: card.id,
      source_deck_id: sourceDeckId,
      import_id: importRecord?.id ?? null,
      position: (existing?.length ?? 0) + i,
      state: "new",
    }));

    const { error: insertError } = await supabase
      .from("study_cards")
      .insert(studyCards);

    // Update import record
    await supabase
      .from("imports")
      .update({
        status: insertError ? "failed" : "completed",
        imported_cards: insertError ? 0 : newCards.length,
        skipped_cards: existingIds.size,
        error_message: insertError?.message ?? null,
        completed_at: new Date().toISOString(),
      })
      .eq("id", importRecord?.id ?? "");

    results.push({
      deckId: targetDeckId,
      imported: insertError ? 0 : newCards.length,
      skipped: existingIds.size,
      error: insertError?.message,
    });
  }

  for (const deckId of targetStudyDeckIds) {
    revalidatePath(`/study/${deckId}`);
  }
  revalidatePath("/study");

  return { results };
}

// ---------------------------------------------------------------------------
// importFromCsv
// Parses CSV content (already parsed client-side) and bulk-inserts study cards.
// ---------------------------------------------------------------------------

export async function importFromCsv(
  studyDeckId: string,
  rows: Array<{ front: string; back: string; tags?: string[] }>
) {
  const user = await getCurrentUser();
  if (!user) return { error: "errors.auth.not_authenticated" };
  if (!rows.length) return { error: "errors.imports.no_rows" };

  const supabase = await createClient();

  // Verify deck belongs to user
  const { data: deck } = await supabase
    .from("study_decks")
    .select("id, card_count, deck_id")
    .eq("id", studyDeckId)
    .eq("user_id", user.id)
    .single();

  if (!deck) return { error: "errors.study_decks.not_found" };

  // Validate rows
  const validRows = rows.filter(
    (r) => r.front?.trim() && r.back?.trim()
  );
  const skippedCount = rows.length - validRows.length;

  if (!validRows.length) return { error: "errors.imports.no_valid_rows" };

  // Create import record
  const { data: importRecord } = await supabase
    .from("imports")
    .insert({
      user_id: user.id,
      study_deck_id: studyDeckId,
      source_type: "csv",
      status: "processing",
      total_cards: rows.length,
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  // 1. Create master flashcards
  const flashcardRows = validRows.map((row, i) => ({
    deck_id: deck.deck_id,
    front: row.front.trim(),
    back: row.back.trim(),
    card_type: "basic" as const,
    position: (deck.card_count ?? 0) + i,
  }));

  const { data: insertedFlashcards, error: flashcardsError } = await supabase
    .from("flashcards")
    .insert(flashcardRows)
    .select("id, position")
    .order("position");

  if (flashcardsError || !insertedFlashcards) {
    await supabase
      .from("imports")
      .update({
        status: "failed",
        error_message: flashcardsError?.message ?? "Failed to create master flashcards",
        completed_at: new Date().toISOString(),
      })
      .eq("id", importRecord?.id ?? "");
    return { error: flashcardsError?.message || "Failed to create master flashcards" };
  }

  // Sort by position to align with validRows
  insertedFlashcards.sort((a, b) => a.position - b.position);

  // 2. Create study cards
  const studyCards = validRows.map((row, i) => ({
    study_deck_id: studyDeckId,
    user_id: user.id,
    front: row.front.trim(),
    back: row.back.trim(),
    tags: row.tags ?? [],
    import_id: importRecord?.id ?? null,
    source_flashcard_id: insertedFlashcards[i]?.id ?? null,
    source_deck_id: deck.deck_id,
    position: (deck.card_count ?? 0) + i,
    state: "new",
  }));

  const { error: insertError } = await supabase
    .from("study_cards")
    .insert(studyCards);

  await supabase
    .from("imports")
    .update({
      status: insertError ? "failed" : "completed",
      imported_cards: insertError ? 0 : validRows.length,
      skipped_cards: skippedCount,
      error_message: insertError?.message ?? null,
      completed_at: new Date().toISOString(),
    })
    .eq("id", importRecord?.id ?? "");

  if (insertError) return { error: insertError.message };

  revalidatePath(`/study/${studyDeckId}`);
  revalidatePath("/study");

  return {
    imported: validRows.length,
    skipped: skippedCount,
  };
}

// ---------------------------------------------------------------------------
// importFromApkg
// Receives client-parsed APKG cards and bulk-inserts them. Pro-only feature.
// ---------------------------------------------------------------------------

const APKG_BATCH_SIZE = 500;

export async function importFromApkg(
  studyDeckId: string,
  cards: Array<{ front: string; back: string; card_type?: "basic" | "cloze" }>,
  sourceFileName: string,
  mediaMappings: Array<{ original_filename: string; temp_storage_path: string }> = []
) {
  const user = await getCurrentUser();
  if (!user) return { error: "errors.auth.not_authenticated" };
  if (!cards.length) return { error: "errors.imports.no_rows" };

  const subscription = await getSubscription(user.id);
  const plan = (subscription?.plan ?? "free") as Plan;

  const supabase = await createClient();

  // Verify deck belongs to user
  const { data: deck } = await supabase
    .from("study_decks")
    .select("id, card_count, deck_id")
    .eq("id", studyDeckId)
    .eq("user_id", user.id)
    .single();

  if (!deck) return { error: "errors.study_decks.not_found" };

  // Validate rows — only keep cards with non-empty front text
  let validCards = cards.filter(
    (c) => c.front?.trim()
  );

  // Enforce server-side limit for Free tier users (up to 1,000 cards)
  if (plan === "free" && validCards.length > 1000) {
    validCards = validCards.slice(0, 1000);
  }

  const skippedCount = cards.length - validCards.length;

  if (!validCards.length) return { error: "errors.imports.no_valid_rows" };

  // Create import record
  const { data: importRecord } = await supabase
    .from("imports")
    .insert({
      user_id: user.id,
      study_deck_id: studyDeckId,
      source_type: "apkg",
      source_file_name: sourceFileName,
      status: "processing",
      total_cards: cards.length,
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  // 1. Create master flashcards in batches
  const flashcardRows = validCards.map((card, i) => ({
    deck_id: deck.deck_id,
    front: card.front.trim(),
    back: (card.back ?? "").trim(),
    card_type: card.card_type ?? "basic",
    position: (deck.card_count ?? 0) + i,
  }));

  let insertedFlashcards: Array<{ id: string; position: number }> = [];
  let insertError: { message: string } | null = null;

  for (let i = 0; i < flashcardRows.length; i += APKG_BATCH_SIZE) {
    const batch = flashcardRows.slice(i, i + APKG_BATCH_SIZE);
    const { data, error } = await supabase
      .from("flashcards")
      .insert(batch)
      .select("id, position");
    
    if (error) {
      insertError = error;
      break;
    }
    if (data) {
      insertedFlashcards = [...insertedFlashcards, ...data];
    }
  }

  if (insertError) {
    await supabase
      .from("imports")
      .update({
        status: "failed",
        error_message: insertError.message,
        completed_at: new Date().toISOString(),
      })
      .eq("id", importRecord?.id ?? "");
    return { error: insertError.message };
  }

  // Sort inserted flashcards by position to align with validCards
  insertedFlashcards.sort((a, b) => a.position - b.position);

  // 2. Build study card rows referencing master flashcard IDs
  const studyCards = validCards.map((card, i) => ({
    study_deck_id: studyDeckId,
    user_id: user.id,
    front: card.front.trim(),
    back: (card.back ?? "").trim(),
    card_type: card.card_type ?? "basic",
    import_id: importRecord?.id ?? null,
    source_flashcard_id: insertedFlashcards[i]?.id ?? null,
    source_deck_id: deck.deck_id,
    position: (deck.card_count ?? 0) + i,
    state: "new",
  }));

  // Batch insert study cards
  for (let i = 0; i < studyCards.length; i += APKG_BATCH_SIZE) {
    const batch = studyCards.slice(i, i + APKG_BATCH_SIZE);
    const { error } = await supabase.from("study_cards").insert(batch);
    if (error) {
      insertError = error;
      break;
    }
  }

  // 3. Update import record with result status
  await supabase
    .from("imports")
    .update({
      status: insertError ? "failed" : "completed",
      imported_cards: insertError ? 0 : validCards.length,
      skipped_cards: skippedCount,
      error_message: insertError?.message ?? null,
      completed_at: new Date().toISOString(),
    })
    .eq("id", importRecord?.id ?? "");

  if (insertError) return { error: insertError.message };

  // 4. Queue media upload items in media_upload_queue
  if (mediaMappings.length > 0) {
    interface QueueItemInput {
      user_id: string;
      deck_id: string;
      flashcard_id: string;
      original_filename: string;
      normalized_filename: string;
      temp_storage_path: string;
      status: "pending";
      retry_count: number;
      google_rate_limited: boolean;
    }
    const queueItems: QueueItemInput[] = [];
    const soundRegex = /\[sound:([^\]]+)\]/g;
    const mediaLookup = new Map(
      mediaMappings.map((m) => [m.original_filename.trim().toLowerCase().normalize("NFC"), m.temp_storage_path])
    );

    validCards.forEach((card, i) => {
      const flashcardId = insertedFlashcards[i]?.id;
      if (!flashcardId) return;

      const combinedText = `${card.front} ${card.back ?? ""}`;
      let match;
      const seenOnCard = new Set<string>();

      while ((match = soundRegex.exec(combinedText)) !== null) {
        const rawFilename = match[1];
        const normalizedName = rawFilename.trim().toLowerCase().normalize("NFC");

        if (mediaLookup.has(normalizedName) && !seenOnCard.has(normalizedName)) {
          seenOnCard.add(normalizedName);
          queueItems.push({
            user_id: user.id,
            deck_id: deck.deck_id,
            flashcard_id: flashcardId,
            original_filename: rawFilename,
            normalized_filename: normalizedName,
            temp_storage_path: mediaLookup.get(normalizedName)!,
            status: "pending",
            retry_count: 0,
            google_rate_limited: false,
          });
        }
      }
    });

    if (queueItems.length > 0) {
      const { error: queueError } = await supabase
        .from("media_upload_queue")
        .insert(queueItems);
      if (queueError) {
        console.error("Failed to insert media upload queue items:", queueError.message);
      }
    }
  }

  revalidatePath(`/study/${studyDeckId}`);
  revalidatePath("/study");

  return {
    imported: validCards.length,
    skipped: skippedCount,
  };
}

// ---------------------------------------------------------------------------
// getImportHistory
// ---------------------------------------------------------------------------

export async function getImportHistory(studyDeckId: string, limit = 10) {
  const user = await getCurrentUser();
  if (!user) return [];

  const supabase = await createClient();
  const { data } = await supabase
    .from("imports")
    .select("*, decks(name)")
    .eq("study_deck_id", studyDeckId)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  return data ?? [];
}

// ---------------------------------------------------------------------------
// getStudyCards
// ---------------------------------------------------------------------------

export async function getStudyCards(
  studyDeckId: string,
  options: {
    state?: string;
    limit?: number;
    offset?: number;
    search?: string;
    page?: number;
    sort?: "name_asc" | "name_desc" | "created_asc" | "created_desc";
    suspended?: "all" | "suspended_only";
    cursor?: string;
    direction?: "next" | "prev";
  } = {}
): Promise<{
  cards: StudyCard[];
  count: number;
  useKeyset: boolean;
  nextCursor: string | null;
  prevCursor: string | null;
}> {
  const user = await getCurrentUser();
  if (!user) return { cards: [], count: 0, useKeyset: false, nextCursor: null, prevCursor: null };

  const supabase = await createClient();

  // 1. Fetch user subscription details to check for Pro plan
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("plan")
    .eq("user_id", user.id)
    .maybeSingle();
  const plan = sub?.plan ?? "free";

  // 2. Fetch the deck's card count
  const { data: deck } = await supabase
    .from("study_decks")
    .select("card_count")
    .eq("id", studyDeckId)
    .eq("user_id", user.id)
    .single();
  const totalCards = deck?.card_count ?? 0;

  // 3. Determine pagination strategy
  const limit = options.limit ?? 100;
  const useKeyset = plan === "pro" && totalCards >= 5000;

  const sort = options.sort ?? "created_desc";
  const suspended = options.suspended ?? "all";
  const search = options.search;

  const sortCol = (sort === "name_asc" || sort === "name_desc") ? "front" : "created_at";
  const isAsc = (sort === "name_asc" || sort === "created_asc");

  if (useKeyset) {
    // Keyset (Cursor-based) Pagination
    const direction = options.direction ?? "next";
    const queryForward = direction === "next";
    const queryAsc = queryForward ? isAsc : !isAsc;

    let cursorObj: { sortValue: string | number; id: string } | null = null;
    if (options.cursor) {
      try {
        cursorObj = JSON.parse(Buffer.from(options.cursor, "base64").toString("utf-8"));
      } catch (e) {
        console.error("Failed to parse pagination cursor:", e);
      }
    }

    let query = supabase
      .from("study_cards")
      .select("*", { count: "exact" })
      .eq("study_deck_id", studyDeckId)
      .eq("user_id", user.id);

    // Apply suspended filters
    if (suspended === "suspended_only") {
      query = query.eq("state", "suspended");
    }

    // Apply trigram search
    if (search) {
      query = query.ilike("search_text", `%${search}%`);
    }

    // Apply keyset comparisons
    if (cursorObj) {
      const val = cursorObj.sortValue;
      const cid = cursorObj.id;
      const operator = (isAsc === queryForward) ? "gt" : "lt";
      query = query.or(`${sortCol}.${operator}."${val}",and(${sortCol}.eq."${val}",id.${operator}."${cid}")`);
    }

    // Database sorting & limit
    query = query
      .order(sortCol, { ascending: queryAsc })
      .order("id", { ascending: queryAsc })
      .limit(limit);

    const { data, count } = await query;
    let cards = (data ?? []) as StudyCard[];

    // If querying backward, reverse results to restore sorting order
    if (!queryForward) {
      cards = cards.reverse();
    }

    const nextCursorObj = cards.length > 0
      ? { sortValue: cards[cards.length - 1][sortCol as keyof StudyCard], id: cards[cards.length - 1].id }
      : null;
    const prevCursorObj = cards.length > 0
      ? { sortValue: cards[0][sortCol as keyof StudyCard], id: cards[0].id }
      : null;

    const nextCursor = (queryForward ? cards.length === limit : true) && nextCursorObj
      ? Buffer.from(JSON.stringify(nextCursorObj)).toString("base64")
      : null;
    const prevCursor = (queryForward ? cursorObj !== null : cards.length === limit) && prevCursorObj
      ? Buffer.from(JSON.stringify(prevCursorObj)).toString("base64")
      : null;

    console.log("[Audio] getStudyCards (keyset): attaching audios for", cards.length, "cards");
    const cardsWithAudios = await attachAudiosToStudyCards(supabase, cards);

    return {
      cards: cardsWithAudios,
      count: count ?? 0,
      useKeyset: true,
      nextCursor,
      prevCursor,
    };
  } else {
    // Offset-based Pagination
    const page = options.page ?? 1;
    const offset = options.offset ?? (page - 1) * limit;

    let query = supabase
      .from("study_cards")
      .select("*", { count: "exact" })
      .eq("study_deck_id", studyDeckId)
      .eq("user_id", user.id);

    // Apply suspended filters
    if (suspended === "suspended_only") {
      query = query.eq("state", "suspended");
    }

    // Apply trigram search
    if (search) {
      query = query.ilike("search_text", `%${search}%`);
    }

    // Sorting
    query = query
      .order(sortCol, { ascending: isAsc })
      .order("id", { ascending: isAsc })
      .range(offset, offset + limit - 1);

    const { data, count } = await query;
    console.log("[Audio] getStudyCards (offset): attaching audios for", (data ?? []).length, "cards");
    const cardsWithAudios = await attachAudiosToStudyCards(supabase, (data ?? []) as StudyCard[]);
    return {
      cards: cardsWithAudios,
      count: count ?? 0,
      useKeyset: false,
      nextCursor: null,
      prevCursor: null,
    };
  }
}

// ---------------------------------------------------------------------------
// attachAudiosToStudyCards — shared helper
// Joins card_audios + audio_files onto study cards via source_flashcard_id.
// ---------------------------------------------------------------------------
async function attachAudiosToStudyCards(
  supabase: SupabaseClient,
  cards: StudyCard[]
): Promise<StudyCard[]> {
  if (!cards || cards.length === 0) return [];

  const flashcardIds = cards
    .map((c) => c.source_flashcard_id)
    .filter(Boolean) as string[];

  const audiosMap: Record<string, CardAudio[]> = {};

  if (flashcardIds.length > 0) {
    const { data: cardAudios, error: audioError } = await supabase
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

    if (audioError) {
      console.error("[Audio Error] attachAudiosToStudyCards failed:", audioError.message);
    } else if (cardAudios) {
      const casted = cardAudios as unknown as Array<{ flashcard_id: string } & CardAudio>;
      console.log("[Audio] attachAudiosToStudyCards: found", casted.length, "audio records for", flashcardIds.length, "flashcard IDs");
      for (const audio of casted) {
        if (!audiosMap[audio.flashcard_id]) {
          audiosMap[audio.flashcard_id] = [];
        }
        audiosMap[audio.flashcard_id].push(audio);
      }
    }
  } else {
    console.log("[Audio] attachAudiosToStudyCards: no source_flashcard_ids found — skipping audio join");
  }

  return cards.map((card) => ({
    ...card,
    audios: card.source_flashcard_id ? (audiosMap[card.source_flashcard_id] || []) : [],
  })) as StudyCard[];
}

// ---------------------------------------------------------------------------
// bulkDeleteStudyCards
// ---------------------------------------------------------------------------

export async function bulkDeleteStudyCards(ids: string[], studyDeckId: string) {
  const user = await getCurrentUser();
  if (!user) return { error: "errors.auth.not_authenticated" };
  if (!ids.length) return { error: "errors.imports.no_rows" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("study_cards")
    .delete()
    .in("id", ids)
    .eq("study_deck_id", studyDeckId)
    .eq("user_id", user.id);

  if (error) return { error: error.message };
  revalidatePath(`/study/${studyDeckId}`);
  return { success: true };
}

// ---------------------------------------------------------------------------
// bulkSuspendStudyCards
// ---------------------------------------------------------------------------

export async function bulkSuspendStudyCards(ids: string[], studyDeckId: string) {
  const user = await getCurrentUser();
  if (!user) return { error: "errors.auth.not_authenticated" };
  if (!ids.length) return { error: "errors.imports.no_rows" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("study_cards")
    .update({ state: "suspended" })
    .in("id", ids)
    .eq("study_deck_id", studyDeckId)
    .eq("user_id", user.id);

  if (error) return { error: error.message };
  revalidatePath(`/study/${studyDeckId}`);
  return { success: true };
}

// ---------------------------------------------------------------------------
// bulkUnsuspendStudyCards
// ---------------------------------------------------------------------------

export async function bulkUnsuspendStudyCards(ids: string[], studyDeckId: string) {
  const user = await getCurrentUser();
  if (!user) return { error: "errors.auth.not_authenticated" };
  if (!ids.length) return { error: "errors.imports.no_rows" };

  const supabase = await createClient();

  const { data: cards, error: fetchError } = await supabase
    .from("study_cards")
    .select("id, repetitions, interval_days")
    .in("id", ids)
    .eq("study_deck_id", studyDeckId)
    .eq("user_id", user.id);

  if (fetchError || !cards) return { error: fetchError?.message ?? "errors.study_decks.card_not_found" };

  const updates = cards.map((card) => {
    const restoredState =
      card.repetitions === 0 ? "new" :
      card.interval_days < 1 ? "learn" :
      "review";

    return supabase
      .from("study_cards")
      .update({ state: restoredState })
      .eq("id", card.id)
      .eq("user_id", user.id);
  });

  const results = await Promise.all(updates);
  const errorResult = results.find((r) => r.error);
  if (errorResult) return { error: errorResult.error?.message };

  revalidatePath(`/study/${studyDeckId}`);
  return { success: true };
}

// ---------------------------------------------------------------------------
// bulkUpdateStudyCards
// ---------------------------------------------------------------------------

export async function bulkUpdateStudyCards(
  ids: string[],
  studyDeckId: string,
  updates: {
    front?: string;
    back?: string;
    addTags?: string[];
    removeTags?: string[];
    isFlagged?: boolean;
  },
  deletedAudioIds?: string[]
) {
  const user = await getCurrentUser();
  if (!user) return { error: "errors.auth.not_authenticated" };
  if (!ids.length) return { error: "errors.imports.no_rows" };

  const supabase = await createClient();

  if (ids.length === 1) {
    // Single card edit: allows front, back, and direct tags overwrite
    const cardId = ids[0];

    // Fetch card to get source_flashcard_id and current content
    const { data: currentCard } = await supabase
      .from("study_cards")
      .select("source_flashcard_id, front, back")
      .eq("id", cardId)
      .eq("study_deck_id", studyDeckId)
      .eq("user_id", user.id)
      .single();

    const up: {
      front?: string;
      back?: string;
      tags?: string[];
      is_flagged?: boolean;
    } = {};
    if (updates.front !== undefined) up.front = updates.front.trim();
    if (updates.back !== undefined) up.back = updates.back.trim();
    if (updates.isFlagged !== undefined) up.is_flagged = updates.isFlagged;
    if (updates.addTags !== undefined) {
      up.tags = updates.addTags; // Overwrite tags direct
    }

    const { error } = await supabase
      .from("study_cards")
      .update(up)
      .eq("id", cardId)
      .eq("study_deck_id", studyDeckId)
      .eq("user_id", user.id);

    if (error) return { error: error.message };

    // Clean up audio references & update master flashcard
    if (currentCard && currentCard.source_flashcard_id) {
      const front = up.front !== undefined ? up.front : currentCard.front;
      const back = up.back !== undefined ? up.back : currentCard.back;

      // Update master flashcard
      await supabase
        .from("flashcards")
        .update({ front, back })
        .eq("id", currentCard.source_flashcard_id);

      await cleanOrphanedCardAudios(supabase, currentCard.source_flashcard_id, front, back, deletedAudioIds);
    }
  } else {
    // Multi-card edit: applies flag status and modifies tags (add/remove)
    // 1. Fetch selected cards to inspect current tags
    const { data: cards, error: fetchError } = await supabase
      .from("study_cards")
      .select("id, tags")
      .in("id", ids)
      .eq("study_deck_id", studyDeckId)
      .eq("user_id", user.id);

    if (fetchError || !cards) {
      return { error: fetchError?.message ?? "errors.study_decks.card_not_found" };
    }

    // 2. Perform updates in parallel
    const updatesPromises = cards.map((card) => {
      const up: {
        is_flagged?: boolean;
        tags?: string[];
      } = {};
      if (updates.isFlagged !== undefined) {
        up.is_flagged = updates.isFlagged;
      }

      if (updates.addTags !== undefined || updates.removeTags !== undefined) {
        let newTags = [...(card.tags || [])];
        if (updates.addTags && updates.addTags.length > 0) {
          updates.addTags.forEach((tag) => {
            const t = tag.trim();
            if (t && !newTags.includes(t)) {
              newTags.push(t);
            }
          });
        }
        if (updates.removeTags && updates.removeTags.length > 0) {
          const toRemove = updates.removeTags.map((t) => t.trim());
          newTags = newTags.filter((t) => !toRemove.includes(t));
        }
        up.tags = newTags;
      }

      return supabase
        .from("study_cards")
        .update(up)
        .eq("id", card.id)
        .eq("user_id", user.id);
    });

    const results = await Promise.all(updatesPromises);
    const errorResult = results.find((r) => r.error);
    if (errorResult) return { error: errorResult.error?.message };
  }

  revalidatePath(`/study/${studyDeckId}`);
  return { success: true };
}

// ---------------------------------------------------------------------------
// updateStudyCard
// ---------------------------------------------------------------------------

export async function updateStudyCard(
  cardId: string,
  updates: { front?: string; back?: string; tags?: string[]; is_flagged?: boolean },
  deletedAudioIds?: string[]
) {
  const user = await getCurrentUser();
  if (!user) return { error: "errors.auth.not_authenticated" };

  const supabase = await createClient();

  // 1. Fetch study card to get source_flashcard_id and its current contents
  const { data: currentCard, error: fetchError } = await supabase
    .from("study_cards")
    .select("source_flashcard_id, front, back")
    .eq("id", cardId)
    .eq("user_id", user.id)
    .single();

  if (fetchError || !currentCard) {
    return { error: fetchError?.message ?? "errors.study_decks.card_not_found" };
  }

  // 2. Perform update on study_cards table
  const { data, error } = await supabase
    .from("study_cards")
    .update(updates)
    .eq("id", cardId)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) return { error: error.message };

  // 3. Propagate changes to master flashcard if source_flashcard_id exists
  if (currentCard.source_flashcard_id) {
    const front = updates.front !== undefined ? updates.front : currentCard.front;
    const back = updates.back !== undefined ? updates.back : currentCard.back;

    // Update master flashcard
    await supabase
      .from("flashcards")
      .update({ front, back })
      .eq("id", currentCard.source_flashcard_id);

    // Run cheerio-based diffing / pruning on the master flashcard ID
    await cleanOrphanedCardAudios(supabase, currentCard.source_flashcard_id, front, back, deletedAudioIds);
  }

  return { data };
}

// ---------------------------------------------------------------------------
// suspendStudyCard / unsuspendStudyCard
// ---------------------------------------------------------------------------

export async function suspendStudyCard(cardId: string) {
  const user = await getCurrentUser();
  if (!user) return { error: "errors.auth.not_authenticated" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("study_cards")
    .update({ state: "suspended" })
    .eq("id", cardId)
    .eq("user_id", user.id);

  if (error) return { error: error.message };
  return { success: true };
}

export async function unsuspendStudyCard(cardId: string) {
  const user = await getCurrentUser();
  if (!user) return { error: "errors.auth.not_authenticated" };

  const supabase = await createClient();

  // Determine correct restoration state
  const { data: card } = await supabase
    .from("study_cards")
    .select("repetitions, interval_days")
    .eq("id", cardId)
    .eq("user_id", user.id)
    .single();

  if (!card) return { error: "errors.study_decks.card_not_found" };

  const restoredState =
    card.repetitions === 0 ? "new" :
    card.interval_days < 1 ? "learn" :
    "review";

  const { error } = await supabase
    .from("study_cards")
    .update({ state: restoredState })
    .eq("id", cardId)
    .eq("user_id", user.id);

  if (error) return { error: error.message };
  return { success: true };
}

// ---------------------------------------------------------------------------
// deleteStudyCard
// ---------------------------------------------------------------------------

export async function deleteStudyCard(cardId: string, studyDeckId: string) {
  const user = await getCurrentUser();
  if (!user) return { error: "errors.auth.not_authenticated" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("study_cards")
    .delete()
    .eq("id", cardId)
    .eq("user_id", user.id);

  if (error) return { error: error.message };
  revalidatePath(`/study/${studyDeckId}`);
  return { success: true };
}
