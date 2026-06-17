# CLAUDE.md — CES (Corporate Engagement Suite)

The constitution every Claude Code session obeys. Read it before writing code.

## What we are building

An internal team-engagement desktop app: live polls, suggestion/complaint boxes,
pulse checks, recognition, simple games — scoped across an org hierarchy. Built by
**one person + Claude on a ~$100 budget**, self-hosted on a company-controlled box
(Docker Compose). Full product vision lives in `ProjFiles*.md`; this file is the
build doctrine.

## Prime directive: build the MVP, not the platform

Functionality over completeness. Ship the simplest thing that works and is safe.
The planning docs describe an enterprise end-state — **do not build the end-state.**
When a doc and this file disagree, this file wins.

Rules of thumb:
- **Make it work, then stop.** Don't add config, abstraction, or "extensibility"
  for a second use case that doesn't exist yet. Build the abstraction on the
  *second* real caller, never the first.
- **Boring and obvious beats clever.** A plain SQL query and a plain function beat
  a generic engine. Inline code until duplication actually hurts.
- **Fewer moving parts.** Every new container, dependency, or service must earn its
  place. Default answer to "should we add X infra?" is no.
- **Small vertical slices.** One feature end-to-end (DB → API → UI → test), reviewed,
  merged, then the next. No big-bang branches.

## Locked stack (use these; don't introduce alternatives without asking)

