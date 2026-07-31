# Wealth Prof — Architecture & Code Tour

> The "how do I change things myself" companion to [DESIGN.md](./DESIGN.md)
> (which explains *why* things are designed the way they are). Read this when
> you want to find the code behind a feature, add something, or fix a bug.

## Stack in one paragraph

A **single-page React app** (Vite + TypeScript) talking **directly to
Supabase** (Postgres + Auth + auto-generated REST). There is no custom
backend server: server-side rules live in Postgres itself (Row Level
Security, triggers, RPC functions — all in `supabase/migrations/`), and all
financial logic runs client-side as pure TypeScript functions with unit
tests. Deployed as static files on Vercel; installable as a PWA.

```
Browser (React SPA, PWA)
  ├─ TanStack Query  ← cache + optimistic updates + offline persistence
  └─ supabase-js     ← REST + Auth (RLS enforces per-household access)
        │
Supabase Postgres    ← schema, RLS, triggers, RPCs (migrations 0001…)
```

## Directory map

| Path | What lives here |
|---|---|
| `src/App.tsx` | Auth gate + tab routing + URL state wiring |
| `src/components/layout/AppShell.tsx` | Header (month/person filter), bottom nav, FAB |
| `src/components/` | Shared widgets: `Keypad`, `AmountField`, `InstrumentSelect`, `OwnerSelect`, `MonthYearPicker`, `SwipeableRow` |
| `src/components/ui/` | shadcn/vaul primitives (button, drawer, dialog, …) — mostly generated, edited sparingly |
| `src/features/<name>/` | One folder per screen/feature: `transactions`, `home` (Overview), `accounts`, `installments`, `plan`, `categories`, `settings` |
| `src/lib/*.ts` | Data hooks: one file per table/concept (`transactions.ts`, `cards.ts`, `categories.ts`, …). Each exports `useXxx` query hooks + `useCreate/Update/DeleteXxx` mutations |
| `src/lib/finance/` | **Pure financial logic, no I/O**: `billingCycle.ts` (cycles, `cycleBill`, `periodDate`), `recurrence.ts` (occurrence generation). The most important code in the repo — always unit-tested |
| `src/lib/calculator.ts` | Keypad expression logic (pure, tested) |
| `src/lib/queryClient.ts` | React Query client + localStorage persistence (offline reads) |
| `supabase/migrations/` | Numbered SQL migrations — the real backend. Applied via Supabase MCP/CLI, never edited after applying |
| `scripts/import-sheet.ts` | CLI import from Google Sheet CSV exports (`npm run import:sheet`) |
| `docs/` | SPEC (product), DESIGN (system design, the PRD), this file |

## Data flow conventions

- **Query keys** are `[table, householdId]` (e.g. `['transactions', householdId]`),
  sometimes with extra range args. Mutations invalidate the matching key(s) in
  `onSuccess` — look at any `src/lib/*.ts` file and copy the pattern.
- **Reads go through views** (`v_transactions`, `v_categories`, …) which filter
  soft-deleted rows; **writes go to the base tables**. Soft delete = set
  `deleted_at`, never a real DELETE (categories are the one exception: hard
  delete when unused, archive when referenced).
- **Two background "materialisers"** run on app open/focus (mounted in
  `App.tsx`): `RecurringMaterialiser` posts recurring-rule occurrences,
  `InstallmentMaterialiser` posts card-billed installment periods. Both are
  idempotent via DB unique constraints, so double-runs from two phones are
  harmless.
- **Money never comes from the keyboard**: amount fields use the in-app
  `Keypad` (`useAmountEntry` hook) — the iOS system keyboard shoves the sheet
  around, which is why this exists.

## How to…

**Add a screen/tab** — create `src/features/<name>/<Name>Screen.tsx`, add a
tab entry in `AppShell.tsx` (`TABS`), and a case in the `screens` record in
`App.tsx`.

**Add a DB column** — write `supabase/migrations/00NN_description.sql`, apply
it to the live project (Supabase MCP `apply_migration`, or `supabase db push`),
then update the matching interface + `select(...)` string in `src/lib/<table>.ts`.
RLS is per-household on every table — new tables need the standard
`member_all` policy (copy from `0006_rls.sql`).

**Change financial logic** — edit the pure function in `src/lib/finance/`,
add/extend its `.test.ts` first. Never duplicate a formula in a component;
screens call these functions.

**Run checks** — `npm run typecheck && npm test && npm run lint`. Vitest only
covers pure logic; UI is verified by hand/preview.

**Deploy** — push to `main`; Vercel auto-deploys (GitHub integration).
Local production preview: `npm run build && npm run preview` (service worker
only runs in the production build, not `npm run dev`).

**Test PWA/offline** — build + preview as above; to reset a stale service
worker in the browser: DevTools → Application → Service Workers → Unregister,
or bump a change and reload twice.

## Gotchas worth knowing

- `transactions.source_key` has a unique constraint per household — it's what
  makes the sheet import re-runnable and installment auto-posting idempotent.
  Don't reuse the format (`installment:<id>:<n>`, sheet tab:row) elsewhere.
- `cycleBill` takes a `paidPeriods` set to avoid double-counting installment
  periods that already exist as posted transactions. If you call it, pass it.
- Dates are plain `yyyy-MM-dd` strings interpreted as Asia/Bangkok — never
  `new Date(isoString)` a date column (timezone shift risk); string compare
  works because the format is sortable.
- The React Query cache persists to localStorage for 7 days (offline reads).
  Sign-out clears it — if you add another storage location for financial
  data, clear it there too.
- **Anything a `queryFn` returns must survive a JSON round-trip**, because
  that cache is persisted as JSON. A `Map` or `Set` stringifies to `{}`: the
  entries vanish and the rehydrated value has no `.get`, so the crash only
  appears after a reload, not while developing. If a screen wants a Map, keep
  the query data plain and build it in React Query's `select` (see
  `src/lib/categoryUsage.ts`) — `select` output is never persisted. Same goes
  for `Date` objects and class instances.
