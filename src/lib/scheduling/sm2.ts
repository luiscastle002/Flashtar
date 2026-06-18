/**
 * Modified SM-2 Scheduling Engine — Flashtar Study Mode v2
 *
 * Pure functions with zero side-effects and zero database calls.
 * All scheduling decisions happen here; the server action just persists the result.
 *
 * Based on Anki's implementation of SuperMemo 2 with the following additions:
 *  - Hard interval multiplier (×1.2, ease −0.15)
 *  - Easy bonus multiplier (×1.3 on top of EF)
 *  - Interval fuzzing (±5–10% random jitter to prevent card clumping)
 *  - Leech detection (auto-suspend at lapse threshold)
 *  - Learning step parsing ("1m" → minutes, "1d" → days)
 */

import type {
  StudyCard,
  DeckStudySettings,
  SchedulingResult,
  ConfidenceRating,
  CardStudyState,
} from "@/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Hard rating: ease penalty */
const HARD_EASE_DELTA = -0.15;
/** Again rating: ease penalty */
const AGAIN_EASE_DELTA = -0.20;
/** Easy rating: ease bonus */
const EASY_EASE_DELTA = 0.15;

/** Hard rating: interval multiplier (instead of full EF) */
const HARD_INTERVAL_MULTIPLIER = 1.2;
/** Easy rating: bonus multiplier applied on top of EF */
const EASY_BONUS = 1.3;

/** Interval fuzz range (±%) to prevent all cards clustering on same day */
const FUZZ_MIN = 0.95;
const FUZZ_MAX = 1.05;

// ---------------------------------------------------------------------------
// Public: Map confidence percentage → rating bucket
// ---------------------------------------------------------------------------

/**
 * Maps a 0–100 confidence percentage to an SM-2 rating bucket.
 * Zones: 0–24 = again, 25–49 = hard, 50–74 = good, 75–100 = easy
 */
export function confidenceToRating(pct: number): ConfidenceRating {
  if (pct <= 24) return "again";
  if (pct <= 49) return "hard";
  if (pct <= 74) return "good";
  return "easy";
}

// ---------------------------------------------------------------------------
// Public: Main scheduling function
// ---------------------------------------------------------------------------

/**
 * Calculates the next scheduling state for a card after a review.
 *
 * @param card     - The current study card (SM-2 fields must be populated)
 * @param rating   - The rating bucket (derived from confidence_pct)
 * @param settings - The deck's study settings
 * @returns        - The new scheduling state to persist
 */
export function scheduleCard(
  card: StudyCard,
  rating: ConfidenceRating,
  settings: DeckStudySettings
): SchedulingResult {
  // Choose the scheduling path based on current card state
  if (card.state === "new" || card.state === "learn") {
    return scheduleLearning(card, rating, settings);
  }
  if (card.state === "review" || card.state === "leech") {
    return scheduleReview(card, rating, settings);
  }
  // Suspended/buried cards shouldn't be reviewed — return unchanged as safety net
  return buildResult(card, card.state);
}

// ---------------------------------------------------------------------------
// Private: Learning phase scheduler
// ---------------------------------------------------------------------------

function scheduleLearning(
  card: StudyCard,
  rating: ConfidenceRating,
  settings: DeckStudySettings
): SchedulingResult {
  const steps = settings.learning_steps;

  if (rating === "again") {
    // Restart learning from step 0
    return {
      state: "learn",
      due_at: addMinutes(new Date(), parseStep(steps[0] ?? "1m")),
      ease_factor: card.ease_factor,
      interval_days: 0,
      repetitions: 0,
      lapse_count: card.lapse_count,
      learning_step_index: 0,
    };
  }

  if (rating === "easy") {
    // Graduate immediately to easy_interval
    const interval = fuzz(settings.easy_interval);
    return {
      state: "review",
      due_at: addDays(new Date(), interval),
      ease_factor: Math.min(2.5, card.ease_factor + EASY_EASE_DELTA),
      interval_days: interval,
      repetitions: card.repetitions + 1,
      lapse_count: card.lapse_count,
      learning_step_index: 0,
    };
  }

  // good or hard: advance to next step (hard stays on current step, good advances)
  const currentIndex = card.learning_step_index;
  const nextIndex =
    rating === "hard"
      ? currentIndex // stay on same step
      : currentIndex + 1; // good → advance

  if (nextIndex >= steps.length) {
    // All steps complete → graduate to review
    const interval = fuzz(settings.graduating_interval);
    return {
      state: "review",
      due_at: addDays(new Date(), interval),
      ease_factor: card.ease_factor,
      interval_days: interval,
      repetitions: card.repetitions + 1,
      lapse_count: card.lapse_count,
      learning_step_index: 0,
    };
  }

  // Still in learning steps
  return {
    state: "learn",
    due_at: addMinutes(new Date(), parseStep(steps[nextIndex])),
    ease_factor: card.ease_factor,
    interval_days: 0,
    repetitions: card.repetitions,
    lapse_count: card.lapse_count,
    learning_step_index: nextIndex,
  };
}

// ---------------------------------------------------------------------------
// Private: Review phase scheduler
// ---------------------------------------------------------------------------

