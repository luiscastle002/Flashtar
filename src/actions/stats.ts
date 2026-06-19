"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/queries/user";
import { getStudyDecks, getDeckDueCounts } from "./study-decks";

export interface StreakStats {
  currentStreak: number;
  longestStreak: number;
}

export interface SummaryStats {
  totalStudied: number;
  totalTimeMs: number;
  averageRetention: number;
}

export interface CalendarDay {
  date: string;
  count: number;
  timeMs: number;
  retention: number | null;
}

export interface FutureDueBucket {
  bucket: string;
  count: number;
}

function getLocalDateInTimezone(timezone: string, offsetDays = 0): string {
  const date = new Date();
  if (offsetDays !== 0) {
    date.setDate(date.getDate() + offsetDays);
  }
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const parts = formatter.formatToParts(date);
    const year = parts.find((p) => p.type === "year")?.value;
    const month = parts.find((p) => p.type === "month")?.value;
    const day = parts.find((p) => p.type === "day")?.value;
    return `${year}-${month}-${day}`;
  } catch {
    return date.toISOString().split("T")[0];
  }
}

function calculateStreaks(
  stats: { stat_date: string; cards_reviewed: number }[],
  timezone = "UTC"
): StreakStats {
  const studiedDates = new Set(
    stats.filter((s) => s.cards_reviewed > 0).map((s) => s.stat_date)
  );

  const sortedDates = Array.from(studiedDates).sort(
    (a, b) => new Date(b).getTime() - new Date(a).getTime()
  );

  if (sortedDates.length === 0) {
    return { currentStreak: 0, longestStreak: 0 };
  }

  const todayStr = getLocalDateInTimezone(timezone, 0);
  const yesterdayStr = getLocalDateInTimezone(timezone, -1);
  const hasStudiedRecently = studiedDates.has(todayStr) || studiedDates.has(yesterdayStr);

  let longestStreak = 0;
  let tempStreak = 0;
  let lastDate: Date | null = null;

  for (let i = 0; i < sortedDates.length; i++) {
    const currentDate = new Date(sortedDates[i]);
    if (lastDate === null) {
      tempStreak = 1;
    } else {
      const diffTime = Math.abs(lastDate.getTime() - currentDate.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      if (diffDays === 1) {
        tempStreak++;
      } else if (diffDays > 1) {
        longestStreak = Math.max(longestStreak, tempStreak);
        tempStreak = 1;
      }
    }
    lastDate = currentDate;
  }
  longestStreak = Math.max(longestStreak, tempStreak);

  let currentStreak = 0;
  if (hasStudiedRecently) {
    currentStreak = 1;
    let checkDate = new Date(sortedDates[0]);
    for (let i = 1; i < sortedDates.length; i++) {
      const nextDate = new Date(sortedDates[i]);
      const diffTime = Math.abs(checkDate.getTime() - nextDate.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      if (diffDays === 1) {
        currentStreak++;
        checkDate = nextDate;
      } else {
        break;
      }
    }
  }

  return { currentStreak, longestStreak };
}

export async function getSelectorDecks() {
  const decks = await getStudyDecks(false);
  const dueCounts = await Promise.all(
    decks.map((deck) => getDeckDueCounts(deck.id))
  );

  return decks.map((deck, i) => ({
    id: deck.id,
    name: deck.name,
    emoji: deck.emoji,
    color: deck.color,
    icon_type: deck.icon_type || "emoji",
    custom_icon_path: deck.custom_icon_path,
    card_count: deck.card_count,
    last_studied_at: deck.last_studied_at,
    due_count: dueCounts[i]?.total_due ?? 0,
  }));
}

export async function getStatsDashboardData(
  deckId: string | null = null,
  timezone = "UTC"
) {
  const user = await getCurrentUser();
  if (!user) {
    return {
      streak: { currentStreak: 0, longestStreak: 0 },
      summary: { totalStudied: 0, totalTimeMs: 0, averageRetention: 0 },
      calendar: [] as CalendarDay[],
      futureDue: [] as FutureDueBucket[],
    };
  }

  const supabase = await createClient();

  // 1. Fetch Calendar Heatmap and Streaks from user_study_stats
  let statsQuery = supabase
    .from("user_study_stats")
    .select("stat_date, cards_reviewed, cards_good, cards_easy, study_time_ms")
    .eq("user_id", user.id);

  if (deckId) {
    statsQuery = statsQuery.eq("study_deck_id", deckId);
  } else {
    statsQuery = statsQuery.is("study_deck_id", null);
  }

  // Fetch last 365 days of stats
  const startDate = new Date();
  startDate.setFullYear(startDate.getFullYear() - 1);
  statsQuery = statsQuery.gte("stat_date", startDate.toISOString().split("T")[0]);

  const { data: statsData } = await statsQuery.order("stat_date", { ascending: true });
  const rawStats = statsData ?? [];

  // Calculate Streaks
  const streak = calculateStreaks(rawStats, timezone);

  // Calculate Summaries
  let totalStudied = 0;
  let totalTimeMs = 0;
  let totalGoodEasy = 0;

  const calendar: CalendarDay[] = rawStats.map((row) => {
    totalStudied += row.cards_reviewed;
    totalTimeMs += Number(row.study_time_ms);
    totalGoodEasy += row.cards_good + row.cards_easy;

    const retention =
      row.cards_reviewed > 0
        ? Math.round(((row.cards_good + row.cards_easy) / row.cards_reviewed) * 100)
        : null;

    return {
      date: row.stat_date,
      count: row.cards_reviewed,
      timeMs: Number(row.study_time_ms),
      retention,
    };
  });

  const averageRetention =
    totalStudied > 0 ? Math.round((totalGoodEasy / totalStudied) * 100) : 0;

  const summary: SummaryStats = {
    totalStudied,
    totalTimeMs,
    averageRetention,
  };

  // 2. Fetch Future Due statistics using postgres RPC
  const { data: futureDueData } = await supabase.rpc("get_future_due_stats", {
    p_user_id: user.id,
    p_deck_id: deckId || null,
    p_timezone: timezone,
  });

  const rawFutureDue = futureDueData ?? [];

  const buckets = [
    "today",
    "tomorrow",
    "2_days",
    "3_days",
    "4_7_days",
    "8_30_days",
    "30_plus_days",
  ];

  // Map RPC output to buckets
  const futureDueMap = new Map<number, number>();
  rawFutureDue.forEach((row: { due_bucket: number; card_count: number }) => {
    futureDueMap.set(row.due_bucket, row.card_count);
  });

  const futureDue: FutureDueBucket[] = buckets.map((bucket, i) => ({
    bucket,
    count: futureDueMap.get(i) ?? 0,
  }));

  return {
    streak,
    summary,
    calendar,
    futureDue,
  };
}
