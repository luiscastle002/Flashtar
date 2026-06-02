# AnkiAI Architecture

## Overview

AnkiAI is a full-stack SaaS built with Next.js 15 (App Router), Supabase, Stripe, and OpenAI.

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   Browser   │────▶│  Next.js App │────▶│  Supabase   │
│  (React)    │◀────│  (Vercel)    │◀────│  (Postgres) │
└─────────────┘     └──────┬───────┘     └─────────────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
         ┌────────┐  ┌─────────┐  ┌────────┐
         │ OpenAI │  │ Stripe  │  │ Auth   │
         └────────┘  └─────────┘  └────────┘
```

## Folder Structure

```
src/
├── app/                    # Next.js App Router pages & API routes
│   ├── (auth)/             # Login, signup, forgot password
│   ├── admin/              # Admin dashboard
│   ├── api/                # REST API endpoints
│   │   ├── generate/       # AI deck generation
│   │   ├── stripe/         # Checkout & portal
│   │   ├── webhooks/       # Stripe webhooks
│   │   └── decks/          # Export endpoints
│   ├── auth/               # OAuth callback, password reset
│   ├── dashboard/          # User dashboard
│   ├── decks/              # Deck list & editor
│   ├── generate/           # AI generation UI
│   └── settings/           # Account & billing
├── actions/                # Server actions (auth, decks, flashcards)
├── components/
│   ├── ui/                 # shadcn/ui primitives
│   ├── dashboard/          # Layout shell
│   ├── decks/              # Deck management & editor
│   ├── flashcards/         # Rich text editor
│   ├── generate/           # Generation form
│   ├── settings/           # Settings UI
│   └── shared/             # Theme, common components
├── lib/
│   ├── supabase/           # Client, server, admin, middleware
│   ├── stripe/             # Stripe SDK wrapper
│   ├── openai/             # AI generation
│   ├── export/             # CSV & APKG export
│   └── queries/            # Data fetching helpers
├── types/                  # TypeScript types & plan limits
└── middleware.ts           # Auth & route protection

supabase/
├── migrations/             # Database schema & RLS
└── config.toml             # Local Supabase config
```

## Data Model

```
auth.users (Supabase)
    │
    ├── profiles (1:1)
    │       └── is_admin
    │
    ├── subscriptions (1:1)
    │       ├── stripe_customer_id
    │       ├── plan (free | pro)
    │       └── status
    │
    ├── decks (1:N)
    │       └── flashcards (1:N)
    │
    └── ai_generations (1:N)
            └── deck_id (optional FK)
```

## Authentication Flow

1. User signs up via email/password or Google OAuth
2. Supabase trigger creates `profiles` and `subscriptions` rows
3. Middleware refreshes session and protects `/dashboard`, `/decks`, `/generate`, `/admin`
4. Server components use `createClient()` from `@/lib/supabase/server`

## AI Generation Flow

1. User submits prompt via `/generate`
2. `POST /api/generate` validates input, checks plan limits, rate limits
3. OpenAI generates structured JSON deck via `response_format: json_schema`
4. Deck + flashcards saved to Supabase
5. `ai_generations` record updated with token usage

## Billing Flow

1. Free users get 3 generations/month, 50 cards/deck
2. Upgrade via Stripe Checkout (`POST /api/stripe/checkout`)
3. Webhook syncs subscription status to `subscriptions` table
4. Plan limits enforced in `canGenerateDeck()` and generation API

## Security

- Row Level Security on all tables
- Service role key only used server-side (webhooks, admin)
- Rate limiting on generation endpoint
- Input validation with Zod
- Admin routes protected by `is_admin` flag + middleware

## Deployment

See README.md for Vercel deployment instructions.
