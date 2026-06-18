"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/queries/user";
import type { StudyCard } from "@/types";

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
    .select("id, card_count")
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

  const studyCards = validRows.map((row, i) => ({
    study_deck_id: studyDeckId,
    user_id: user.id,
    front: row.front.trim(),
    back: row.back.trim(),
    tags: row.tags ?? [],
    import_id: importRecord?.id ?? null,
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

    return {
      cards,
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
    return {
      cards: (data ?? []) as StudyCard[],
      count: count ?? 0,
      useKeyset: false,
      nextCursor: null,
      prevCursor: null,
    };
  }
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
// updateStudyCard
// ---------------------------------------------------------------------------

export async function updateStudyCard(
  cardId: string,
  updates: { front?: string; back?: string; tags?: string[]; is_flagged?: boolean }
) {
  const user = await getCurrentUser();
  if (!user) return { error: "errors.auth.not_authenticated" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("study_cards")
    .update(updates)
    .eq("id", cardId)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) return { error: error.message };
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
