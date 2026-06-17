# CES Build Workflow

How features get built. The durable rules live in `CLAUDE.md`; this is the practical
day-to-day playbook. Read both.

## The one idea

Build the **foundation once**, then every feature is the **same small recipe** plugged
into it. That sameness is what keeps the app consistent, the design coherent, and the
code reviewable. Features can't drift, because they all compose the *same* app shell
and the *same* UI primitives.

## Step 0 — Foundation (one time, before any feature)

1. **Scaffold + auth + app shell, together.** Monorepo, Docker Compose, database,
   login (break-glass admin now; OIDC adapter slots in later), and the *shell*: the
   nav/sidebar layout, routing, and an empty "you're logged in" dashboard.
   *Outcome:* you can log in and see a themed shell with nothing in it.
2. **Lock the design system here.** Tailwind tokens (colors, spacing, fonts) and the
   handful of shared primitives every feature reuses: `PageHeader`, `Card`, `Button`,
   `DataTable`, `EmptyState`, form inputs, toast. After this, **features compose these
   — they never invent their own UI.** New primitives are added rarely and on purpose,
   never per-feature.

## The feature recipe (repeat for every feature, in order)

Each feature lives in its own folder, same shape every time:
- `apps/server/src/features/<name>/` — routes + db query + zod schema
- `apps/desktop/src/features/<name>/` — one page + its components

Steps:
1. **One sentence of intent + the data.** What the user does; the 1-3 tables it touches.
2. **Schema + migration** (Drizzle) — only the columns you need *now*.
3. **Server routes** — plain Fastify handlers: validate (zod) → authz check → query →
   return. No service/repository layers; the handler talks to Drizzle directly.
4. **One page** — compose the shared primitives; TanStack Query for data. Match the
   existing pages' layout exactly (same `PageHeader`, same spacing).
5. **Wire into the nav**, behind the right role.
6. **Done-checklist (CLAUDE.md) + show the diff.**

If a feature won't fit this shape, it's too big — split it.

## Size limits (so a 100-line feature doesn't become 4,000)

- Normal feature = **one folder, ~3-6 files, low hundreds of lines.**
- File rarely > ~300 lines; function rarely > ~50.
- Past **~8 files / ~800 lines** → stop, show what exists, re-scope.
- New shared/abstraction code must remove **real, existing** duplication — never "future."

## Build order

Each row is one shippable slice. Build top to bottom.

| # | Feature | Why it's here |
|---|---------|---------------|
| 0 | Foundation + shell + design system | Everything plugs into it |
| 1 | **Login** | Proves auth end-to-end |
| 2 | **Dashboard** | Proves the shell + one real query renders |
| 3 | **Settings** | Simple CRUD + roles — the pattern every later feature copies. Get it right. |
| 4 | **Live Polling** | First real activity; the adoption wedge |
| 5 | **Random Name Picker** | Small; reuses polling's session/realtime plumbing |
| 6 | Icebreakers / RPS / more activities | Same recipe, now fast |
| 7 | **Suggestion box** | First anonymity-critical feature — slow down, extra review |
| 8 | **Admin panel** | Last: it manages data earlier features already created (toggles, roles, question banks), reusing the same `DataTable`/forms — mostly assembly |

**Why admin is last:** you can't build screens to administer things that don't exist
yet, and by the time you get there the shared primitives make it almost free.

## Your daily loop

1. Pick the next row.
2. Give Claude one or two sentences of intent.
3. Let it run the 6-step recipe.
4. Check the diff against the size limits.
5. Run it, then merge.
