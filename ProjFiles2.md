# Corporate Engagement Suite — Plan v2.0 (Solo Builder Edition)

Supersedes the resourcing, roadmap, and integration-priority sections of v1.0.
The v1.0 architecture, database design, anonymity engineering (§7), and module specs remain the blueprint — this document re-scopes them for **one builder + Claude + $100**, locks the open decisions, and defines the rigorous build process flow.

---

## 1. Locked Decisions

| Question | Decision | Why |
|---|---|---|
| OS targets | **Windows + macOS (Apple Silicon native + Intel via universal build)** | Tauri cross-compiles both; CI builds `aarch64-apple-darwin` + `x86_64` and lipo-merges a universal binary |
| Hierarchy | **Company > Division > Department > Unit** (4 fixed levels + virtual groups) | Simpler than arbitrary depth; ltree unchanged |
| Branding | **Per department** | Theme tokens (logo, colors) stored on the Department node, inherited downward by Units |
| Residency | **Mode C: self-hosted on a company-controlled server** | $0/month, strongest privacy story, fits "deployed on corporate machines" |
| Identity (login) | **Generic OIDC adapter** → works with Entra ID, Okta, Google, Keycloak via config. Plus local break-glass admin account | One adapter, many vendors |
| Org data (HRIS) | **CSV import first** (template provided). DirectorySync port reserved for BambooHR / SuccessFactors / AD-LDAP / SCIM adapters later | CSV works everywhere on day one |
| Mobile app | **Out of scope permanently for this build.** Thin web join page covers phones in meeting rooms | Confirmed |
| Fundraising | **Ledger-only transparency** — record pledges/contributions/receipts; never touch real money flow | Avoids payment processing & PCI scope |
| Complaint ownership | **HR + Communications co-owned queue** — HR handles people matters, Comms handles culture/process; routing rules send severity ≥ HIGH to HR only | Per your call |
| AI provider | **Anthropic API directly** (no Bedrock/Vertex) | One key, lowest complexity/cost |
| New module | **M10 Rewards Shop** — full spec in §3 | Approved |

---

## 2. Reality Check: What $100 Buys (and What It Doesn't)

### Budget allocation
| Item | Cost | Notes |
|---|---|---|
| Anthropic API credits (in-product AI features during dev/pilot) | ~$25 | Haiku for high-volume, Sonnet for summaries; with prompt caching this lasts a long pilot |
| Domain name (optional, for the web join page) | ~$12/yr | Can skip entirely on a LAN deployment (use internal hostname) |
| Everything else — server, database, realtime, CI, storage | **$0** | See free-stack below |
| Reserve | ~$60 | Keep for API top-ups or the Apple Developer Program later |

### The free stack
- **Server:** runs on a company-controlled box (an existing VM, a spare desktop, even a Mac mini) via Docker Compose. Zero hosting cost — this *is* Mode C.
- **Database:** PostgreSQL 16 in Docker. Redis is **deferred** — at department/company pilot scale (≤ ~2,000 users), Postgres `LISTEN/NOTIFY` + in-process aggregation handles live polls fine. The realtime code sits behind an interface so Redis can be slotted in later without rewrites.
- **Object storage:** MinIO in Docker (S3-compatible, free) for photos/receipts.
- **CI:** GitHub Actions free tier (builds Windows + macOS artifacts).
- **Claude Code:** your existing Claude subscription is the engineering team.

### Honest trade-offs at this budget — say these out loud to stakeholders
1. **Code signing is deferred.** Apple notarization requires the $99/yr Apple Developer Program (your whole budget); Windows signing certs cost more. For *internal* deployment this is workable: IT distributes via MDM/Intune/Jamf with the app explicitly trusted, or users approve the unsigned app once. **First revenue or budget increase → buy Apple Developer Program immediately**, then a Windows cert.
2. **No SOC 2 / pen test yet.** Replace with: the automated security checks in §5, a self-assessment doc, and the fact that data never leaves the customer's own server. That's a credible pilot posture, not an enterprise sales posture.
3. **Auto-update** ships as "check for update → download from your internal server," not staged rollout rings.
4. **One environment** (the pilot server) doubles as staging until there's a second machine.
5. **Adapters ship in this order:** OIDC + CSV (build now) → AD/LDAP → SCIM → BambooHR → SuccessFactors. The DirectorySync port is built day one so none of these require core changes — but only the first two exist at launch. Promising "all of them, day one" solo is how projects die.

None of these compromise the **architecture** — they defer *credentials and certificates*, not design. Everything upgrades in place.

