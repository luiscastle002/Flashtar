import { createClient } from "@/lib/supabase/server";
import type { DashboardStats, Plan, SubscriptionStatus, Subscription } from "@/types";
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

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  if (!profile) return null;

  // Progressive synchronization of Google avatar URL
  const avatarType = profile.avatar_type;
  if (!avatarType || avatarType === 'google') {
    const googleAvatar = user.user_metadata?.avatar_url ?? user.user_metadata?.picture ?? null;
    if (googleAvatar && googleAvatar !== profile.avatar_url) {
      const { data: updatedProfile } = await supabase
        .from("profiles")
        .update({
          avatar_url: googleAvatar,
          avatar_type: 'google',
          updated_at: new Date().toISOString(),
        })
        .eq("id", user.id)
        .select()
        .single();
      
      if (updatedProfile) {
        return updatedProfile;
      }
    }
  }

  return profile;
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

export async function getBillingCycleBoundaries(userId: string, subscription?: Subscription | null) {
  const sub = subscription || await getSubscription(userId);
  const plan = sub?.plan ?? "free";

  if (plan === "free" || !sub?.current_period_start || !sub?.current_period_end) {
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
    return { periodStart, periodEnd };
  }

  return {
    periodStart: new Date(sub.current_period_start).toISOString(),
    periodEnd: new Date(sub.current_period_end).toISOString(),
  };
}

