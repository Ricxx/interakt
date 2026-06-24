# CES — Pre-launch hardening checklist

Status legend: ✅ in place · 🟡 exists but unverified / needs work · ❌ not built yet

The product is **functionally complete and well-tested at the API level**. This checklist covers the gap
between "built" and "safe to put real people on it." Grouped by theme; do the ❌/🟡 items before a pilot.

---

## 1. Deployment model & scale (read this first)

**You deploy ONE server per organisation, not software to N machines.** Employees use a **browser**
(zero install). The Tauri desktop app is an optional native wrapper. So "3 → 5,000 machines" = "3 → 5,000
people opening a URL," all hitting one deployment.

- 🟡 **Server sizing.** One 8 GB box ≈ **2,000 users** (single process; realtime = WS + Postgres
  LISTEN/NOTIFY, in-process aggregation). Below ~2,000: vertical scale (more RAM/CPU).
- ❌ **>~2,000 concurrent realtime.** The single-process WebSocket fan-out is the ceiling. True 5,000+
  needs a shared pub/sub (Redis/NATS — currently parked by the doctrine). Non-realtime load scales much
  further. **Decision:** is the pilot under ~2k? If yes, no change needed.
- ❌ **Production deploy artifacts.** `docker-compose.yml` is **dev-only**. Missing: server Dockerfile,
  Caddy reverse-proxy + automatic TLS config, a production compose that runs `ces-server` + `join-web` +
  `caddy`, and serving the built desktop web bundle. **Build these.**
- ❌ **`join-web` app** (thin phone/meeting-room join page) — referenced in the architecture, **never
  built**. Needed for QR "scan to join" on phones.
- 🟡 **Migrate-on-boot.** `migrate.ts` applies pending migrations; ✅ exists. Verify it runs in the prod
  container start command, and rehearse a migration on a copy before each deploy.

## 2. Distributing the (optional) desktop app at scale

- ✅ Web app = zero-install default.
- ❌ **Configurable server URL** for the native app — it currently assumes same-origin (`fetch("/api/…")`).
  The Tauri build needs to point at the org's server. **Build.**
- ❌ **Tauri auto-updater** — so managed fleets stay current without reinstalls. **Set up + sign builds.**
- 🟡 **MDM distribution** (Intune / Jamf / Workspace ONE) — document the installer push for IT. (Process, not code.)

## 3. Access & identity management

- ✅ **Members admin**: invite, approve/reject pending, **deactivate / reactivate / erase**, status
  ACTIVE/DISABLED/PENDING, auth blocks disabled accounts immediately.
- ✅ **RBAC**: roles + permission groups + scoped capabilities; first-user-admin bootstrap + break-glass.
- ❌ **SSO (OIDC/SAML)** — doctrine intends SSO; app ships **password login**. Needed to sell to IT.
- ❌ **SCIM / HRIS auto-provisioning** — the answer to access management at 500–5,000: manage users in the
  IdP, auto enable/disable in CES. The manual Members page is the bottleneck at scale.
- 🟡 **Password policy / lockout** — auth is rate-limited (10/min); confirm lockout + password strength are
  adequate if password login stays.

## 4. Security & anonymity (the non-negotiable)

- ✅ Authorize-every-endpoint discipline + denial tests throughout; append-only tables + restricted app
  DB role (`setup-app-role.ts`); hash-chained audit; HMAC QR tokens; AES-GCM-encrypted AI keys.
- 🟡 **Dedicated anonymity red-team pass** — trace every anonymous path (suggestions/complaints/wellness)
  end-to-end with fresh eyes: no identity columns, coarse days only, no content/IP in logs, k≥5 holds,
  stats never expose individuals below threshold. This is the one audit to do before real users.
- 🟡 **Secrets** — `SESSION_SECRET`, DB creds, MinIO keys from env/compose secrets, never committed.
  Rotate the dev defaults. Confirm the AI-key encryption derives from a strong `SESSION_SECRET`.
- 🟡 **TLS** — Caddy auto-TLS (see §1). No app-level crypto rolled by hand. ✅
- 🟡 **Rate limiting / abuse** — auth is limited; consider limits on other mutation-heavy/AI endpoints.

## 5. Data, backups, retention

- ✅ Retention + erasure + SAR export built (`docs/RETENTION.md`); audit/ledger append-only.
- ❌ **Backups** — automated Postgres (app DB) + MinIO backups, tested **restore**. The append-only
  hash-chain makes integrity verifiable; back it up.
- 🟡 **Vault Postgres** — declared in compose but **unused** (FORCED_ANON needs no pseudonym map). Either
  remove it from prod compose or keep dormant; document the choice.

## 6. Comms & content

- 🟡 **SMTP provider** — invites/reset/(digests) need a real provider (`SMTP_*`); without it, email logs to
  console. Configure + verify deliverability + `EMAIL_FROM`/`APP_URL`.
- ❌ **Legal content** — ToS/Privacy are now *editable* but need real text + counsel sign-off before launch.
- 🟡 **AI (optional)** — BYOK; if enabled, set sensible caps. Off by default = fine to launch without.

## 7. Walkthrough / QA (the planned pass)

- 🟡 **Section-by-section click-through** of the running app (nav order), fixing rough edges + finishing
  `docs/MANUAL.md`. e2e covers API logic, not real UX / the packaged Tauri build / `join-web`.
- 🟡 **Cold-start rehearsal** — fresh deployment → first-admin bootstrap → org structure → invites → a real
  session with activities → recognition → a survey → check stats. End-to-end on a clean box.
- 🟡 **Cross-platform** — the packaged desktop binaries (Win/Mac/Linux) + major browsers.

---

### Minimum to launch an internal pilot (<~2,000 users)
1. Build prod deploy artifacts (§1: server Dockerfile + Caddy/TLS + prod compose). 2. Backups + restore
test (§5). 3. SMTP configured (§6). 4. Anonymity red-team pass (§4). 5. Real legal content (§6). 6. The
walkthrough/cold-start rehearsal (§7). **SSO/SCIM and >2k-scale work can follow the pilot** unless you're
launching straight to a large external/enterprise audience.