---

## 3. New Module — M10: Rewards Shop

Points already implicitly existed (competitions, games, recognition). M10 makes them an economy.

### Earning (all server-authoritative, append-only)
| Event | Points (default, admin-tunable) |
|---|---|
| Join a live session / answer pulse | 5 |
| Suggestion accepted ("Planned" or "Done") | 50 |
| Competition placement | 100 / 60 / 30 |
| Recognition received (kudos) | 20 |
| Minigame season top-10 | 25 |
| Wellness check-in streak (weekly) | 10 |

Anti-inflation controls: per-user daily earn cap, per-source cap, no points for anonymous actions (prevents farming through anonymity), decay/season reset optional.

### Spending
- **Catalog** managed by HR/Comms per scope (company-wide items + department items): swag, voucher codes, perks ("lunch with a director," "late-start morning," priority parking week, charity donation made by the company in your name).
- **Redemption workflow:** request → approval queue (HR/Comms role) → fulfilled → user confirms receipt. Every state change audited.
- **Stock & limits:** per-item stock, per-user redemption limits, cool-downs.

### Schema additions
```sql
points_ledger(id, tenant_id, user_id, delta, reason_kind, reason_ref,
              balance_after, created_at)          -- append-only; balance derivable & cached
reward_items(id, tenant_id, node_scope ltree, title, description, image_key,
             cost, stock, per_user_limit, active, created_by)
redemptions(id, item_id, user_id, cost_at_purchase, state,   -- REQUESTED|APPROVED|FULFILLED|CONFIRMED|REJECTED|CANCELLED
            approver_id, fulfilled_at, audit jsonb)
```

