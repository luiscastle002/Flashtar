# Flashtar

Flashtar is an AI-powered SaaS platform that generates, manages, edits, imports, exports, and studies flashcards using spaced repetition and complete multilingual support. 

Generate high-quality Anki decks from simple prompts, files, or URLs, customize settings, study using the SM-2 scheduling queue, and download files directly for Anki.

---

## Table of Contents
1. [Overview](#overview)
2. [Core Features](#core-features)
3. [Technology Stack](#technology-stack)
4. [Internationalization (i18n) Architecture](#internationalization-i18n-architecture)
5. [Deterministic i18n Principles](#deterministic-i18n-principles)
6. [Database Schemas](#database-schemas)
7. [Environment Variables](#environment-variables)
8. [Local Development](#local-development)
9. [Development & QA Workflow](#development--qa-workflow)
10. [Deployment & Administration](#deployment--administration)

---

## Overview

Flashtar maximizes learning efficiency by allowing students, language learners, and professionals to convert knowledge into highly effective flashcards with minimal manual effort. Spaced repetition scheduler algorithms ensure information is reviewed at the optimal time to guarantee retention.

---

## Core Features

### AI Generation Workflow
- **Prompt Generation**: Input a learning objective (e.g. *"Create a deck about React Server Components"*).
- **File Import**: Upload files (PDF, Word, Excel, PowerPoint, Text, and Images) to extract and convert text.
- **URL Import**: Input article URLs, documentation pages, or YouTube video links to ingest.
- **Configuration Panel**: Customize difficulty presets (Beginner, Intermediate, Advanced), choose output languages, and save custom prompt templates.

### Deck & Card Management
- **Generated Decks**: Review AI-generated cards, delete duplicates, or edit contents.
- **Study Decks**: Snapshot flashcards into personalized study decks with accent colors, emoji settings, or custom avatar image uploads.
- **CSV & APKG Import/Export**: Free users can export to CSV. Pro subscribers can export as `.apkg` files compiled using WebAssembly compilers for direct Anki import.

### Spaced Repetition Study Loop
- **SM-2 Scheduler**: Custom learning steps, graduating intervals, and relearning steps.
- **Confidence Rating**: Interface supporting both a gradient Confidence Bar (0-100) or classic Again/Hard/Good/Easy rating buttons.
- **Card States**: Dynamic queueing across states: `New`, `Learning`, `Review`, `Suspended`, `Buried`, and `Leech`.
- **Session Stats**: Finish sessions with retention score cards, rating breakdowns, time spent counters, and quick links to historical stats.

### Platform Administration & Billing
- **Admin Dashboard**: Visual grids for total users, decks, AI tokens consumed, active subscriptions, and generation logs.
- **Sub subscription management**: Integrated Paddle and Stripe billing gateways supporting checkout sessions, customer billing portals, and database webhook synchronization.

---

## Technology Stack

- **Frontend**: Next.js 15 (App Router), React, TypeScript, Tailwind CSS, shadcn/ui.
- **Backend & Database**: Supabase, PostgreSQL, PostgreSQL Row-Level Security (RLS).
- **Internationalization**: `next-intl` (cookie-based language routing and persistence).
- **Payment Processor**: Stripe (checkout, portal, webhook synchronization) & Paddle (recurring subscription management).
- **AI Core**: OpenAI API (Structured Outputs schema validation).

---

## Internationalization (i18n) Architecture

Flashtar utilizes `next-intl` for routing, language preferences persistence, and runtime lookups.

### Supported Locales
- English (`en`)
- Spanish (`es`)
- Brazilian Portuguese (`pt`)
- Japanese (`ja`)

### Directory Structure
```text
src/
└── messages/
    ├── en.json    # English Source of Truth
    ├── es.json    # Spanish translations
    ├── pt.json    # Portuguese translations
    └── ja.json    # Japanese translations
```

### Type-Safe Translation Keys
All translation files match the TypeScript interface schema defined in `global.d.ts` under `IntlMessages`. This enforces type-safe compiler errors when passing invalid keys to hooks like `useTranslations`.

---

## Deterministic i18n Principles

To avoid accidental English fallbacks, all developers must adhere to the following principles:

1. **No Hardcoded UI Strings**: All labels, prompts, titles, placeholders, and tooltips must render through `t("key")`.
2. **ICU Pluralization**: Never calculate plural values manually in code. Use the standard next-intl ICU syntax in translation files:
   ```json
   "cards_plural": "{count, plural, =1 {# card} other {# cards}}"
   ```
3. **No Direct Database Enum Rendering**: Card scheduling states (`new`, `learn`, `review`), difficulty presets, or billing plans must map through dictionary keys:
   ```typescript
   t(`state.${card.state}`)
   ```
4. **Localized Duration Suffixes**: Never concatenate time strings manually (e.g., `"${minutes}m"`). Use locale-aware parameters:
   ```json
   "duration_min_sec": "{minutes}m {seconds}s"
   ```
5. **Dynamic File Sizes**: File upload limits and sizes must format dynamically using translation keys:
   ```json
   "file_size": { "bytes": "Bytes", "kb": "KB", "mb": "MB", "gb": "GB" }
   ```
6. **Centralized Error Translation**: Database constraint failures, input validations, and API rejections must return structured error keys (`errors.generate.failed`) and map through the `translateError` helper.
7. **Deterministic Relative Time Rendering**: All relative time formatting must use a globally provided reference time (`now`) to avoid client-server hydration mismatch issues. Define a request-time `now={new Date()}` Date object in the root layout `<NextIntlClientProvider>` to be shared across all descendant components.

---

## Database Schemas

### `profiles`
Tracks user accounts, basic info, administrative flags, and preferred locales.
```sql
id UUID PRIMARY KEY REFERENCES auth.users
email TEXT UNIQUE
full_name TEXT
avatar_url TEXT
is_admin BOOLEAN DEFAULT false
avatar_type TEXT DEFAULT 'google' -- 'google' | 'custom'
custom_avatar_path TEXT
preferred_language TEXT          -- Locale code ('en' | 'es' | etc.)
created_at TIMESTAMP WITH TIME ZONE
updated_at TIMESTAMP WITH TIME ZONE
```

### `subscriptions`
Maintains billing plans synchronized via Stripe and Paddle webhooks.
```sql
id UUID PRIMARY KEY
user_id UUID REFERENCES profiles(id)
stripe_customer_id TEXT
stripe_subscription_id TEXT
paddle_customer_id TEXT
paddle_subscription_id TEXT
billing_provider TEXT             -- 'stripe' | 'paddle'
status TEXT                       -- 'active' | 'canceled' | etc.
plan TEXT                         -- 'free' | 'pro'
current_period_end TIMESTAMP WITH TIME ZONE
created_at TIMESTAMP WITH TIME ZONE
updated_at TIMESTAMP WITH TIME ZONE
```

### `decks`
Stores AI-generated parent decks.
```sql
id UUID PRIMARY KEY
user_id UUID REFERENCES profiles(id)
name TEXT NOT NULL
description TEXT
language TEXT DEFAULT 'English'
card_type TEXT DEFAULT 'basic'    -- 'basic' | 'cloze' | 'mixed'
difficulty TEXT DEFAULT 'intermediate'
created_at TIMESTAMP WITH TIME ZONE
updated_at TIMESTAMP WITH TIME ZONE
```

### `flashcards`
Contains parent cards generated by the AI engine.
```sql
id UUID PRIMARY KEY
deck_id UUID REFERENCES decks(id) ON DELETE CASCADE
front TEXT NOT NULL
back TEXT NOT NULL
card_type TEXT DEFAULT 'basic'
position INTEGER DEFAULT 0
created_at TIMESTAMP WITH TIME ZONE
updated_at TIMESTAMP WITH TIME ZONE
```

### `study_decks`
Represents study folders configured by users for spaced repetition.
```sql
id UUID PRIMARY KEY
user_id UUID REFERENCES profiles(id)
name TEXT NOT NULL
description TEXT
emoji TEXT DEFAULT '📚'
color TEXT DEFAULT '#6366f1'
is_archived BOOLEAN DEFAULT false
icon_type TEXT DEFAULT 'emoji'     -- 'emoji' | 'image'
custom_icon_path TEXT
created_at TIMESTAMP WITH TIME ZONE
updated_at TIMESTAMP WITH TIME ZONE
```

### `deck_study_settings`
Configures daily review limits and SM-2 interval steps.
```sql
id UUID PRIMARY KEY
study_deck_id UUID REFERENCES study_decks(id) ON DELETE CASCADE
new_cards_per_day INTEGER DEFAULT 20
max_reviews_per_day INTEGER DEFAULT 200
learning_steps TEXT[] DEFAULT ARRAY['1m', '10m']
graduating_interval INTEGER DEFAULT 1
easy_interval INTEGER DEFAULT 4
relearning_steps TEXT[] DEFAULT ARRAY['10m']
leech_threshold INTEGER DEFAULT 8
leech_action TEXT DEFAULT 'suspend'
maximum_interval INTEGER DEFAULT 36500
ease_minimum INTEGER DEFAULT 1300
new_card_order TEXT DEFAULT 'due'
show_confidence_bar BOOLEAN DEFAULT true
created_at TIMESTAMP WITH TIME ZONE
updated_at TIMESTAMP WITH TIME ZONE
```

### `study_cards`
Maintains individual learning schedules for flashcards snapshot into study folders.
```sql
id UUID PRIMARY KEY
study_deck_id UUID REFERENCES study_decks(id) ON DELETE CASCADE
user_id UUID REFERENCES profiles(id)
front TEXT NOT NULL
back TEXT NOT NULL
card_type TEXT DEFAULT 'basic'
media_refs TEXT[]
source_flashcard_id UUID REFERENCES flashcards(id)
source_deck_id UUID REFERENCES decks(id)
import_id UUID
state TEXT DEFAULT 'new'            -- 'new' | 'learn' | 'review' | etc.
due_at TIMESTAMP WITH TIME ZONE
last_reviewed_at TIMESTAMP WITH TIME ZONE
ease_factor INTEGER DEFAULT 2500
interval_days INTEGER DEFAULT 0
repetitions INTEGER DEFAULT 0
lapse_count INTEGER DEFAULT 0
learning_step_index INTEGER DEFAULT 0
tags TEXT[]
is_flagged BOOLEAN DEFAULT false
position INTEGER DEFAULT 0
created_at TIMESTAMP WITH TIME ZONE
updated_at TIMESTAMP WITH TIME ZONE
```

### `review_logs`
Logs detailed historical results of card ratings for analysis.
```sql
id UUID PRIMARY KEY
study_card_id UUID REFERENCES study_cards(id) ON DELETE CASCADE
study_deck_id UUID REFERENCES study_decks(id) ON DELETE CASCADE
user_id UUID REFERENCES profiles(id)
session_id UUID
confidence_pct INTEGER NOT NULL
rating TEXT NOT NULL               -- 'again' | 'hard' | 'good' | 'easy'
state_before TEXT NOT NULL
state_after TEXT NOT NULL
interval_before INTEGER NOT NULL
interval_after INTEGER NOT NULL
ease_before INTEGER
ease_after INTEGER
review_duration_ms INTEGER
reviewed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
```

---

## Environment Variables

Configure a `.env.local` file inside the root directory:
```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key

# OpenAI
OPENAI_API_KEY=your-openai-api-key

# Stripe (Payments)
STRIPE_SECRET_KEY=your-stripe-secret-key
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=your-stripe-publishable-key
STRIPE_WEBHOOK_SECRET=your-stripe-webhook-secret
NEXT_PUBLIC_STRIPE_PRICE_ID_PRO=your-pro-plan-stripe-price-id

# Paddle (Alternative Payments)
PADDLE_CLIENT_TOKEN=your-paddle-client-token
PADDLE_API_KEY=your-paddle-api-key
PADDLE_WEBHOOK_SECRET=your-paddle-webhook-secret
NEXT_PUBLIC_PADDLE_PRICE_ID_PRO=your-pro-plan-paddle-price-id

# App Domain URL
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Admin Access Controls
ADMIN_EMAILS=admin@yourdomain.com,superuser@yourdomain.com
```

---

## Local Development

### 1. Pre-requisites
Make sure you have Node.js (v18+) and npm installed.

### 2. Installation
Install project dependencies:
```bash
npm install
```

### 3. Database Initializer
Ensure the Supabase CLI is installed, login, and start the local environment:
```bash
npx supabase start
npx supabase db reset
```

### 4. Running Dev Server
Run the local Next.js dev server with Turbopack enabled:
```bash
npm run dev
```
Navigate to `http://localhost:3000` to review the application.

---

## Development & QA Workflow

When implementing new modules or refactoring existing ones:

1. **Key Registration**: Always define new keys in `en.json` first.
2. **Locale Synchronization**: Instantly sync Spanish (`es.json`), Portuguese (`pt.json`), and Japanese (`ja.json`) translations.
3. **Plural check**: Write dynamic text parameters using standard ICU templates.
4. **Typecheck verification**: Compile types using `npm run typecheck` to verify no invalid keys exist.
5. **ESLint Cleanliness**: Confirm code complies with standard guidelines using `npm run lint`.
6. **Mobile Responsiveness**: Confirm layout does not break on smaller resolutions, especially with double-byte character expansions in Japanese.
7. **Production Build Compilation**: Always confirm Next.js successfully compiles by executing `npm run build`.

---

## Deployment & Administration

Flashtar is deployed directly to **Vercel**. 

- Set up environmental secrets in Vercel.
- Configure webhooks pointing to your deployment endpoints (`/api/webhooks/stripe` and `/api/webhooks/paddle`).
- Subscriptions are handled dynamically; the database status is automatically updated when a user upgrades via the payment portal.
- Admin dashboard is available at `/admin` for users flagged with `is_admin = true` inside the `profiles` table.