export async function getDashboardStats(): Promise<DashboardStats | null> {
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) return null;

  const subscription = await getSubscription(user.id);
  const { periodStart, periodEnd } = await getBillingCycleBoundaries(user.id, subscription);

  const [decksResult, flashcardsResult, generationsResult] = await Promise.all([
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
      .gte("created_at", periodStart)
      .lte("created_at", periodEnd),
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

  const checkCount = cardCount === 0 ? 30 : cardCount;
  if (checkCount > limits.maxCardsPerDeck) {
    return {
      allowed: false,
      reason: `Your ${plan} plan allows up to ${limits.maxCardsPerDeck} cards per deck.`,
      plan,
    };
  }

  if (plan === "free") {
    const { periodStart, periodEnd } = await getBillingCycleBoundaries(user.id, subscription);
    const supabase = await createClient();
    const { count } = await supabase
      .from("ai_generations")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("status", "completed")
      .gte("created_at", periodStart)
      .lte("created_at", periodEnd);

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

// ---------------------------------------------------------------------------
// Study Mode v2 — Billing Gate Helpers
// ---------------------------------------------------------------------------

export async function getStudyDeckCount(userId: string): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("study_decks")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("is_archived", false)
    .is("shared_deck_id", null);
  return count ?? 0;
}

/**
 * Returns whether a user can create another study deck based on their plan.
 */
export async function canCreateStudyDeck(): Promise<{
  allowed: boolean;
  reason?: string;
  plan: Plan;
  currentCount: number;
  limit: number | typeof Infinity;
}> {
  const user = await getCurrentUser();
  if (!user) {
    return { allowed: false, reason: "Not authenticated", plan: "free", currentCount: 0, limit: 3 };
  }

  const subscription = await getSubscription(user.id);
  const plan = (subscription?.plan ?? "free") as Plan;
  const limit = PLAN_LIMITS[plan].studyDecks;

  if (limit === Infinity) {
    return { allowed: true, plan, currentCount: 0, limit };
  }

  const currentCount = await getStudyDeckCount(user.id);
  if (currentCount >= limit) {
    return {
      allowed: false,
      reason: `Free plan includes up to ${limit} study decks. Upgrade to Pro for unlimited decks.`,
      plan,
      currentCount,
      limit,
    };
  }

  return { allowed: true, plan, currentCount, limit };
}

/**
 * Returns the total media storage used by a user in megabytes.
 */
export async function getUserMediaUsageMb(userId: string): Promise<number> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("media_assets")
    .select("size_bytes")
    .eq("user_id", userId);

  if (!data?.length) return 0;
  const totalBytes = data.reduce((sum, row) => sum + (row.size_bytes ?? 0), 0);
  return totalBytes / (1024 * 1024);
}

/**
 * Returns whether a user can upload a media file of the given size.
 * Always returns false for free users (no media uploads allowed).
 */
export async function canUploadMedia(fileSizeMb: number): Promise<{
  allowed: boolean;
  reason?: string;
  plan: Plan;
  usedMb: number;
  limitMb: number;
}> {
  const user = await getCurrentUser();
  if (!user) {
    return { allowed: false, reason: "Not authenticated", plan: "free", usedMb: 0, limitMb: 0 };
  }

  const subscription = await getSubscription(user.id);
  const plan = (subscription?.plan ?? "free") as Plan;
  const limitMb = PLAN_LIMITS[plan].mediaStorageMb;

  if (limitMb === 0) {
    return {
      allowed: false,
      reason: "Media uploads are a Pro feature. Upgrade to upload images and audio files.",
      plan,
      usedMb: 0,
      limitMb: 0,
    };
  }

  const usedMb = await getUserMediaUsageMb(user.id);
  if (usedMb + fileSizeMb > limitMb) {
    return {
      allowed: false,
      reason: `Storage limit reached (${limitMb} MB). You have ${(limitMb - usedMb).toFixed(1)} MB remaining.`,
      plan,
      usedMb,
      limitMb,
    };
  }

  return { allowed: true, plan, usedMb, limitMb };
}

/**
 * Returns whether a user has access to full statistics (Pro feature).
 */
export async function canAccessFullStats(): Promise<boolean> {
  const user = await getCurrentUser();
  if (!user) return false;
  const subscription = await getSubscription(user.id);
  const plan = (subscription?.plan ?? "free") as Plan;
  return PLAN_LIMITS[plan].fullStats;
}

/**
 * Retrieves the Google Drive connection status for a user.
 */
export async function getGoogleDriveConnection(userId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("user_google_drive_connections")
    .select("google_email, connection_status, root_folder_id, audio_folder_id")
    .eq("user_id", userId)
    .single();
  return data;
}

/**
 * Retrieves or initializes the character credit usage summary for a user.
 * Implements JIT lazy period resets.
 */
export async function getOrCreateAudioUsage(userId: string) {
  const supabase = await createClient();
  const sub = await getSubscription(userId);
  const plan = sub?.plan ?? "free";
  const limit = plan === "pro" ? 3000000 : 100000;
  
  const { data: usage } = await supabase
    .from("audio_usage")
    .select("*")
    .eq("user_id", userId)
    .single();

  const now = new Date();

  // Determine target period boundaries based on subscription or calendar month
  let targetStart: string;
  let targetEnd: string;

  if (plan === "pro" && sub?.current_period_start && sub?.current_period_end) {
    targetStart = new Date(sub.current_period_start).toISOString();
    targetEnd = new Date(sub.current_period_end).toISOString();
  } else {
    // If usage exists, we can keep the existing cycle or advance it by 1 month if past due
    if (usage) {
      const periodEnd = new Date(usage.period_end);
      if (now >= periodEnd) {
        const newPeriodStart = periodEnd;
        const newPeriodEnd = new Date(periodEnd);
        newPeriodEnd.setMonth(newPeriodEnd.getMonth() + 1);
        targetStart = newPeriodStart.toISOString();
        targetEnd = newPeriodEnd.toISOString();
      } else {
        targetStart = new Date(usage.period_start).toISOString();
        targetEnd = new Date(usage.period_end).toISOString();
      }
    } else {
      const periodEnd = new Date();
      periodEnd.setMonth(periodEnd.getMonth() + 1);
      targetStart = now.toISOString();
      targetEnd = periodEnd.toISOString();
    }
  }

  if (usage) {
    // Perform JIT reset if the target end period doesn't match the current usage end period
    // OR if target ends is in the past (e.g. for free users where we advanced the period)
    const currentEndStr = new Date(usage.period_end).toISOString();
    const targetEndStr = new Date(targetEnd).toISOString();

    if (currentEndStr !== targetEndStr || (plan === "free" && now >= new Date(usage.period_end))) {
      const { data: resetUsage } = await supabase
        .from("audio_usage")
        .update({
          used_this_month: 0,
          monthly_limit: limit,
          period_start: targetStart,
          period_end: targetEnd,
          last_updated: now.toISOString(),
        })
        .eq("user_id", userId)
        .select()
        .single();
        
      if (resetUsage) {
        await supabase.from("audio_usage_history").insert({
          user_id: userId,
          characters_consumed: 0,
          action_type: "monthly_grant",
          source_details: { limit },
        });
        return resetUsage;
      }
    }
    
    // If the plan changed but the period is same, we might need to update the limit
    if (usage.monthly_limit !== limit) {
      const { data: updatedLimitUsage } = await supabase
        .from("audio_usage")
        .update({
          monthly_limit: limit,
          last_updated: now.toISOString(),
        })
        .eq("user_id", userId)
        .select()
        .single();
      if (updatedLimitUsage) return updatedLimitUsage;
    }

    return usage;
  }

  // Create new record
  const { data: newUsage } = await supabase
    .from("audio_usage")
    .insert({
      user_id: userId,
      monthly_limit: limit,
      used_this_month: 0,
      period_start: targetStart,
      period_end: targetEnd,
      last_updated: now.toISOString(),
    })
    .select()
    .single();

  if (newUsage) {
    await supabase.from("audio_usage_history").insert({
      user_id: userId,
      characters_consumed: 0,
      action_type: "monthly_grant",
      source_details: { limit },
    });
  }

  return newUsage;
}

/**
 * Retrieves the recent credit transaction logs for a user.
 */
export async function getAudioUsageHistory(userId: string, limit = 10) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("audio_usage_history")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return data || [];
}

/**
 * Checks if the user has any quota_exceeded jobs in the upload queue.
 */
export async function hasQuotaExceededJobs(userId: string): Promise<boolean> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("media_upload_queue")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "quota_exceeded");
  return (count ?? 0) > 0;
}