function scheduleReview(
  card: StudyCard,
  rating: ConfidenceRating,
  settings: DeckStudySettings
): SchedulingResult {
  const newLapseCount = rating === "again" ? card.lapse_count + 1 : card.lapse_count;

  if (rating === "again") {
    // Card lapsed — re-enter relearning steps
    const reSteps = settings.relearning_steps;
    const isLeech =
      newLapseCount >= settings.leech_threshold;
    const newEase = Math.max(
      settings.ease_minimum,
      card.ease_factor + AGAIN_EASE_DELTA
    );

    return {
      state: isLeech ? "leech" : "learn",
      due_at: reSteps.length
        ? addMinutes(new Date(), parseStep(reSteps[0]))
        : addDays(new Date(), 1),
      ease_factor: newEase,
      interval_days: 0,
      repetitions: 0,
      lapse_count: newLapseCount,
      learning_step_index: 0,
    };
  }

  // Calculate next interval based on rating
  let newEase = card.ease_factor;
  let newInterval: number;

  if (rating === "hard") {
    newEase = Math.max(settings.ease_minimum, card.ease_factor + HARD_EASE_DELTA);
    // Hard uses a fixed multiplier rather than ease_factor
    newInterval = Math.max(
      card.interval_days + 1,
      card.interval_days * HARD_INTERVAL_MULTIPLIER
    );
  } else if (rating === "good") {
    // Standard SM-2 interval
    newInterval = Math.max(
      card.interval_days + 1,
      card.interval_days * card.ease_factor
    );
  } else {
    // easy — interval × EF × easy_bonus, plus ease boost
    newEase = Math.min(3.0, card.ease_factor + EASY_EASE_DELTA);
    newInterval = Math.max(
      card.interval_days + 1,
      card.interval_days * card.ease_factor * EASY_BONUS
    );
  }

  // Apply fuzz and enforce maximum
  newInterval = Math.min(
    settings.maximum_interval,
    fuzz(newInterval)
  );

  return {
    state: "review",
    due_at: addDays(new Date(), newInterval),
    ease_factor: newEase,
    interval_days: newInterval,
    repetitions: card.repetitions + 1,
    lapse_count: newLapseCount,
    learning_step_index: 0,
  };
}

// ---------------------------------------------------------------------------
// Public: Utility checks
// ---------------------------------------------------------------------------

/**
 * Returns true if a card has exceeded the leech threshold.
 * Used to show leech warnings in the UI before submitting the review.
 */
export function isLeech(card: StudyCard, settings: DeckStudySettings): boolean {
  return card.lapse_count >= settings.leech_threshold;
}

/**
 * Returns true if a card should be buried (daily limit exceeded).
 * The actual burying happens in the Postgres get_session_queue function;
 * this utility is for client-side reasoning.
 */
export function shouldBury(card: StudyCard, reviewsToday: number, limit: number): boolean {
  if (card.state !== "review") return false;
  return reviewsToday >= limit;
}

/**
 * Returns a human-readable description of when a card is next due.
 * Used in the session UI and card list views.
 */
export function formatDueIn(
  dueAt: Date,
  t?: (key: string, values?: Record<string, number | string>) => string
): string {
  const now = new Date();
  const diffMs = dueAt.getTime() - now.getTime();

  if (diffMs <= 0) {
    return t ? t("study.session.due_now") : "Due now";
  }

  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 60) {
    return t ? t("study.session.due_minutes", { count: diffMin }) : `${diffMin}m`;
  }

  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) {
    return t ? t("study.session.due_hours", { count: diffHr }) : `${diffHr}h`;
  }

  const diffDays = Math.floor(diffHr / 24);
  if (diffDays === 1) {
    return t ? t("study.session.tomorrow") : "Tomorrow";
  }
  if (diffDays < 30) {
    return t ? t("study.session.due_days", { count: diffDays }) : `${diffDays}d`;
  }

  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) {
    return t ? t("study.session.due_months", { count: diffMonths }) : `${diffMonths}mo`;
  }

  const diffYears = Math.floor(diffMonths / 12);
  return t ? t("study.session.due_years", { count: diffYears }) : `${diffYears}y`;
}

// ---------------------------------------------------------------------------
// Private: Helpers
// ---------------------------------------------------------------------------

/**
 * Build a passthrough result for cards that shouldn't change state.
 */
function buildResult(card: StudyCard, state: CardStudyState): SchedulingResult {
  return {
    state,
    due_at: new Date(card.due_at),
    ease_factor: card.ease_factor,
    interval_days: card.interval_days,
    repetitions: card.repetitions,
    lapse_count: card.lapse_count,
    learning_step_index: card.learning_step_index,
  };
}

/**
 * Parse a step string like "1m" (minutes), "10m", "1d" (days) into minutes.
 * Supported units: m (minutes), d (days), h (hours)
 */
export function parseStep(step: string): number {
  const match = step.match(/^(\d+(?:\.\d+)?)(m|h|d)$/i);
  if (!match) return 10; // fallback to 10 minutes

  const value = parseFloat(match[1]);
  const unit = match[2].toLowerCase();

  if (unit === "m") return value;
  if (unit === "h") return value * 60;
  if (unit === "d") return value * 60 * 24;
  return 10;
}

/**
 * Apply random interval fuzz (±5–10%) to prevent card clumping on a single day.
 * Never returns less than 1 day for review cards.
 */
function fuzz(interval: number): number {
  if (interval < 1) return interval;
  const factor = FUZZ_MIN + Math.random() * (FUZZ_MAX - FUZZ_MIN);
  return Math.max(1, Math.round(interval * factor));
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + Math.round(days));
  result.setUTCHours(0, 0, 0, 0); // normalize to midnight UTC
  return result;
}
