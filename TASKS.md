# TASK.md

# AnkiAI Development Roadmap

## Product Vision

AnkiAI should become the fastest way for students and professionals to transform knowledge into high-quality spaced-repetition flashcards.

The primary focus is helping users generate, edit, organize, and export Anki decks using AI.

---

# Current Development Phase

## Phase 1 - MVP (In Progress)

Goal:

Deliver a fully functional SaaS that allows users to:

* Create accounts
* Generate decks with AI
* Edit flashcards
* Save decks
* Manage subscriptions
* Export decks

Nothing else should take priority over completing the MVP.

---

# MVP Success Criteria

The MVP is considered complete when:

* Users can sign up
* Users can sign in
* Users can generate AI decks
* Users can edit decks
* Users can edit flashcards
* Users can save decks
* Users can export decks
* Users can purchase a subscription
* Usage limits are enforced
* The application can be deployed to production

---

# Current Sprint

## Priority 1 - Project Foundation

Status: TODO

Tasks:

* [ ] Initialize Next.js project
* [ ] Configure TypeScript
* [ ] Configure Tailwind CSS
* [ ] Configure shadcn/ui
* [ ] Configure ESLint
* [ ] Configure Prettier
* [ ] Configure environment validation

Definition of Done:

* Development server runs successfully.
* No TypeScript errors.
* No linting errors.

---

## Priority 2 - Supabase Setup

Status: TODO

Tasks:

* [ ] Create Supabase project
* [ ] Configure Auth
* [ ] Configure database
* [ ] Configure Row Level Security
* [ ] Create migrations
* [ ] Create database seed data

Definition of Done:

* User authentication works.
* Database tables exist.
* RLS policies are active.

---

## Priority 3 - Authentication

Status: TODO

Tasks:

* [ ] Sign up page
* [ ] Sign in page
* [ ] Google OAuth
* [ ] Password reset
* [ ] Protected routes
* [ ] Session management

Definition of Done:

* Users can authenticate successfully.
* Protected routes cannot be accessed anonymously.

---

## Priority 4 - Database Schema

Status: TODO

Tables:

* [ ] profiles
* [ ] subscriptions
* [ ] decks
* [ ] flashcards
* [ ] ai_generations

Definition of Done:

* Database schema documented.
* Relationships tested.

---

## Priority 5 - Dashboard

Status: TODO

Tasks:

* [ ] Dashboard layout
* [ ] Sidebar navigation
* [ ] User profile menu
* [ ] Recent decks section
* [ ] Usage statistics

Definition of Done:

* Authenticated users can access dashboard.

---

## Priority 6 - AI Deck Generation

Status: TODO

Tasks:

* [ ] Prompt input
* [ ] OpenAI integration
* [ ] Streaming responses
* [ ] Structured outputs
* [ ] Flashcard validation
* [ ] Save generated deck

Definition of Done:

* Users can generate and save decks.

---

## Priority 7 - Deck Management

Status: TODO

Tasks:

* [ ] Create deck
* [ ] Edit deck
* [ ] Delete deck
* [ ] Duplicate deck
* [ ] Search decks

Definition of Done:

* Full CRUD functionality exists.

---

## Priority 8 - Flashcard Editor

Status: TODO

Tasks:

* [ ] Create flashcards
* [ ] Edit flashcards
* [ ] Delete flashcards
* [ ] Reorder flashcards
* [ ] Rich text support

Definition of Done:

* Users can fully manage cards.

---

## Priority 9 - Stripe Billing

Status: TODO

Tasks:

* [ ] Stripe Checkout
* [ ] Stripe Customer Portal
* [ ] Webhooks
* [ ] Subscription sync
* [ ] Usage limits

Definition of Done:

* Billing works end-to-end.

---

## Priority 10 - Export System

Status: TODO

Tasks:

* [ ] CSV export
* [ ] APKG export

Definition of Done:

* Exported decks import successfully into Anki.

---

# Features Explicitly Deferred

The following features are NOT part of the MVP.

Do not work on these unless all MVP tasks are complete.

## Deferred Features

* Community deck marketplace
* Public user profiles
* Shared decks
* Team collaboration
* Study mode
* Mobile app
* Browser extension
* AI tutor
* Voice flashcards
* Gamification
* Leaderboards

---

# Phase 2 - Growth Features

Begin only after MVP completion.

## Deck Organization

* [ ] Folder support
* [ ] Tags
* [ ] Favorites
* [ ] Archive system

## Import Sources

* [ ] PDF import
* [ ] Markdown import
* [ ] YouTube transcript import
* [ ] Website import

## AI Improvements

* [ ] Regenerate card
* [ ] Improve card quality
* [ ] Difficulty adjustment
* [ ] Learning objectives

---

# Phase 3 - Premium Features

## Marketplace

* [ ] Public deck sharing
* [ ] Marketplace browsing
* [ ] Deck ratings
* [ ] Deck comments

## Collaboration

* [ ] Shared workspaces
* [ ] Team accounts
* [ ] Collaborative editing

---

# Phase 4 - Long-Term Vision

## AI Learning Platform

Potential future features:

* AI tutor
* Personalized study plans
* Adaptive flashcards
* Exam preparation
* Knowledge graph generation
* Learning analytics

These features should not influence MVP architecture decisions.

---

# Agent Instructions

When selecting work:

1. Complete tasks from the current sprint first.
2. Do not skip priorities.
3. Do not implement deferred features.
4. Mark completed tasks.
5. Update task status after significant progress.
6. Keep TASK.md synchronized with actual project state.

If uncertain:

Focus on the smallest change that moves the MVP closer to production readiness.

The objective is shipping a usable SaaS, not maximizing feature count.
