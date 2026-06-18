import type { Locale } from "@/lib/i18n/config";

export type Plan = "free" | "pro";
export type SubscriptionStatus = "active" | "canceled" | "past_due" | "trialing" | "inactive";
export type CardType = "basic" | "cloze" | "mixed";
export type Difficulty = "beginner" | "intermediate" | "advanced";
export type GenerationStatus = "pending" | "processing" | "completed" | "failed";

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  is_admin: boolean;
  avatar_type: 'google' | 'custom';
  custom_avatar_path: string | null;
  preferred_language?: Locale | null;
  created_at: string;
  updated_at: string;
}

export interface Subscription {
  id: string;
  user_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  paddle_customer_id: string | null;
  paddle_subscription_id: string | null;
  billing_provider: 'stripe' | 'paddle';
  status: SubscriptionStatus;
  plan: Plan;
  current_period_end: string | null;
  created_at: string;
  updated_at: string;
}

export interface Deck {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  language: string;
  card_type: CardType;
  difficulty: Difficulty;
  created_at: string;
  updated_at: string;
  flashcard_count?: number;
}

export interface Flashcard {
  id: string;
  deck_id: string;
  front: string;
  back: string;
  card_type: CardType;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface AiGeneration {
  id: string;
  user_id: string;
  prompt: string;
  deck_id: string | null;
  card_count: number;
  tokens_used: number;
  status: GenerationStatus;
  error_message: string | null;
  created_at: string;
}

export interface GeneratedCard {
  front: string;
  back: string;
  card_type?: CardType;
}

export interface GeneratedDeck {
  deckName: string;
  description?: string;
  cards: GeneratedCard[];
}

export interface DashboardStats {
  totalDecks: number;
  totalFlashcards: number;
  monthlyGenerations: number;
  generationLimit: number;
  plan: Plan;
  subscriptionStatus: SubscriptionStatus;
}

export const PLAN_LIMITS = {
  free: {
    monthlyGenerations: 3,
    maxCardsPerDeck: 50,
    apkgExport: false,
    // Study Mode v2
    studyDecks: 3,
    mediaStorageMb: 0,       // free users: URL-only, no file uploads
    apkgImport: false,
    audioCards: false,
    fullStats: false,
    fsrs: false,
  },
  pro: {
    monthlyGenerations: Infinity,
    maxCardsPerDeck: 500,
    apkgExport: true,
    // Study Mode v2
    studyDecks: Infinity,
    mediaStorageMb: 2048,    // 2 GB
    apkgImport: true,
    audioCards: true,
    fullStats: true,
    fsrs: true,
  },
} as const;

// ---------------------------------------------------------------------------
// Study Mode v2 Types
// ---------------------------------------------------------------------------

export type CardStudyState = "new" | "learn" | "review" | "suspended" | "buried" | "leech";
export type ConfidenceRating = "again" | "hard" | "good" | "easy";
export type ImportSource = "generated_deck" | "csv" | "apkg" | "manual";
export type ImportStatus = "pending" | "processing" | "completed" | "failed" | "partial";
export type MediaType = "image" | "audio" | "video" | "gif" | "document";

export interface StudyDeck {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  emoji: string | null;
  color: string;
  is_archived: boolean;
  card_count: number;
  icon_type: "emoji" | "image";
  custom_icon_path: string | null;
  created_at: string;
  updated_at: string;
  last_studied_at: string | null;
  // Joined fields (not in DB — computed by queries)
  due_count?: number;
  new_count?: number;
}

export interface DeckStudySettings {
  id: string;
  study_deck_id: string;
  new_cards_per_day: number;
  max_reviews_per_day: number;
  learning_steps: string[];        // e.g. ["1m", "10m"]
  graduating_interval: number;     // days
  easy_interval: number;           // days
  relearning_steps: string[];
  leech_threshold: number;
  leech_action: "suspend" | "tag_only";
  maximum_interval: number;        // days
  ease_minimum: number;
  new_card_order: "due" | "random";
  show_confidence_bar: boolean;
  show_card_preview: boolean;
  created_at: string;
  updated_at: string;
}

export interface StudyCard {
  id: string;
  study_deck_id: string;
  user_id: string;
  // Content
  front: string;
  back: string;
  card_type: CardType;
  media_refs: string[];
  // Source tracking
  source_flashcard_id: string | null;
  source_deck_id: string | null;
  import_id: string | null;
  // Scheduling state
  state: CardStudyState;
  due_at: string;
  last_reviewed_at: string | null;
  // SM-2 fields
  ease_factor: number;
  interval_days: number;
  repetitions: number;
  lapse_count: number;
  learning_step_index: number;
  // FSRS fields (null until Phase 3 migration)
  fsrs_stability: number | null;
  fsrs_difficulty: number | null;
  fsrs_retrievability: number | null;
  // Metadata
  tags: string[];
  is_flagged: boolean;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface ReviewLog {
  id: string;
  study_card_id: string;
  study_deck_id: string;
  user_id: string;
  session_id: string | null;
  confidence_pct: number;       // 0–100, raw value from confidence bar
  rating: ConfidenceRating;     // bucket derived from confidence_pct
  state_before: CardStudyState;
  state_after: CardStudyState;
  interval_before: number;
  interval_after: number;
  ease_before: number | null;
  ease_after: number | null;
  review_duration_ms: number | null;
  reviewed_at: string;
}

export interface StudySession {
  id: string;
  study_deck_id: string;
  user_id: string;
  started_at: string;
  ended_at: string | null;
  duration_ms: number | null;
  cards_studied: number;
  cards_again: number;
  cards_hard: number;
  cards_good: number;
  cards_easy: number;
  new_cards_seen: number;
  retention_pct: number | null;
  created_at: string;
}

export interface Import {
  id: string;
  user_id: string;
  study_deck_id: string;
  source_type: ImportSource;
  source_deck_id: string | null;
  source_file_name: string | null;
  source_file_url: string | null;
  status: ImportStatus;
  total_cards: number;
  imported_cards: number;
  skipped_cards: number;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface MediaAsset {
  id: string;
  user_id: string;
  storage_path: string;
  public_url: string;
  file_name: string;
  media_type: MediaType;
  mime_type: string;
  size_bytes: number;
  width_px: number | null;
  height_px: number | null;
  duration_ms: number | null;
  checksum: string | null;
  created_at: string;
}

export interface UserStudyStats {
  id: string;
  user_id: string;
  stat_date: string;             // ISO date string "YYYY-MM-DD"
  study_deck_id: string | null;  // null = global (all decks)
  cards_reviewed: number;
  cards_again: number;
  cards_hard: number;
  cards_good: number;
  cards_easy: number;
  new_cards_seen: number;
  study_time_ms: number;
  retention_pct: number | null;
}

// Returned by the get_session_queue Postgres RPC
export interface SessionQueueItem {
  card_id: string;
  card_state: CardStudyState;
}

// Result of the SM-2 scheduling engine
export interface SchedulingResult {
  state: CardStudyState;
  due_at: Date;
  ease_factor: number;
  interval_days: number;
  repetitions: number;
  lapse_count: number;
  learning_step_index: number;
}

// Due counts returned by get_study_deck_due_counts RPC
export interface DeckDueCounts {
  new_count: number;
  learn_count: number;
  review_count: number;
  total_due: number;
}

export interface SavedPrompt {
  id: string;
  user_id: string;
  name: string;
  title?: string;
  content: string;
  is_favorite: boolean;
  is_default: boolean;
  is_system?: boolean;
  created_at: string;
  updated_at: string;
}
