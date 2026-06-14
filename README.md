# Flashtar

AI-powered flashcard and Anki deck generation platform.

Generate complete Anki decks from simple prompts, edit flashcards, organize study materials, and export directly to Anki.

---

## Overview

Flashtar is a SaaS application that allows users to create high-quality flashcards using AI.

Users can:

* Generate decks from text prompts
* Edit flashcards manually
* Organize decks and folders
* Export decks to Anki
* Manage subscriptions
* Track AI usage

---

## Features

### AI Deck Generation

Generate complete flashcard decks from prompts such as:

> Create a deck of 50 flashcards about JavaScript Closures.

Supported card formats:

* Basic Front / Back
* Cloze Deletions
* Mixed Decks

### Authentication

* Email & Password
* Google OAuth
* Password Reset
* Protected Routes

### Deck Management

* Create Decks
* Edit Decks
* Delete Decks
* Duplicate Decks
* Search Decks
* Organize Content

### Flashcard Editor

* Rich Text Editing
* Cloze Support
* Drag & Drop Reordering
* Bulk Editing

### Export Options

* Anki (.apkg)
* CSV

### Subscription Management

* Free Plan
* Pro Plan
* Stripe Billing
* Customer Portal

---

## Tech Stack

### Frontend

* Next.js 15
* React
* TypeScript
* Tailwind CSS
* shadcn/ui

### Backend

* Supabase
* PostgreSQL
* Supabase Auth

### Payments

* Stripe Checkout
* Stripe Customer Portal
* Stripe Webhooks

### AI

* OpenAI API
* Structured Outputs
* Streaming Responses

### Deployment

* Vercel

---

## Project Structure

```text
src/
│
├── app/
│   ├── (auth)/
│   ├── dashboard/
│   ├── decks/
│   ├── generate/
│   ├── pricing/
│   └── api/
│
├── components/
│   ├── ui/
│   ├── dashboard/
│   ├── decks/
│   └── shared/
│
├── lib/
│   ├── supabase/
│   ├── stripe/
│   ├── openai/
│   └── utils/
│
├── hooks/
│
├── types/
│
├── actions/
│
└── middleware.ts
```

---

## Database Schema

### profiles

```sql
id UUID PRIMARY KEY
email TEXT
full_name TEXT
avatar_url TEXT
created_at TIMESTAMP
```

### subscriptions

```sql
id UUID PRIMARY KEY
user_id UUID
stripe_customer_id TEXT
stripe_subscription_id TEXT
status TEXT
plan TEXT
created_at TIMESTAMP
```

### decks

```sql
id UUID PRIMARY KEY
user_id UUID
name TEXT
description TEXT
created_at TIMESTAMP
updated_at TIMESTAMP
```

### flashcards

```sql
id UUID PRIMARY KEY
deck_id UUID
front TEXT
back TEXT
position INTEGER
created_at TIMESTAMP
```

### ai_generations

```sql
id UUID PRIMARY KEY
user_id UUID
prompt TEXT
deck_id UUID
tokens_used INTEGER
created_at TIMESTAMP
```

---

## Environment Variables

Create a `.env.local` file:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# OpenAI
OPENAI_API_KEY=

# Stripe
STRIPE_SECRET_KEY=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
STRIPE_WEBHOOK_SECRET=

# App
NEXT_PUBLIC_APP_URL=
```

---

## Local Development

Install dependencies:

```bash
npm install
```

Start development server:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

---

## User Flow

1. User signs up.
2. User enters a deck generation prompt.
3. OpenAI generates flashcards.
4. Deck is saved to Supabase.
5. User edits cards if needed.
6. User exports deck to Anki.
7. Subscription limits are enforced via Stripe.

---

## Pricing Plans

### Free

* 3 AI generations per month
* Up to 50 cards per deck
* Deck editing
* CSV export

### Pro

* Unlimited generations
* Unlimited deck size
* Priority generation
* APKG export
* Advanced AI options

---

## Security

Implemented:

* Row Level Security (RLS)
* Protected API Routes
* Input Validation
* Rate Limiting
* Secure Stripe Webhooks
* Environment Variable Validation

---

## Roadmap

### Phase 1

* Authentication
* Deck CRUD
* AI Generation
* Stripe Billing

### Phase 2

* APKG Export
* Folder Organization
* Deck Sharing

### Phase 3

* PDF Uploads
* YouTube Imports
* Website Imports
* AI Study Assistant

### Phase 4

* Community Deck Marketplace
* Public Profiles
* Team Workspaces

---

## Deployment (Vercel)

### 1. Supabase Setup

1. Create a project at [supabase.com](https://supabase.com)
2. Run the migration in `supabase/migrations/20250602000000_initial_schema.sql` via the SQL editor or Supabase CLI
3. Enable Google OAuth in Authentication → Providers (optional)
4. Copy project URL and anon key

### 2. Stripe Setup

1. Create products and a Pro price in Stripe Dashboard
2. Set up webhook endpoint: `https://your-domain.com/api/webhooks/stripe`
3. Subscribe to: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`
4. Copy secret key, publishable key, webhook secret, and price ID

### 3. OpenAI Setup

1. Create an API key at [platform.openai.com](https://platform.openai.com)
2. Add `OPENAI_API_KEY` to environment variables

### 4. Deploy to Vercel

```bash
npm install -g vercel
vercel
```

Add all environment variables from `.env.example` in the Vercel dashboard.

Set `NEXT_PUBLIC_APP_URL` to your production domain.

### 5. Admin Access

Set `ADMIN_EMAILS` to comma-separated admin emails. After signup, run in Supabase SQL:

```sql
UPDATE profiles SET is_admin = true WHERE email = 'admin@example.com';
```

### 6. Local Development with Supabase CLI

```bash
npx supabase start
npx supabase db reset
cp .env.example .env.local
# Fill in local Supabase keys from `supabase status`
npm run dev
```

---

## Architecture

See [docs/architecture.md](docs/architecture.md) for full system design, data model, and security details.

---

MIT License

---

## Inspiration

Inspired by Ankify and the Anki ecosystem.

Built to make high-quality learning materials accessible through AI-powered deck generation.