- **Language:** TypeScript everywhere. One language, shared types.
- **Server:** Node 22 + **Fastify**. Modular monolith — one app, organized folders.
- **DB:** **PostgreSQL 16** via **Drizzle ORM**. Validation/contracts with **zod**.
- **Realtime:** native `ws` WebSockets + Postgres `LISTEN/NOTIFY`, aggregation
  in-process. (Good to ~2,000 users — that's our pilot scale.)
- **Jobs/scheduling:** **pg-boss** (Postgres-backed). No separate queue service.
- **Object storage:** **MinIO** (S3-compatible) for photos/receipts.
- **Desktop:** **Tauri 2** shell + React/TS UI. **shadcn/ui + Tailwind + TanStack
  Query** for the frontend. Thin web join page for phones in meeting rooms.
- **AI (in-product):** **Anthropic API directly.** `claude-haiku-4-5` for
  high-volume/low-stakes (icebreakers, tagging), `claude-sonnet-4-6` for
  summaries/theming. One isolated AI module is the only thing that calls the API.
- **Deploy:** Docker Compose + **Caddy** (automatic TLS). Target: one 8 GB box.

Compose stack: `postgres (app) · postgres (vault) · minio · ces-server · join-web · caddy`.

## Explicitly NOT now (the docs mention these — resist them)

Redis · NATS/RabbitMQ/Kafka or any message broker · Centrifugo · ClickHouse ·
Cedar/OPA policy engines · microservices / service extraction · mTLS · SCIM ·
Keycloak · Workday/BambooHR/SuccessFactors adapters · Terraform/Helm · multi-region ·
SOC2/ISO tooling · WASM game runtime · natural-language-to-chart · admin copilot.

If you think we genuinely need one of these, stop and ask — don't add it silently.

## Security: basic but real (non-negotiable, kept minimal)

The goal is "an outsider can't get in or read what they shouldn't" — not enterprise
certification. Do these every time; don't gold-plate beyond them.

1. **Auth = SSO only.** OIDC Auth Code + PKCE via system browser, plus one local
   break-glass admin. No passwords stored, ever. Tokens short-lived.
2. **Authorize every endpoint.** Each route checks role + org-node scope. A new
   endpoint without an explicit access check (and a test proving denial) is not done.
   Use plain role/scope checks in code — no policy-engine framework.
3. **Validate all input** at the edge with zod. Parameterized queries only (Drizzle
   handles this — never build SQL by string concatenation).
4. **Tenant/scope isolation.** Single-tenant per deployment (Mode C). Still scope
   queries by node; turn on Postgres RLS as cheap defense-in-depth where easy.
5. **Secrets** come from env / the compose secrets — never committed to the repo.
6. **TLS** is terminated by Caddy. Don't roll your own crypto anywhere.
7. **Rate-limit** mutations and **dedupe votes** on `(session, participant, question)`.

## Anonymity: the one place we do NOT cut corners

Suggestion boxes, complaints, pulse, and wellness are worthless if identity can leak.
These are hard rules, enforced in code:

- **No `user_id` (or any identity) in anonymity-critical tables.** Anonymous items
  carry an opaque `pseudonym_ref` only. The `pseudonym_ref → user` map lives in the
  **separate vault Postgres DB** with its own credentials. FORCED_ANON items create
  **no mapping at all** — the submitter keeps a client-side claim ticket.
- **Never log request content or user identifiers** on anonymous routes. No IPs.
- **Coarse timestamps** (`created_day` / `created_week`) on anonymous artifacts —
  never full timestamps (defeats timing correlation).
- **k-anonymity:** aggregates (wellness, pulse) don't render below **k = 5**.
- **AI over anonymous data is aggregate-only** — themes and counts, never "who."

Anything touching the vault, auth, or anonymity tables: flag it in the PR for an
extra human read. When unsure whether something leaks identity, assume it does and ask.

## Data discipline

- **Append-only tables:** `audit_log`, `submission_events`, `contributions`,
  `points_ledger`. App role gets no UPDATE/DELETE on these.
- **Audit the privileged stuff:** admin actions, routing decisions, exports,
  moderation, AI calls (purpose + scope, never content). Keep the hash-chain simple
  (`hash = sha256(prev_hash || row)`); don't build external anchoring yet.
- **Migrations** are forward-only (Drizzle), and rehearsed on a copy before merge.

## Definition of done (per slice)

- [ ] Works end-to-end and you ran it.
- [ ] At least one happy-path test; auth slices have a denial test.
- [ ] Every new endpoint has an explicit authz check.
- [ ] No identity in anon tables; no content/identifiers in logs.
- [ ] Append-only tables stayed append-only; audit emitted for privileged actions.
- [ ] No new infra/dependency added without asking.

## How to write the code (the loop, every time)

Write like a competent junior dev shipping their first real feature: code that is
obvious, safe, and boring. **Most great software is under-engineered** — basic
boilerplate that does the job. We DO want clean code — small named functions, clear
files, sensible reuse — but clean ≠ perfect, and clean ≠ layered. The enemy is not
abstraction; the enemy is **speculative abstraction** (built for a future that may
never come) and **ballooning** (a 100-line job that becomes 4,000 lines across 20
files). Good abstraction removes duplication you already have. Bad abstraction adds
indirection for duplication you imagine. Only build the first kind.

### Size budgets (hard limits — blow past one and you must stop and check in)

- A normal feature = **one feature folder, ~3-6 files, low hundreds of lines total.**
- A single file should rarely exceed **~300 lines**; a function rarely **~50**.
- If a feature is sprawling past **~8 files or ~800 lines**, you've over-built it or
  it's secretly several features — stop, show what you have, and we re-scope.
- New shared/abstraction code (a new helper, a new base component, a new layer) needs
  a one-line justification: what *existing, real* duplication it removes. No "future."

For each slice, follow this loop:

1. **Say the plan in 2-3 sentences first.** Which file(s), which functions, the
   dumbest approach that works. If the plan needs a new abstraction, a new dependency,
   or more than ~2 new files, stop and ask — that's a smell.
2. **Write the obvious version.** Plain functions, plain SQL, inline logic. Copy-paste
   over a clever helper until you've copied it a *third* time. Hard-code the thing that
   only has one value today. A reader should understand it in one pass without docs.
3. **Make it safe, not perfect.** Cover the security/anonymity rules above and the
   happy path + the one or two failure modes that actually happen (bad input, not
   logged in, item missing). Skip the exotic edge cases — note them in a `// TODO:`
   and move on. "Handles every conceivable case" is not the bar; "an outsider can't
   break it and normal use works" is.
4. **Quick self-review with the over-engineering lens** (below). Delete anything that
   isn't carrying its weight.
5. **Run it, show the diff,** name anything you deliberately left out.

### Over-engineering smell test — if you catch yourself doing these, stop

- Adding an interface/base class/generic with **one** implementation.
- A config option, flag, or parameter nothing currently sets.
- A `utils`/`helpers`/`manager`/`factory` layer for code used in one place.
- Splitting one readable file into five "for organization."
- "We might need it later" — we'll add it later, when we actually do.
- Caching, queues, pools, or batching before there's a measured slowness.
- More than ~3 levels of function indirection to do one simple thing.
- Wrapping a library in your own abstraction "in case we swap it" (the ports in
  §6 of the plan are the *only* sanctioned wrappers — don't invent new ones).

When in doubt, write less code. The simplest version that passes the done-checklist
is the correct version. We can always add complexity when reality demands it — we can
rarely remove it once it's there.

## How to build a feature (your workflow)

Foundations are built **once**, then every feature is the same small recipe plugged
into them. That sameness is what keeps the app consistent and the code reviewable.

### Build the foundation first (one time, before any feature)

1. **Scaffold + auth + app shell together.** Repo, Docker Compose, DB, OIDC login +
   break-glass admin, and the *shell*: top nav / sidebar layout, routing, and the
   "you're logged in" empty dashboard. After this, you can log in and see a themed
   shell with nothing in it.
2. **Lock the design system here.** shadcn/ui + Tailwind tokens (colors, spacing,
   fonts), and the handful of shared primitives every feature reuses: `PageHeader`,
   `Card`, `DataTable`, `EmptyState`, `Button`, form inputs, toast. **Features do not
   invent their own UI** — they compose these. New primitives are added rarely and
   deliberately, never per-feature.

### The feature recipe (repeat for every feature, in order)

Each feature lives in its own folder following the same shape:
`server/features/<name>/` (routes + db query + zod schema) and
`desktop/features/<name>/` (one page + its components). Steps:

1. **One sentence of intent + the data.** What the user does, and the 1-3 tables it
   touches. If it needs no new table, even better.
2. **Schema + migration** (Drizzle) — only the columns you need now.
3. **Server routes** — plain Fastify handlers: validate (zod) → authz check → query →
   return. No service/repository layers; the handler talks to Drizzle directly.
4. **One page** — compose the shared primitives into the screen; TanStack Query for
   data. Match the existing pages' layout exactly (same `PageHeader`, same spacing).
5. **Wire it into the nav** so it's reachable, behind the right role.
6. **Done-checklist + show the diff.**

If a feature can't fit this shape, it's a sign it's too big — split it.

### Suggested build order (each is one shippable slice)

Foundation → **Login** (proves auth) → **Dashboard** (proves the shell + a real query)
→ **Settings** (proves simple CRUD + roles; good pattern-setter) → **Live Polling**
(the first real activity, the adoption wedge) → **Random Name Picker** (small, reuses
the session/realtime plumbing from polling) → further activities (icebreakers, RPS) →
**Suggestion box** (first anonymity-critical feature — slow down here) → **Admin panel**
(built last: it just manages data the earlier features already created — toggles,
roles, question banks — reusing the same `DataTable`/form primitives).

Admin comes last on purpose: you can't build screens to administer things that don't
exist yet, and by then the shared primitives make it mostly assembly.

## Working style with the human

## Working style with the human

- Spec the slice in a sentence or two, build it, show the diff. The spec is the
  contract, not the chat.
- Prefer editing existing files over creating new ones; match surrounding style.
- If a request would balloon scope or add infra, say so and propose the smaller version.
