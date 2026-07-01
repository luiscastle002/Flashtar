"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/queries/user";
import { getDeckDueCounts } from "./study-decks";

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// getCoursesCategories
// ---------------------------------------------------------------------------
export async function getCoursesCategories() {
  const user = await getCurrentUser();
  if (!user) return [];

  const supabase = await createClient();

  // Fetch categories
  const { data: categories, error: catError } = await supabase
    .from("shared_categories")
    .select("id, name_key, position")
    .order("position", { ascending: true });

  if (catError || !categories) {
    console.error("Error fetching categories:", catError);
    return [];
  }

  // Fetch shared decks
  const { data: sharedDecks } = await supabase
    .from("shared_decks")
    .select("id, category_id, card_count");

  const decksList = sharedDecks ?? [];

  // Fetch user study decks
  const { data: userDecks } = await supabase
    .from("study_decks")
    .select("id, shared_deck_id")
    .eq("user_id", user.id)
    .not("shared_deck_id", "is", null);

  const userDecksList = userDecks ?? [];
  const enrolledSharedDeckIds = new Set(userDecksList.map(ud => ud.shared_deck_id));
  const studyDeckIds = userDecksList.map(ud => ud.id);

  // Fetch study cards count to compute progress
  let studiedCardsCountMap: Record<string, number> = {};
  if (studyDeckIds.length > 0) {
    const { data: cardCounts } = await supabase
      .from("study_cards")
      .select("study_deck_id")
      .eq("user_id", user.id)
      .in("study_deck_id", studyDeckIds);

    studiedCardsCountMap = (cardCounts ?? []).reduce<Record<string, number>>((acc, c) => {
      acc[c.study_deck_id] = (acc[c.study_deck_id] || 0) + 1;
      return acc;
    }, {});
  }

  // Map categories with stats
  return categories.map((cat) => {
    const catDecks = decksList.filter(d => d.category_id === cat.id);
    const deckCount = catDecks.length;
    const totalCards = catDecks.reduce((sum, d) => sum + d.card_count, 0);

    // Enrolled count
    const enrolledDecks = catDecks.filter(d => enrolledSharedDeckIds.has(d.id));
    const enrolledCount = enrolledDecks.length;

    // Progress cards
    let totalStudied = 0;
    enrolledDecks.forEach(d => {
      const userDeck = userDecksList.find(ud => ud.shared_deck_id === d.id);
      if (userDeck) {
        totalStudied += studiedCardsCountMap[userDeck.id] || 0;
      }
    });

    const progressPct = totalCards > 0 ? Math.round((totalStudied / totalCards) * 100) : 0;

    return {
      id: cat.id,
      name_key: cat.name_key,
      position: cat.position,
      deckCount,
      enrolledCount,
      totalCards,
      totalStudied,
      progressPct
    };
  });
}

// ---------------------------------------------------------------------------
// getCategoryDecks
// ---------------------------------------------------------------------------
export async function getCategoryDecks(categoryId: string) {
  const user = await getCurrentUser();
  if (!user) return null;

  const supabase = await createClient();

  // Fetch category details
  const { data: category, error: catError } = await supabase
    .from("shared_categories")
    .select("id, name_key")
    .eq("id", categoryId)
    .single();

  if (catError || !category) {
    console.error("Error fetching category:", catError);
    return null;
  }

  // Fetch shared decks in this category
  const { data: sharedDecks } = await supabase
    .from("shared_decks")
    .select("*")
    .eq("category_id", categoryId)
    .order("position", { ascending: true });

  const decks = (sharedDecks ?? []) as SharedDeck[];

  // Fetch the user's study decks linked to these shared_decks
  const sharedDeckIds = decks.map(d => d.id);
  if (sharedDeckIds.length === 0) {
    return {
      category,
      decks: []
    };
  }

  const { data: userDecks } = await supabase
    .from("study_decks")
    .select("id, shared_deck_id")
    .eq("user_id", user.id)
    .in("shared_deck_id", sharedDeckIds);

  const enrolledDeckIds = (userDecks ?? []).map((ud) => ud.id);
  const dueCounts = await Promise.all(
    enrolledDeckIds.map((id) => getDeckDueCounts(id))
  );

  const dueCountsMap = enrolledDeckIds.reduce<Record<string, { new_count: number; learn_count: number; review_count: number; total_due: number }>>((acc, id, index) => {
    acc[id] = dueCounts[index] ?? { new_count: 0, learn_count: 0, review_count: 0, total_due: 0 };
    return acc;
  }, {});

  const enrollmentMap = (userDecks ?? []).reduce<Record<string, { studyDeckId: string; due: typeof dueCountsMap[string] }>>((acc, ud) => {
    acc[ud.shared_deck_id!] = {
      studyDeckId: ud.id,
      due: dueCountsMap[ud.id] ?? { new_count: 0, learn_count: 0, review_count: 0, total_due: 0 },
    };
    return acc;
  }, {});

  const mappedDecks = decks.map((deck) => {
    const enrollment = enrollmentMap[deck.id];
    return {
      ...deck,
      enrolled: !!enrollment,
      studyDeckId: enrollment?.studyDeckId ?? null,
      due: enrollment?.due ?? null,
    };
  });

  return {
    category,
    decks: mappedDecks
  };
}