### Governance flags (put these in the admin guide)
- Non-cash rewards can still be **taxable benefits** in some jurisdictions — the catalog ships with a banner telling HR to confirm with payroll/finance before adding high-value items. CES records redemption history exportable for payroll if needed.
- Points must never gate core voice features (you can't "spend points to submit a suggestion") and never appear in anything resembling performance evaluation. Enforced in the spec's "never do" list.

---

## 4. Simplified Architecture (v2 deltas only)

```
Desktop App (Tauri 2: Rust shell + React/TypeScript UI)
  • Windows x64 + macOS universal (Apple Silicon native)
  • OIDC login via system browser (PKCE)
        │
Single Server (TypeScript end-to-end: Node 22 + Fastify)
  • Modular monolith, same module boundaries as v1 §4
  • WebSockets (native ws) for realtime; aggregation in-process
  • BullMQ-style jobs replaced by pg-boss (Postgres-backed queue — no Redis)
        │
Docker Compose on the company server:
  postgres:16  •  minio  •  ces-server  •  caddy (TLS, internal certs)
        │
Anthropic API (the only external call, and it's optional/killable per policy)
```

**Why TypeScript end-to-end (server + UI):** one language = Claude Code moves faster, shares types from DB to UI (Drizzle ORM schema → API contracts via zod → React), and you review one ecosystem. Rust stays confined to the Tauri shell where you rarely touch it.

Everything else from v1 stands: ltree hierarchy, RLS, identity vault as a **separate Postgres database in the same Compose file with separate credentials**, hash-chained audit log, k-anonymity rendering, ports & adapters, AI service as an isolated module with redaction → Anthropic API.

---

## 5. The Rigorous Buildout Process Flow (you + Claude)

This is the steady, repeatable engine. It has three layers: a **daily loop**, a **feature gate checklist**, and a **phase plan**.

### 5.1 One-time setup (Days 1–3)
1. Create the monorepo exactly as v1 §10.2; write `CLAUDE.md` first — it is the constitution every Claude Code session obeys.
2. Have Claude scaffold: repo, Docker Compose, Drizzle + first migration (tenants, org_nodes, users, memberships, audit_log), CI that builds Win+mac artifacts and runs tests on every push.
3. Author the six custom skills from v1 §10.2 (module scaffolder, adapter scaffolder, migration writer, anonymity-checker, threat-model, realtime patterns). One session each; they pay for themselves within a week.
4. Set up the **two-session discipline**: Session A = builder, Session B = adversarial reviewer (fresh context, sees only spec + diff). Never let one session grade its own homework.

### 5.2 The daily loop (repeat until shipped)
```
MORNING  (you, 15 min)
  1. Pick ONE spec slice from the phase backlog (small enough to finish today)
  2. Write/refine the spec section: acceptance criteria, authz matrix,
     anonymity impact (even if "none"), failure modes

BUILD    (Claude Code, Session A)
  3. "Write failing tests from this spec section"        → review test names
  4. "Implement to green; small commits; follow CLAUDE.md" → watch, interrupt early
  5. Run the full check: typecheck + tests + lint + anonymity-check skill

REVIEW   (Claude, Session B — fresh context)
  6. Paste spec + diff: "Find boundary violations, authz gaps, injection,
     anonymity leaks, and spec mismatches. Be hostile."
  7. Feed findings back to Session A; repeat until B finds nothing material

CLOSE    (you, 15 min)
  8. You read the diff yourself — final merge is always human
  9. Claude updates docs/changelog; tick the gate checklist; push → CI green
 10. Log tomorrow's slice
```
Throughput expectation: 1 meaningful vertical slice/day solo. Resist batching — small slices are what keep Claude's output reviewable and your audit trail honest.

### 5.3 Feature gate checklist (nothing merges without all boxes)
- [ ] Spec section exists and was written *before* code
- [ ] Tests written first and now green (unit + at least one E2E happy path)
- [ ] Authz: every new endpoint has an explicit role/scope check + a test proving denial
- [ ] Anonymity-check skill passes (no forbidden columns, no content in logs, timestamp precision rules)
- [ ] Audit events emitted for privileged actions
- [ ] Migration is forward-only and rehearsed on a copy of the dev DB
- [ ] Adversarial session (B) signed off
- [ ] Docs/changelog updated by Claude, reviewed by you

### 5.4 Phase plan (solo-calibrated; ~16–20 focused weeks to pilot-complete)
| Phase | Weeks | Ships | Exit test |
|---|---|---|---|
| **0 Foundations** | 1–2 | Repo, CI, Compose stack, OIDC login + break-glass admin, 4-level hierarchy + CSV import, RBAC, audit chain, Tauri shell both OSes | You log in via Okta/Entra test tenant on a Mac *and* a Windows VM and see the org tree |
| **1 Live wedge** | 3–6 | Sessions, QR/code join + thin web join page, live polls w/ simultaneous viz, random picker, icebreakers, RPS, presenter view | Run a real stand-up with 10+ people; vote→chart < 1 s |
| **2 Voice** | 7–10 | Suggestion/brainstorm boxes + SLA workflow, votes, anonymous complaints (vault + claim tickets), routing engine (FORCED + MULTI) to HR/Comms queues, department dashboards | A test complaint travels submission→triage→resolution with zero identity anywhere; HR signs off |
| **3 Pulse + AI** | 11–13 | Pulse campaigns (3-question pops, throttle), wellness w/ k≥5, red-flag queue, AI service (theming, summaries, routing suggestions, icebreaker gen) with redaction + kill switch | Monthly pulse runs; AI spend visible per feature; pulling the AI kill switch breaks nothing |
| **4 Community + Rewards** | 14–17 | Recognition/history/memories, photo drop (consent, EXIF strip, moderation queue), competitions, 2 minigames + leaderboards, **M10 Rewards Shop**, plans + fundraising ledger, Opportunity Centre | First department competition runs end-to-end; a reward is requested, approved, fulfilled |
| **5 Hardening** | 18–20 | Load test (target: 2k concurrent in one session on the pilot box), backup/restore drill, retention worker, admin guide, deployment runbook for IT, per-department theming | Restore-from-backup rehearsed; IT installs from the runbook alone without calling you |

Later backlog (post-pilot, funded by pilot success): code signing certs, AD/LDAP + SCIM + BambooHR + SuccessFactors adapters, Redis for >5k-user realtime, SIEM export, natural-language analytics, admin copilot.

### 5.5 Weekly cadence (your only ceremonies)
- **Monday (30 min):** pick the week's slices from the phase backlog; ask Claude to flag risks/dependency order.
- **Friday (30 min):** demo to yourself or a pilot champion; Claude writes the week's progress note; re-run the risk table from v1 §14 and ask "what changed?"
- **End of each phase:** run the exit test literally. If it fails, the phase isn't done — no exceptions, no rolling debt forward silently.

---

## 6. Updated Open Items (small now)
1. Get an OIDC test tenant (Entra ID free tier or Okta developer account — both $0) in week 1.
2. Confirm the pilot server: any always-on box with Docker, 8 GB RAM, on the corporate network.
3. Decide the pilot department (your most enthusiastic team — the Phase 1 wedge lands there).
4. When the first budget beyond $100 appears: Apple Developer Program ($99) → Windows signing cert → Redis box, in that order.

*End of v2.0*
