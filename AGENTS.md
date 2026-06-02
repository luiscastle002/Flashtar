# AGENTS.md

## Project Mission

Build a production-ready SaaS platform that allows users to generate, manage, edit, and export Anki flashcard decks using AI.

The application should feel modern, fast, intuitive, and scalable.

The primary goal is to maximize learning efficiency by allowing users to convert knowledge into high-quality flashcards with minimal effort.

The project is inspired by Ankify but should not be a clone. Improvements and better UX are encouraged whenever appropriate.

---

# Agent Authority

You are allowed to:

* Refactor code when necessary.
* Improve architecture.
* Add missing files.
* Add missing components.
* Improve database design.
* Improve user experience.
* Improve performance.
* Improve accessibility.
* Improve security.
* Improve maintainability.

You do NOT need explicit approval for small or medium architectural improvements.

When requirements are ambiguous:

1. Choose the solution that best supports scalability.
2. Prefer maintainability over short-term simplicity.
3. Prefer industry best practices.
4. Document important decisions.

---

# Core Product Requirements

Users must be able to:

* Sign up
* Sign in
* Manage subscriptions
* Generate AI flashcard decks
* Edit decks
* Edit flashcards
* Delete decks
* Export decks
* View generation history

These features are considered core functionality and should always remain operational.

---

# Tech Stack

Frontend:

* Next.js (App Router)
* TypeScript
* Tailwind CSS
* shadcn/ui

Backend:

* Supabase
* PostgreSQL
* Row Level Security

Authentication:

* Supabase Auth

Payments:

* Stripe

AI:

* OpenAI API

Deployment:

* Vercel

Do not replace these technologies unless there is a compelling technical reason.

---

# Development Philosophy

Prioritize:

1. Simplicity
2. Reliability
3. Scalability
4. Maintainability

Avoid:

* Overengineering
* Premature optimization
* Unnecessary abstractions
* Excessive dependencies

Favor clean code over clever code.

---

# Architecture Guidelines

Use feature-based organization whenever possible.

Example:

src/

features/
auth/
billing/
decks/
flashcards/
ai-generation/

shared/
components/
hooks/
lib/
types/

The exact structure may evolve if a better architecture emerges.

The agent has permission to reorganize folders when beneficial.

---

# Database Principles

Database design should:

* Follow normalization principles.
* Support future scaling.
* Use UUID primary keys.
* Include created_at timestamps.
* Include updated_at timestamps where appropriate.

All user-owned resources must support Row Level Security.

Never bypass RLS without strong justification.

---

# AI Generation Requirements

The AI generation system should:

* Produce structured outputs.
* Support multiple flashcard formats.
* Handle malformed responses gracefully.
* Retry failed generations when possible.
* Validate generated data before saving.

Never trust AI output without validation.

---

# Stripe Requirements

Implement:

* Checkout
* Customer Portal
* Subscription Status Sync
* Webhooks

Subscription state should always be synchronized between Stripe and Supabase.

Stripe should be the source of truth for billing status.

---

# Security Requirements

Mandatory:

* Input validation
* Rate limiting
* Secure API routes
* Protected server actions
* Secure environment variable usage
* CSRF protection where relevant

Never expose secrets to the client.

Never trust client-side authorization.

---

# User Experience Requirements

The application should feel polished.

Implement:

* Loading states
* Skeletons
* Error boundaries
* Empty states
* Toast notifications
* Responsive layouts

Users should always understand:

* What is happening
* What succeeded
* What failed
* What action to take next

---

# Performance Requirements

Prefer:

* Server Components
* Streaming
* Caching
* Pagination
* Lazy loading

Avoid unnecessary re-renders.

Avoid unnecessary API calls.

Optimize database queries.

---

# Accessibility

Follow WCAG best practices.

Support:

* Keyboard navigation
* Screen readers
* Semantic HTML
* Proper form labels

Accessibility is not optional.

---

# Code Quality Standards

Requirements:

* Strict TypeScript
* ESLint
* Consistent naming
* Reusable components
* Clear separation of concerns

Functions should:

* Have a single responsibility.
* Be easy to test.
* Be easy to understand.

Prefer descriptive names.

Avoid cryptic abbreviations.

---

# Testing

When implementing critical functionality:

Prioritize testing for:

* Authentication
* Billing
* AI generation
* Deck management

Prefer automated tests when practical.

---

# Documentation

Keep documentation updated.

Update:

* README.md
* Environment setup instructions
* Database documentation
* API documentation

when significant changes are introduced.

---

# Decision Framework

When multiple solutions exist:

Choose the solution that is:

1. Easier to maintain.
2. Easier to scale.
3. Easier for future developers to understand.
4. Consistent with the existing architecture.

---

# MVP Priorities

Highest Priority:

* Authentication
* AI deck generation
* Deck management
* Flashcard editor
* Stripe subscriptions

Medium Priority:

* APKG export
* Folder organization
* Generation history

Future Features:

* PDF import
* YouTube import
* Shared decks
* Public marketplace
* Team collaboration

Do not allow future features to complicate MVP implementation.

---

# Final Rule

The objective is not simply to write code.

The objective is to build a production-ready SaaS that users would be willing to pay for.

When making implementation decisions, optimize for long-term product success rather than short-term completion.