interface SharedDeck {
  id: string;
  name_key: string;
  description_key: string | null;
  emoji: string | null;
  color: string;
  difficulty: string;
  language: string;
  card_count: number;
  position: number;
}

// ---------------------------------------------------------------------------
// initializeCourse
// ---------------------------------------------------------------------------
export async function initializeCourse(sharedDeckId: string) {
  const user = await getCurrentUser();
  if (!user) return { error: "errors.auth.not_authenticated" };

  const supabase = await createClient();

  // 1. Fetch the shared deck
  const { data: sharedDeck, error: sharedDeckError } = await supabase
    .from("shared_decks")
    .select("name_key, emoji, color, card_count")
    .eq("id", sharedDeckId)
    .single();

  if (sharedDeckError || !sharedDeck) {
    return { error: "errors.courses.not_found" };
  }

  // 2. Check if already enrolled
  const { data: existingDeck } = await supabase
    .from("study_decks")
    .select("id")
    .eq("user_id", user.id)
    .eq("shared_deck_id", sharedDeckId)
    .maybeSingle();

  if (existingDeck) {
    return { data: { studyDeckId: existingDeck.id } };
  }

  // 3. Create the study deck (lazy progress: no cards are pre-created)
  const { data: newDeck, error: createError } = await supabase
    .from("study_decks")
    .insert({
      user_id: user.id,
      shared_deck_id: sharedDeckId,
      name: sharedDeck.name_key,
      emoji: sharedDeck.emoji,
      color: sharedDeck.color,
      card_count: sharedDeck.card_count,
    })
    .select("id")
    .single();

  if (createError || !newDeck) {
    return { error: createError?.message ?? "errors.courses.enroll_failed" };
  }

  revalidatePath("/study/courses");
  revalidatePath(`/study/courses/${sharedDeckId}`);
  return { data: { studyDeckId: newDeck.id } };
}

// ---------------------------------------------------------------------------
// resetCourseProgress
// ---------------------------------------------------------------------------
export async function resetCourseProgress(studyDeckId: string) {
  const user = await getCurrentUser();
  if (!user) return { error: "errors.auth.not_authenticated" };

  const supabase = await createClient();

  // Verify ownership before deleting
  const { data: deck } = await supabase
    .from("study_decks")
    .select("shared_deck_id")
    .eq("id", studyDeckId)
    .eq("user_id", user.id)
    .single();

  if (!deck || !deck.shared_deck_id) {
    return { error: "errors.courses.not_found" };
  }

  // Delete the study deck. Cascading deletes will remove settings, card progress rows, logs, and sessions.
  const { error: deleteError } = await supabase
    .from("study_decks")
    .delete()
    .eq("id", studyDeckId)
    .eq("user_id", user.id);

  if (deleteError) {
    return { error: deleteError.message };
  }

  revalidatePath("/study/courses");
  revalidatePath(`/study/courses/${deck.shared_deck_id}`);
  return { success: true };
}
