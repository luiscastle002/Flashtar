/**
 * SM-2 Scheduling Engine — Unit Tests
 *
 * Tests all scheduling paths without any database or network calls.
 * Run with: npx jest src/lib/scheduling/sm2.test.ts
 */

import {
  confidenceToRating,
  scheduleCard,
  isLeech,
  parseStep,
  formatDueIn,
} from "./sm2";
import type { StudyCard, DeckStudySettings } from "@/types";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const baseSettings: DeckStudySettings = {
  id: "settings-1",
  study_deck_id: "deck-1",
  new_cards_per_day: 20,
  max_reviews_per_day: 200,
  learning_steps: ["1m", "10m"],
  graduating_interval: 1,
  easy_interval: 4,
  relearning_steps: ["10m"],
  leech_threshold: 8,
  leech_action: "suspend",
  maximum_interval: 36500,
  ease_minimum: 1.3,
  new_card_order: "due",
  show_confidence_bar: true,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

function makeNewCard(overrides: Partial<StudyCard> = {}): StudyCard {
  return {
    id: "card-1",
    study_deck_id: "deck-1",
    user_id: "user-1",
    front: "Front",
    back: "Back",
    card_type: "basic",
    media_refs: [],
    source_flashcard_id: null,
    source_deck_id: null,
    import_id: null,
    state: "new",
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
    position: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// confidenceToRating
// ---------------------------------------------------------------------------

describe("confidenceToRating", () => {
  it("maps 0 to again", () => expect(confidenceToRating(0)).toBe("again"));
  it("maps 24 to again", () => expect(confidenceToRating(24)).toBe("again"));
  it("maps 25 to hard", () => expect(confidenceToRating(25)).toBe("hard"));
  it("maps 49 to hard", () => expect(confidenceToRating(49)).toBe("hard"));
  it("maps 50 to good", () => expect(confidenceToRating(50)).toBe("good"));
  it("maps 74 to good", () => expect(confidenceToRating(74)).toBe("good"));
  it("maps 75 to easy", () => expect(confidenceToRating(75)).toBe("easy"));
  it("maps 100 to easy", () => expect(confidenceToRating(100)).toBe("easy"));
});

// ---------------------------------------------------------------------------
// parseStep
// ---------------------------------------------------------------------------

describe("parseStep", () => {
  it("parses minutes", () => expect(parseStep("1m")).toBe(1));
  it("parses 10 minutes", () => expect(parseStep("10m")).toBe(10));
  it("parses hours", () => expect(parseStep("2h")).toBe(120));
  it("parses days", () => expect(parseStep("1d")).toBe(1440));
  it("falls back on invalid input", () => expect(parseStep("xyz")).toBe(10));
});

// ---------------------------------------------------------------------------
// Learning phase — new card
// ---------------------------------------------------------------------------

describe("scheduleCard — learning phase (new card)", () => {
  it("Again on step 0 → stays learn at step 0, due in 1m", () => {
    const card = makeNewCard({ state: "new" });
    const result = scheduleCard(card, "again", baseSettings);
    expect(result.state).toBe("learn");
    expect(result.learning_step_index).toBe(0);
    expect(result.repetitions).toBe(0);
    // due_at should be about 1 minute from now
    const diffMs = result.due_at.getTime() - Date.now();
    expect(diffMs).toBeGreaterThan(50_000);  // at least 50s
    expect(diffMs).toBeLessThan(90_000);     // at most 90s
  });

  it("Good on step 0 → advances to step 1 (10m), stays learn", () => {
    const card = makeNewCard({ state: "learn", learning_step_index: 0 });
    const result = scheduleCard(card, "good", baseSettings);
    expect(result.state).toBe("learn");
    expect(result.learning_step_index).toBe(1);
    const diffMs = result.due_at.getTime() - Date.now();
    expect(diffMs).toBeGreaterThan(9 * 60 * 1000);   // > 9min
    expect(diffMs).toBeLessThan(11 * 60 * 1000);     // < 11min
  });

  it("Hard on step 0 → stays on step 0 (same step)", () => {
    const card = makeNewCard({ state: "learn", learning_step_index: 0 });
    const result = scheduleCard(card, "hard", baseSettings);
    expect(result.state).toBe("learn");
    expect(result.learning_step_index).toBe(0);
  });

  it("Good on last step → graduates to review with graduating_interval", () => {
    const card = makeNewCard({
      state: "learn",
      learning_step_index: 1, // last step of ["1m","10m"]
    });
    const result = scheduleCard(card, "good", baseSettings);
    expect(result.state).toBe("review");
    expect(result.interval_days).toBeGreaterThanOrEqual(1);
    expect(result.repetitions).toBe(1);
  });

  it("Easy on new card → graduates immediately to easy_interval", () => {
    const card = makeNewCard({ state: "new" });
    const result = scheduleCard(card, "easy", baseSettings);
    expect(result.state).toBe("review");
    // easy_interval is 4 days — fuzzing can make it 3–5
    expect(result.interval_days).toBeGreaterThanOrEqual(3);
    expect(result.interval_days).toBeLessThanOrEqual(5);
    expect(result.repetitions).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Review phase
// ---------------------------------------------------------------------------

describe("scheduleCard — review phase", () => {
  it("Good → interval grows by ease_factor (EF 2.5)", () => {
    const card = makeNewCard({
      state: "review",
      ease_factor: 2.5,
      interval_days: 10,
      repetitions: 3,
    });
    const result = scheduleCard(card, "good", baseSettings);
    expect(result.state).toBe("review");
    // interval × 2.5 = 25, with fuzz ±5%: 23–27
    expect(result.interval_days).toBeGreaterThanOrEqual(23);
    expect(result.interval_days).toBeLessThanOrEqual(27);
    expect(result.ease_factor).toBe(2.5); // good doesn't change EF
  });

  it("Hard → interval × 1.2, ease decreases by 0.15", () => {
    const card = makeNewCard({
      state: "review",
      ease_factor: 2.5,
      interval_days: 10,
      repetitions: 3,
    });
    const result = scheduleCard(card, "hard", baseSettings);
    expect(result.state).toBe("review");
    // interval × 1.2 = 12, with fuzz: 11–13
    expect(result.interval_days).toBeGreaterThanOrEqual(11);
    expect(result.interval_days).toBeLessThanOrEqual(13);
    expect(result.ease_factor).toBeCloseTo(2.35, 1); // 2.5 - 0.15
  });

  it("Easy → interval × EF × 1.3, ease increases by 0.15", () => {
    const card = makeNewCard({
      state: "review",
      ease_factor: 2.5,
      interval_days: 10,
      repetitions: 3,
    });
    const result = scheduleCard(card, "easy", baseSettings);
    expect(result.state).toBe("review");
    // interval × 2.5 × 1.3 = 32.5, with fuzz: 30–35
    expect(result.interval_days).toBeGreaterThanOrEqual(30);
    expect(result.interval_days).toBeLessThanOrEqual(36);
    expect(result.ease_factor).toBeCloseTo(2.65, 1); // 2.5 + 0.15
  });

  it("Again → enters relearning, lapse_count increments", () => {
    const card = makeNewCard({
      state: "review",
      ease_factor: 2.5,
      interval_days: 30,
      repetitions: 5,
      lapse_count: 2,
    });
    const result = scheduleCard(card, "again", baseSettings);
    expect(result.state).toBe("learn"); // not leech (threshold = 8)
    expect(result.lapse_count).toBe(3);
    expect(result.interval_days).toBe(0);
    expect(result.repetitions).toBe(0);
    expect(result.ease_factor).toBeCloseTo(2.3, 1); // 2.5 - 0.20
  });

  it("Again when lapse_count reaches threshold → state = leech", () => {
    const card = makeNewCard({
      state: "review",
      ease_factor: 1.5,
      interval_days: 5,
      lapse_count: 7, // one below threshold of 8
    });
    const result = scheduleCard(card, "again", baseSettings);
    expect(result.state).toBe("leech");
    expect(result.lapse_count).toBe(8);
  });

  it("Ease factor never drops below ease_minimum (1.3)", () => {
    const card = makeNewCard({
      state: "review",
      ease_factor: 1.35, // very close to minimum
      interval_days: 5,
      lapse_count: 0,
    });
    const result = scheduleCard(card, "again", baseSettings);
    expect(result.ease_factor).toBeGreaterThanOrEqual(1.3);
  });

  it("Interval never exceeds maximum_interval", () => {
    const card = makeNewCard({
      state: "review",
      ease_factor: 3.0,
      interval_days: 35000, // massive interval
      repetitions: 100,
    });
    const result = scheduleCard(card, "easy", baseSettings);
    expect(result.interval_days).toBeLessThanOrEqual(baseSettings.maximum_interval);
  });
});

// ---------------------------------------------------------------------------
// Leech detection
// ---------------------------------------------------------------------------

describe("isLeech", () => {
  it("returns false below threshold", () => {
    const card = makeNewCard({ lapse_count: 7 });
    expect(isLeech(card, baseSettings)).toBe(false);
  });

  it("returns true at threshold", () => {
    const card = makeNewCard({ lapse_count: 8 });
    expect(isLeech(card, baseSettings)).toBe(true);
  });

  it("returns true above threshold", () => {
    const card = makeNewCard({ lapse_count: 15 });
    expect(isLeech(card, baseSettings)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Interval fuzzing
// ---------------------------------------------------------------------------

describe("interval fuzzing", () => {
  it("produces varied intervals across multiple runs (not always the same)", () => {
    const card = makeNewCard({ state: "review", ease_factor: 2.5, interval_days: 100 });
    const results = Array.from({ length: 20 }, () =>
      scheduleCard(card, "good", baseSettings).interval_days
    );
    const unique = new Set(results);
    // With fuzz, across 20 runs we should see at least 2 different values
    expect(unique.size).toBeGreaterThan(1);
  });

  it("stays within ±10% of base interval", () => {
    const card = makeNewCard({ state: "review", ease_factor: 2.5, interval_days: 100 });
    for (let i = 0; i < 50; i++) {
      const result = scheduleCard(card, "good", baseSettings);
      // good: base = 100 × 2.5 = 250, fuzz ±10%: 225–275
      expect(result.interval_days).toBeGreaterThanOrEqual(225);
      expect(result.interval_days).toBeLessThanOrEqual(275);
    }
  });
});

// ---------------------------------------------------------------------------
// formatDueIn
// ---------------------------------------------------------------------------

describe("formatDueIn", () => {
  it('returns "Due now" for past dates', () => {
    const past = new Date(Date.now() - 10_000);
    expect(formatDueIn(past)).toBe("Due now");
  });

  it("returns minutes for < 1 hour", () => {
    const future = new Date(Date.now() + 30 * 60 * 1000);
    expect(formatDueIn(future)).toBe("30m");
  });

  it("returns hours for < 24 hours", () => {
    const future = new Date(Date.now() + 3 * 60 * 60 * 1000);
    expect(formatDueIn(future)).toBe("3h");
  });

  it("returns days for < 30 days", () => {
    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    expect(formatDueIn(future)).toBe("7d");
  });

  it('returns "Tomorrow" for ~1 day', () => {
    const future = new Date(Date.now() + 26 * 60 * 60 * 1000);
    expect(formatDueIn(future)).toBe("Tomorrow");
  });
});
