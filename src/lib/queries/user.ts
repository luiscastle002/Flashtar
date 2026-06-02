import { createClient } from "@/lib/supabase/server";
import type { DashboardStats, Plan, SubscriptionStatus } from "@/types";
import { PLAN_LIMITS } from "@/types";

export async function getCurrentUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export async function getProfile() {
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) return null;

  const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  return data;
}

export async function getSubscription(userId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("user_id", userId)
    .single();
  return data;
}

export async function getDashboardStats(): Promise<DashboardStats | null> {
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) return null;

  const [decksResult, flashcardsResult, generationsResult, subscription] = await Promise.all([
    supabase.from("decks").select("id", { count: "exact", head: true }).eq("user_id", user.id),
    supabase
      .from("flashcards")
      .select("id, decks!inner(user_id)", { count: "exact", head: true })
      .eq("decks.user_id", user.id),
    supabase
      .from("ai_generations")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("status", "completed")
      .gte("created_at", new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()),
    getSubscription(user.id),
  ]);

  const plan = (subscription?.plan ?? "free") as Plan;
  const limits = PLAN_LIMITS[plan];

  return {
    totalDecks: decksResult.count ?? 0,
    totalFlashcards: flashcardsResult.count ?? 0,
    monthlyGenerations: generationsResult.count ?? 0,
    generationLimit: limits.monthlyGenerations,
    plan,
    subscriptionStatus: (subscription?.status ?? "inactive") as SubscriptionStatus,
  };
}

export async function getRecentDecks(limit = 5) {
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) return [];

  const { data: decks } = await supabase
    .from("decks")
    .select("*")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (!decks?.length) return [];

  const deckIds = decks.map((d) => d.id);
  const { data: counts } = await supabase
    .from("flashcards")
    .select("deck_id")
    .in("deck_id", deckIds);

  const countMap = (counts ?? []).reduce<Record<string, number>>((acc, row) => {
    acc[row.deck_id] = (acc[row.deck_id] ?? 0) + 1;
    return acc;
  }, {});

  return decks.map((deck) => ({
    ...deck,
    flashcard_count: countMap[deck.id] ?? 0,
  }));
}

export async function canGenerateDeck(cardCount: number): Promise<{
  allowed: boolean;
  reason?: string;
  plan: Plan;
}> {
  const user = await getCurrentUser();
  if (!user) return { allowed: false, reason: "Not authenticated", plan: "free" };

  const subscription = await getSubscription(user.id);
  const plan = (subscription?.plan ?? "free") as Plan;
  const limits = PLAN_LIMITS[plan];

  if (cardCount > limits.maxCardsPerDeck) {
    return {
      allowed: false,
      reason: `Your ${plan} plan allows up to ${limits.maxCardsPerDeck} cards per deck.`,
      plan,
    };
  }

  if (plan === "free") {
    const supabase = await createClient();
    const { count } = await supabase
      .from("ai_generations")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("status", "completed")
      .gte("created_at", new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString());

    if ((count ?? 0) >= limits.monthlyGenerations) {
      return {
        allowed: false,
        reason: "You've reached your monthly AI generation limit. Upgrade to Pro for unlimited generations.",
        plan,
      };
    }
  }

  return { allowed: true, plan };
}
