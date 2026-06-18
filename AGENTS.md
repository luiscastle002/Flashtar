# AGENTS.md — Developer & AI Agent Operations Manual

Welcome, Agent. This document outlines the core operational directives, coding practices, and strict architectural constraints for the **Flashtar** platform. 

You must strictly follow these rules without exception to ensure project scalability, type safety, and error-free internationalization.

---

## Table of Contents
1. [Core Principles](#core-principles)
2. [Agent Authority & Limits](#agent-authority--limits)
3. [Tech Stack Constraints](#tech-stack-constraints)
4. [Mandatory i18n Rules](#mandatory-i18n-rules)
5. [JSON Safety & Verification Rules](#json-safety--verification-rules)
6. [Database Schema Change Conventions](#database-schema-change-conventions)
7. [Feature Completion Definition (DoD)](#feature-completion-definition-dod)

---

## Core Principles

1. **Type Safety First**: No `any` type escapes. Use strict TypeScript types and schemas throughout.
2. **Documentation-Driven Development**: When adding or refactoring features, update the corresponding markdown documents instantly.
3. **Localization First**: All user-facing strings must be localized across all supported languages upon creation.
4. **Production Build Integrity**: The application must build clean (`npm run build`) and pass checks (`npm run typecheck`) at the end of every task.
5. **No Regressions**: Verify existing functions and keep all database schemas and webhooks backward compatible.

---

## Agent Authority & Limits

### You are authorized to:
- Refactor helper modules, database queries, and server actions to support performance.
- Expand translation namespaces and modify dictionaries to resolve placeholders.
- Add missing components, API endpoints, or database tables to support approved features.

### You are NOT authorized to:
- Deprecate existing core functions or change database column names without backward-compatible fallbacks.
- Replace core tech stack libraries (e.g. swap Next.js for Vite, or Stripe for another payment system) unless explicitly approved by the User.
- Remove database Row Level Security (RLS) policies or bypass security validation rules.

---

## Tech Stack Constraints

- **Frontend**: Next.js App Router, TypeScript, Tailwind CSS, shadcn/ui.
- **Backend & Database**: Supabase, PostgreSQL, Row-Level Security (RLS) is mandatory for all user-owned rows.
- **Payments**: Stripe & Paddle. Stripe holds the source of truth for billing; Supabase profiles sync with it.
- **AI Engine**: OpenAI API with Structured Outputs (zod schemas) to validate generated deck structures before saving.
- **Locales**: `en` (English), `es` (Spanish), `pt` (Portuguese), and `ja` (Japanese) managed via `next-intl`.

---

## Mandatory i18n Rules

Every developer and coding agent must follow these rules to maintain a **Fully Deterministic i18n System**:

### 1. UI Text Additions
All user-facing copy (buttons, labels, dialog alerts, inputs, placeholders, header titles) must use translation keys from the locale files:
- **English**: `src/messages/en.json` (Source of Truth)
- **Spanish**: `src/messages/es.json`
- **Portuguese**: `src/messages/pt.json`
- **Japanese**: `src/messages/ja.json`

### 2. Count Pluralizations
Never write manual ternary string checks for counts. Always use the ICU plural syntax inside JSON message files:
```json
"cards_plural": "{count, plural, =1 {# card} other {# cards}}"
```
*Never write code like:*
```typescript
const label = `${count} card${count !== 1 ? "s" : ""}`;
```

### 3. Enum & State Localization
Database enums and status strings must not be rendered directly to the screen. Map them dynamically using namespace dictionaries:
```typescript
const tCard = useTranslations("study.card");
const label = tCard(`state.${card.state}`);
```
Define matching state dictionaries under a namespace matching:
`feature.state.*`, `feature.status.*`, `feature.type.*`, `feature.difficulty.*`.

### 4. Timespent & Duration Layouts
Never hardcode suffix characters (`"m"`, `"s"`, `"h"`) or space symbols. Always use dynamic translator variables:
```typescript
const label = durationMin > 0 
  ? t("duration_min_sec", { minutes: durationMin, seconds: durationSec }) 
  : t("duration_sec", { seconds: durationSec });
```
*Never write code like:*
```typescript
const durationStr = `${min}m ${sec}s`;
```

### 5. API & Validation Errors
All server action errors, database constraints, and zod validation failures must return translation keys (e.g. `errors.auth.invalid_credentials`).
Translate them at the form client boundary using the `translateError` helper:
```typescript
toast.error(translateError(error.message, tRoot));
```

### 6. Relative Time Guidelines
To format relative times deterministically and avoid Next.js hydration warnings (e.g. `ENVIRONMENT_FALLBACK` alerts):
- Never invoke `format.relativeTime()` in a component without a deterministic `now` parameter unless a default `now` Date is configured in the root-level `<NextIntlClientProvider>`.
- The root layout `<NextIntlClientProvider>` must always be configured with a request-time `now={new Date()}` on the server.
- Descendant components automatically inherit this reference timestamp. Avoid local dynamic overrides (`new Date()`) inside Client Component render loops to prevent hydration mismatch.

---

## JSON Safety & Verification Rules

Translation files are large, business-critical assets. Malformed syntax will crash the Next.js compiler.

### Before Committing Changes:
1. **JSON Verification**: Confirm the target translation file has a valid syntax structure. Run:
   ```bash
   node -e "JSON.parse(require('fs').readFileSync('./src/messages/pt.json','utf8')); console.log('Valid JSON')"
   ```
2. **Brace & Token Balance**: Double-check that all ICU parameters (e.g. `{count}`, `{error}`, `{name}`) have matching opening and closing braces.
3. **Escaped Quotes**: Double-check that inner HTML tags or quotes in strings are properly escaped (e.g., `\"`).
4. **Namespace Sibling Checks**: Verify new objects are added as direct children of namespaces and do not accidentally overwrite sibling keys.

---

## Database Schema Change Conventions

- **RLS Mandatory**: Every new table must have Row-Level Security enabled.
- **Schema Migration**: All database changes must be added via migrations inside the `supabase/migrations/` directory.
- **Backward Compatibility**: Ensure tables can handle null values or have default constraints during rollout so existing code does not break.

---

## Feature Completion Definition (DoD)

A task or feature branch is not ready for merge until it meets the **Definition of Done**:

- [ ] **Typecheck**: Running `npm run typecheck` completes with zero errors.
- [ ] **Lint**: Running `npm run lint` completes with zero warnings or errors.
- [ ] **Locales Synced**: All four supported languages (`en`, `es`, `pt`, `ja`) have complete translation keys matching the new feature.
- [ ] **No Hardcoded Strings**: A codebase scan confirms zero raw English strings are rendered in user-facing components.
- [ ] **Double-Byte Expansion Checked**: Page layouts verified in Japanese (`ja`) to ensure text expansion does not break grid alignments or action button widths.
- [ ] **Production Build Succeeded**: Running `npm run build` completes successfully.
- [ ] **Documentation updated**: The `README.md` database schema and feature guides are updated.
