# CES — Corporate Engagement Suite

Internal team-engagement app. Read `CLAUDE.md` (build doctrine) and `docs/WORKFLOW.md`
(how features get built) before contributing.

## Run it locally

```bash
cp .env.example .env          # then edit ADMIN_PASSWORD + SESSION_SECRET
pnpm install
pnpm infra:up                 # postgres (app), postgres (vault), minio
pnpm db:migrate               # apply migrations (creates the schema on a fresh DB)
pnpm db:setup-role            # provision the restricted app role (needs APP_DATABASE_URL)
pnpm db:seed                  # add a demo tenant + org tree
pnpm dev                      # server on :8080, web on :5173
```

The server connects as a least-privilege role (`APP_DATABASE_URL`) that has **no
UPDATE/DELETE on append-only tables** (`audit_log`); migrations/seed use the owner
(`DATABASE_URL`). Append-only is also enforced by triggers (migration `0001`) that
reject UPDATE/DELETE/TRUNCATE for *every* role. Omit `APP_DATABASE_URL` in dev to just
run everything as the owner.

Open http://localhost:5173.

### Schema changes (forward-only migrations)
The schema lives in `apps/server/src/db/schema.ts`. To change it:
```bash
# 1. edit schema.ts, then generate a forward-only migration file
pnpm db:generate              # writes apps/server/drizzle/NNNN_*.sql
# 2. rehearse on a throwaway copy before merging (never hand-write psql DDL)
# 3. apply — safe to run on every deploy; already-applied migrations are skipped
pnpm db:migrate
```
A brand-new database gets the full schema from `0000`; an existing one only gets
what's newer. The applied set is tracked in `drizzle.__drizzle_migrations`.

### First run & accounts
- **Fresh install** shows **Create your admin account** (first user becomes the admin
  + creates the company). After that, public registration is closed.
- **Adding people** is invite-only: admin → **Members** → send invite. The recipient
  gets an email link (`/accept-invite?token=…`), sets a password, and is in.
- **Email**: leave `SMTP_*` blank in dev and invite emails print to the server console.
  Set `SMTP_HOST/PORT/USER/PASS` (Mailgun, Postmark, SES, …) to actually send.
- **Native app**: `pnpm dev` (server + web) in one terminal, then
  `pnpm --filter @ces/desktop tauri dev` in another for the desktop window.

### Native desktop (Tauri)
Requires the Rust toolchain (`rustup`). The Tauri shell loads the same web UI.

## Layout

```
apps/server   Fastify API + Drizzle schema. Features live in src/features/<name>/.
apps/desktop  React UI (Tauri shell wraps this later). Features in src/features/<name>/.
docs/         Workflow + (later) specs and ADRs.
```
