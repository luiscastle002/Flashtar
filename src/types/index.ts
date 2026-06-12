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
  },
  pro: {
    monthlyGenerations: Infinity,
    maxCardsPerDeck: 500,
    apkgExport: true,
  },
} as const;
