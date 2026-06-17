# Corporate Engagement Suite (CES) — Master Build Plan

**Internal communications & interactivity platform for teams**
Version 1.0 (Final, after 3 internal review iterations — see §15)
Date: June 2026

---

## 1. Executive Summary

The Corporate Engagement Suite (CES) is a **secure, enterprise-grade desktop application** that turns internal communication into participation. It combines Mentimeter-style live polling, anonymous feedback channels, wellness pulse checks, team games, recognition, shared memories, and engagement planning — all scoped across the full organizational hierarchy (org → division → department → unit → team), with real-time visualization, audit-grade governance, customer-controlled data residency, and a deeply embedded but loosely coupled AI layer powered by Claude.

The plan below covers: product definition, module breakdown, system architecture, database design, anonymity engineering, security and compliance, enterprise integration strategy, the in-product Claude AI layer, the *development methodology using Claude* to build the product, a phased roadmap, risks, and an explicit iterative review log showing how the plan was stress-tested and what gaps were closed.

### Design pillars (everything below answers to these)

1. **Trust is the product.** Anonymity must be *provably* real (architecturally enforced, not policy-enforced), or every feedback feature dies on arrival.
2. **Fun with governance.** Playful surfaces (games, competitions, photo drops) sit on top of serious plumbing (RBAC, audit logs, retention, moderation).
3. **Loose coupling everywhere.** Enterprise integrations, the AI provider, the storage location, and even the real-time transport are all swappable adapters behind stable internal interfaces.
4. **Customer owns the data.** Three deployment/residency models (we host / customer cloud / customer on-prem sandbox) behind one storage abstraction — "portable data control."
5. **Hierarchy-native.** Every object in the system is scoped to a node in the org tree; expansion/breakout (whole-org → team) is a first-class query primitive, not a bolt-on filter.

---

## 2. Personas & Stakeholders

| Persona | Needs | Key features |
|---|---|---|
| **Employee (participant)** | Low-friction fun, safe voice, zero fear of being identified | Scan-to-play, games, polls, anonymous boxes, wellness check-ins |
| **Team Lead / Facilitator** | Run engaging stand-ups, pick people fairly, see team pulse | Session host tools, random picker, icebreakers, live results |
| **Department Manager** | Instant departmental insight, transparency on plans/funds | Dashboards, engagement plans, fundraising tracker, routed suggestions |
| **HR / People Ops** | Aggregate sentiment, wellness trends, complaint handling, compliance | Pulse analytics, anonymized wellness dashboards, complaint routing & case management |
| **Comms / Culture team** | Org-wide campaigns, competitions, recognition programs | Competition engine, recognition wall, campaign scheduler |
| **IT / Security** | Safe deployment, SSO, no data leakage, auditability | MSI/MSIX packaging, SSO/SCIM, audit logs, residency control, DLP posture |
| **Legal / Compliance / Works Council** | Lawful processing, retention, whistleblower protections | Retention policies, consent flows, anonymity guarantees, audit exports |
| **Executives** | Org health at a glance, adoption proof | Roll-up dashboards, participation metrics, eNPS trends |

---

## 3. Product Modules (the full feature inventory, organized)

The raw idea list maps into **9 coherent modules** plus 2 platform layers. Each module is independently deployable/toggleable per tenant and per org-node (a department can enable games while another disables them).

### M1 — Live Sessions & Play (the "Mentimeter + fun stand-ups" core)
- **Live polls & quizzes** with real-time result visualization (bar race, word cloud, scatter, emoji storm) rendered simultaneously on host screen and participant clients.
- **Scan-to-play**: host displays a QR code / short join code; participants join a session instantly from the desktop app (or a thin web join page for guests/meeting rooms — see Review Iteration 2).
- **Icebreakers**: random question generator (curated bank + Claude-generated, filtered), "two truths and a lie," speed-answer rounds.
- **Virtual rock-paper-scissors**: 1v1, bracket, and whole-room "last one standing" modes.
- **Random person picker**: fairness-aware (weighted to avoid picking the same person repeatedly; exclusion lists; "spin the wheel" animation).
- **Stand-up mode**: timer per speaker, randomized order, parking-lot capture, one-tap blocker flagging, end-of-standup auto-summary (AI).
- **Peer Q&A**: "Ask a question, another person answers" — question of the day routed to a random teammate ("What's your favourite snack?"), answers feed Team Memories.

### M2 — Voice & Feedback
- **Suggestion / Brainstorm box**: per-node boxes (team brainstorm vs. org-wide suggestions), optional anonymity, upvoting, status workflow (New → Under review → Planned → Done → Declined, with mandatory response SLA so boxes don't become graveyards).
- **Anonymous complaints box**: architecturally anonymous (see §7), severity triage, case management workflow, escalation paths, whistleblower-grade handling.
- **Voting**: standalone votes (name the meeting room, pick the outing date) with configurable ballot types (single, ranked-choice, approval) and quorum rules.
- **Periodic pulse data collection**: scheduled micro-surveys that "pop" **max 3 questions at a time**, frequency-capped per user (anti-fatigue throttle), with question rotation, eNPS tracking, and longitudinal trend analysis.

### M3 — Wellness
- **Wellness check-ins**: optional daily/weekly mood + energy + workload sliders; *always* anonymous-by-default at manager level.
- **Anonymous wellness mode**: results only visible as aggregates with **k-anonymity threshold (k ≥ 5)** — no chart renders until at least 5 responses exist in a scope.
- **Resource hub**: EAP links, wellness content, configurable per tenant.
- **Red-flag protocol** (added in Review Iteration 1): if free-text wellness/complaint content indicates risk of harm, route to a pre-configured HR/EAP escalation queue *without* identity attached, with the message shown to a trained human — never auto-actioned by AI alone.

### M4 — Community, Recognition & Memory
- **Team recognition + history**: kudos/shout-outs, event winner records, badges, a permanent "trophy cabinet" per node.
- **Team memories**: a chronological feed of moments (poll highlights, winners, quotes from peer Q&A).
- **Team photo drop**: shared photo wall with "On this day" resurfacing ("what was the team doing on this day last year"), consent-aware (subjects can request takedown), EXIF-stripped on upload, AI-moderated before publish.

### M5 — Competitions & Games
- **Mini team competitions**: "Red Shirt Day," "Blue Ties Friday" — themed challenge engine: define a challenge, submission types (photo, checkbox, score), judging mode (vote / judge panel / automatic), points and standings.
- **Minigames with leaderboards**: a small WASM-sandboxed game runtime (typing race, trivia, memory match, RPS ladder) with per-scope high-score leaderboards, season resets, and anti-cheat (server-authoritative scoring, rate limits, anomaly detection).
- **Recognition hooks**: competition winners auto-post to M4 history.

### M6 — Plans & Transparency
- **Team engagement plans**: outing planning (date votes, RSVP, task checklist, budget line items).
- **Fundraising transparency**: goal, contributions ledger (amounts visible, contributor identity optional), expense receipts, live progress bar — full visibility to all participants.
- **Opportunity Centre**: "found sum? share it" — a marketplace board for surplus budget, spare equipment, volunteer slots, cross-team help requests, internal gigs; claim/transfer workflow with approval and audit trail.

### M7 — Org Structure & Scoping
- **Hierarchy engine**: Org → Division → Department → Unit → Team (arbitrary depth supported), synced from HRIS/IdP via SCIM or managed manually.
- **Expand / break out**: any session, poll, competition, or dashboard can target one node, a subtree, multiple selected nodes, or the whole org; breakout splits a live session audience into child-node rooms and merges results back.
- **Cross-cutting groups** (Review Iteration 2): committees, ERGs, and project squads that don't fit the tree — modeled as tagged virtual nodes.

### M8 — Insight, Routing & Governance
- **Instant departmental information**: real-time dashboards per node — participation, sentiment trend, open suggestions, pulse results — pushed live (no refresh).
- **Routing engine**: suggestions/complaints/questions are routed by configurable rules. Supports **both** forced routing (compliance topics MUST go to HR/Legal) **and** multi-routing (a facilities suggestion fans out to Facilities + Finance). Rules: topic classifier (AI-assisted, human-overridable) + keyword + origin-node + severity. Every routing decision is written to the audit log.
- **Audit logs**: append-only, hash-chained, exportable (CSV/JSON/SIEM syslog), covering admin actions, routing decisions, data exports, moderation events, AI invocations (purpose + scope, never anonymous content), retention changes. Anonymous submissions are logged as *events without identity* — the audit system is structurally incapable of de-anonymizing.
- **Moderation suite** (Review Iteration 1): AI pre-screen + human queue for photos, suggestions, public answers; per-tenant policy packs; appeal flow.

### M9 — Admin & Tenant Console
- Tenant settings, module toggles per node, branding, question banks, retention schedules, residency configuration, integration connectors, role management, usage/adoption analytics, billing.

### Platform Layer A — AI Services (Claude) — see §8
### Platform Layer B — Integration Fabric — see §6

---

## 4. System Architecture

### 4.1 High-level topology

```
┌────────────────────────────── Client Tier ──────────────────────────────┐
│  Desktop App (Tauri shell + React/TS frontend)                          │
│   • Code-signed, auto-updating (signed manifests)                       │
│   • SSO via system browser (OIDC + PKCE) — no embedded credential UI    │
│   • Local encrypted cache (SQLite, offline-tolerant read views)         │
│   • Real-time channel: WebSocket w/ SSE fallback                        │
│  Thin Web Join Page (sessions only, for QR scan from meeting rooms)     │
│  Big-Screen Presenter View (host casts live results to room display)    │
└──────────────────────────────────────────────────────────────────────────┘
                                   │ mTLS / TLS 1.3
┌────────────────────────────── Edge Tier ────────────────────────────────┐
│  API Gateway (authn, rate limiting, tenant resolution, WAF)             │
│  Realtime Gateway (WebSocket fan-out, presence, session rooms)          │
└──────────────────────────────────────────────────────────────────────────┘
                                   │
┌─────────────────────────── Application Tier ────────────────────────────┐
│  MODULAR MONOLITH (start) with hard module boundaries, extracted to      │
│  services only when scale demands. Modules communicate via an internal   │
│  event bus (outbox → broker), never by reaching into each other's data. │
│                                                                          │
│  Core domains: Identity&Org | Sessions&Play | Feedback | Wellness |      │
│  Community | Competitions | Plans | Routing | Insights | Admin          │
│                                                                          │
│  Cross-cutting: AuthZ (policy engine), Audit, Notification, Moderation,  │
│  Scheduler (pulse pops, "on this day"), Export                          │
│                                                                          │
│  AI Service (isolated process): the ONLY component allowed to call the   │
│  LLM provider; enforces redaction, consent, quotas, logging.            │
└──────────────────────────────────────────────────────────────────────────┘
                                   │
┌────────────────────────────── Data Tier ────────────────────────────────┐
│  PostgreSQL (primary, RLS-enforced multi-tenancy)                        │
│  Identity Vault (separate DB/keys — pseudonym mapping, see §7)           │
│  Redis (sessions, presence, leaderboards, rate limits, pub/sub)          │
│  Object storage (photos/files, S3-compatible adapter)                    │
│  Analytics store (Postgres read replicas → optional ClickHouse later)    │
│  Message broker (NATS or RabbitMQ) + transactional outbox                │
└──────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Desktop technology decision

**Recommendation: Tauri (Rust shell) + React/TypeScript UI.**

| Criterion | Tauri | Electron |
|---|---|---|
| Binary size / RAM | ~10–20 MB / low | 150 MB+ / heavy |
| Attack surface | Smaller (system WebView, Rust core) | Larger (bundled Chromium + Node) |
| Corporate deployability | MSI/MSIX, code signing, silent install | Same, heavier |
| Ecosystem maturity | Good and growing | Very mature |
| Node-API access from renderer | None by default (safer) | Easy to misconfigure |

Electron remains an acceptable fallback if the team's skill base is Node-only, **but** with mandatory hardening: `contextIsolation: true`, `nodeIntegration: false`, strict CSP, sandboxed renderers, validated IPC schema. The frontend is built framework-agnostic to the shell, so the shell choice is itself loosely coupled.

Deployment: signed MSI/MSIX (Windows, SCCM/Intune), signed .pkg/.dmg (macOS, Jamf), .deb/.AppImage (Linux). Auto-update via signed update manifests with staged rollout rings (IT pilot → 10% → all), and an enterprise switch to disable auto-update where IT mandates managed rollout.

### 4.3 Real-time design
- Session rooms keyed by `session_id`; Redis pub/sub fans out to realtime gateway nodes; gateway is stateless and horizontally scalable.
- Vote ingestion path: client → gateway → idempotent write (dedupe on `(session_id, participant_token, question_id)`) → aggregate counters in Redis → throttled (250ms) broadcast of aggregates → periodic durable flush to Postgres.
- Presenter view and participant views receive **the same aggregate frames simultaneously** — satisfying "present visualisations same time."
- Backpressure: aggregates only (never per-vote events) are broadcast; word clouds are server-computed.

### 4.4 Deployment & data-residency models ("portable data control")

One codebase, three residency modes, selected per tenant:

| Mode | Where it runs | Who holds data | Typical buyer |
|---|---|---|---|
| **A. Vendor-hosted SaaS** | Our cloud, region-pinned | Us, encrypted, tenant-keyed | SMB, fast start |
| **B. Customer cloud ("host virtual")** | Customer's AWS/Azure/GCP account via Terraform/Helm | Customer entirely | Regulated mid/large |
| **C. On-prem / sandbox** | Customer datacenter or air-gapped sandbox, container images | Customer entirely | Gov, finance, "let us hold nothing" |

Enablers: everything ships as OCI containers + Helm charts; storage/queue/secrets accessed only through adapter interfaces (Postgres-compatible, S3-compatible, AMQP/NATS-compatible); feature flags degrade gracefully (e.g., in air-gapped Mode C, AI features can point to a customer-hosted gateway, run via Claude in the customer's cloud through AWS Bedrock/GCP Vertex, or switch off entirely). License + telemetry are privacy-respecting and optional in Modes B/C. A `residency.yaml` manifest per tenant declares region, mode, retention defaults, and AI egress policy — and the app's admin console displays it to the customer ("your data lives here, and here is the proof").

---

## 5. Database Design

**Primary store: PostgreSQL 16+.** Reasons: row-level security (RLS) for tenant isolation, `ltree` for hierarchy queries, JSONB for flexible poll/answer payloads, mature partitioning for audit/response volume, runs identically in all three residency modes.

### 5.1 Multi-tenancy strategy
- **Mode A (SaaS):** shared database, `tenant_id` on every row + **RLS policies enforced at the database level** (the app sets `SET app.tenant_id` per connection; no query can cross tenants even if application code is buggy). Largest tenants can be promoted to dedicated schemas/databases.
- **Modes B/C:** single-tenant database; same schema, RLS still on (defense in depth).

### 5.2 Core schema (selected DDL-level detail)

**Identity & org**
```sql
tenants(id, name, residency_mode, region, settings jsonb, created_at)

org_nodes(
  id uuid pk, tenant_id, parent_id fk, node_type        -- ORG|DIVISION|DEPARTMENT|UNIT|TEAM|VIRTUAL
, name, path ltree, external_ref text                    -- HRIS id for sync
, settings jsonb, archived_at
)
-- ltree 'path' gives O(index) subtree queries:
--   WHERE path <@ 'acme.sales' → everything under Sales. This single
--   column powers the entire expand/break-out capability.

users(id uuid pk, tenant_id, idp_subject, email_hash, display_name,
      avatar_url, locale, status, created_at)            -- profile only; auth lives in IdP

memberships(user_id, node_id, role, valid_from, valid_to)  -- temporal: history preserved
roles(id, tenant_id, name, permissions jsonb)              -- RBAC + node-scoped grants
```

**Sessions & play**
```sql
sessions(id, tenant_id, node_scope ltree[], host_id, kind,   -- POLL|QUIZ|STANDUP|ICEBREAKER|GAME|BREAKOUT
         join_code, qr_token, state, config jsonb, parent_session_id, started_at, ended_at)
session_participants(session_id, participant_token,          -- pseudonymous per-session token
         user_id nullable,                                    -- NULL when session is anonymous mode
         joined_at)
questions(id, session_id, ord, kind,                          -- MC|WORDCLOUD|SCALE|OPEN|RPS|RANKED
          prompt, options jsonb, settings jsonb)
responses(id, question_id, participant_token, payload jsonb, created_at)
  PARTITION BY RANGE (created_at);                            -- high volume
leaderboards(id, tenant_id, game_id, scope ltree, season, settings)
scores(leaderboard_id, user_id, score, evidence jsonb, created_at)  -- server-computed only
```

**Feedback, pulse & wellness** *(anonymity-critical — see §7 for the vault pattern)*
```sql
boxes(id, tenant_id, node_scope, kind,                        -- SUGGESTION|BRAINSTORM|COMPLAINT
      anonymity_mode,                                          -- OPTIONAL|FORCED_ANON|IDENTIFIED
      sla_days, settings)
submissions(id, box_id, body, category, status, severity,
      pseudonym_ref nullable,                                  -- opaque vault ref; NEVER user_id
      created_day date)                                        -- DAY precision only for anon items
submission_events(submission_id, actor_id, event, note, created_at)  -- case management trail
votes(target_kind, target_id, voter_ref, value, created_at)

pulse_campaigns(id, tenant_id, node_scope, cadence, max_questions int default 3,
      quiet_hours jsonb, start_on, end_on)
pulse_questions(id, campaign_id, prompt, kind, ord, active)
pulse_responses(id, question_id, cohort_key,                   -- e.g. node+week bucket, k-anon enforced
      value jsonb, created_week date)                          -- WEEK precision; no user link

wellness_checkins(id, tenant_id, cohort_key, mood smallint, energy smallint,
      workload smallint, note_redacted text, created_week date)
escalations(id, tenant_id, source_kind, source_id, severity, queue,
      state, assigned_to, created_at)                          -- red-flag protocol, identity-free
```

**Community, plans, competitions**
```sql
recognitions(id, tenant_id, node_id, kind, title, body, awarded_to jsonb, event_ref, created_at)
memories(id, tenant_id, node_id, kind, payload jsonb, occurred_on, created_by)
photos(id, tenant_id, node_id, object_key, caption, taken_on, uploaded_by,
       moderation_state, consent_state, exif_stripped bool default true)
photo_tags(photo_id, user_id, consent)                          -- subjects can revoke → auto-blur/remove

competitions(id, tenant_id, node_scope, title, rules jsonb, scoring_mode,
       starts_at, ends_at, state)
competition_entries(id, competition_id, node_id, submitted_by, payload jsonb,
       points, moderation_state)

plans(id, tenant_id, node_id, kind,                             -- OUTING|FUNDRAISER|EVENT
      title, budget_total, state, settings)
plan_items(plan_id, kind, title, amount, receipt_object_key, visibility, created_by)
contributions(plan_id, amount, contributor_id nullable, public_name nullable, created_at)
opportunities(id, tenant_id, node_scope, kind,                  -- SURPLUS|EQUIPMENT|HELP|GIG
      title, body, value_estimate, state, posted_by, claimed_by, approved_by)
```

**Governance & platform**
```sql
routing_rules(id, tenant_id, source_kind, predicate jsonb,      -- topic/keyword/origin/severity
      mode,                                                      -- FORCED|MULTI|SUGGESTED
      destinations jsonb, priority, active)
routing_decisions(id, rule_id, source_id, destinations jsonb,
      classifier_meta jsonb, decided_by, created_at)             -- 'decided_by': RULE|AI|HUMAN

audit_log(id bigserial, tenant_id, actor_kind, actor_id nullable,
      action, target_kind, target_id, meta jsonb,
      prev_hash bytea, hash bytea, created_at)
  PARTITION BY RANGE (created_at);
-- hash = SHA256(prev_hash || canonical(row)) → tamper-evident chain;
-- daily anchor hash exported to customer-controlled storage in Modes B/C.

integrations(id, tenant_id, provider, kind, config_encrypted, scopes, state, last_sync_at)
ai_jobs(id, tenant_id, purpose, scope, model, tokens_in, tokens_out,
      redaction_report jsonb, status, created_at)                -- AI observability, no content stored
retention_policies(tenant_id, object_kind, ttl, action)          -- DELETE|ANONYMIZE|ARCHIVE
notifications(id, tenant_id, user_id, channel, payload, state, created_at)
```

### 5.3 Database principles
- **Hierarchy queries:** `ltree` + GiST index; scope arrays (`node_scope ltree[]`) let one poll target multiple subtrees; closure-table fallback documented if a customer DB lacks `ltree`.
- **Hot-path separation:** live vote counting lives in Redis; Postgres receives batched durable writes. Leaderboards are Redis sorted sets snapshotted hourly.
- **Append-only where it matters:** audit_log, submission_events, contributions, routing_decisions — no UPDATE/DELETE grants for the app role on these tables.
- **Time-bucketing for anonymity:** anonymous artifacts store `created_day`/`created_week` instead of timestamps to defeat timing correlation.
- **Partitioning & retention:** responses, audit_log, notifications partitioned monthly; retention worker enforces `retention_policies` and writes its own audit entries.
- **Migrations:** versioned (sqitch/Flyway), forward-only, rehearsed against all three residency modes in CI.

---

## 6. Integration Fabric (flawless but never tightly coupled)

### 6.1 The pattern: Ports & Adapters + Anti-Corruption Layer
Every external system is reached only through a **port** (an internal interface owned by CES) implemented by a **connector adapter** (a versioned plugin). Core domain code never imports a vendor SDK. Adapters translate vendor payloads into CES's canonical models at the boundary (anti-corruption layer), so a Workday quirk never leaks into the schema.

```
Domain code → Port (interface) → Connector adapter → Vendor API
                          ↑ configured per tenant, hot-swappable
```

### 6.2 Ports and their first adapters

| Port | Purpose | Launch adapters | Later |
|---|---|---|---|
| `IdentityProvider` | SSO (OIDC/SAML), token validation | Microsoft Entra ID, Okta, Google | Ping, ADFS, Keycloak |
| `DirectorySync` | Org tree + users via SCIM 2.0 / delta sync | Entra, Okta SCIM, CSV import | Workday, SAP SF, BambooHR |
| `Messaging` | Notifications, session invites, deep links | MS Teams, Slack, SMTP | Google Chat, webhooks |
| `Calendar` | Schedule sessions/outings, free-busy | M365 Graph, Google Calendar | iCal feed |
| `Storage` | Object storage abstraction | S3, Azure Blob, GCS, MinIO (on-prem) | — |
| `LLM` | AI capability (see §8) | Anthropic API, AWS Bedrock (Claude), GCP Vertex (Claude) | customer gateway |
| `SIEM/Audit export` | Push audit events | Syslog/CEF, Splunk HEC, Sentinel | QRadar |
| `HRCase` (optional) | Escalate complaints to HR systems | ServiceNow HR, email queue | Workday Help |
| `SecretsProvider` | Connector credentials | Vault, AWS/Azure/GCP secret stores | — |

### 6.3 Coupling guardrails
- **Async by default:** outbound effects (notify Teams, sync calendar) flow through the event bus with retries + dead-letter queues; an integration outage never blocks a poll.
- **Inbound webhooks** are verified (signatures), normalized, then dropped onto the bus.
- **Contract tests per adapter** run in CI against vendor sandboxes/mocks; adapters are versioned and can be pinned per tenant.
- **Graceful degradation matrix:** every feature documents its behavior when each dependency is down (e.g., DirectorySync down → org tree read-only from last sync; LLM down → AI buttons hidden, manual paths remain).
- **No vendor IDs in core tables** beyond `external_ref` strings; deletion of a connector never orphans domain data.

---

## 7. Anonymity & Privacy Engineering (the trust core)

This deserves its own section because suggestion boxes, complaints, pulse, and wellness all die if employees suspect identification is possible.

1. **Identity Vault separation.** When an anonymous-capable feature needs continuity (e.g., "let the submitter see replies to their complaint"), the app stores only a `pseudonym_ref`. The mapping `pseudonym_ref → user` lives in a **separate database with separate credentials and separate encryption keys**, accessible only by a minimal "vault service" with two-person-rule admin access. In FORCED_ANON boxes, **no mapping is created at all** — the submitter holds a client-side claim ticket (random capability token) to check status.
2. **Structural non-logging.** Anonymous endpoints are served by routes exempted from access-log user attribution; gateway strips user identifiers before forwarding; IPs are never written for these routes. Verified by automated tests that grep the entire log pipeline in CI.
3. **k-anonymity rendering.** Aggregates (wellness, pulse, anonymous polls) refuse to render below k=5 (tenant-configurable upward, never below 5); small-cell suppression also applies to *differences* between time periods (to stop subtraction attacks).
4. **Timing & linguistic defenses.** Day/week-precision timestamps (§5.3); optional AI **style-neutral rewrite** offered to the submitter ("rewrite to protect my writing style") — performed client-initiated, shown for approval, original discarded.
5. **Metadata hygiene.** EXIF stripped from all uploads; documents flattened; client telemetry excludes content.
6. **Honest UI.** Every input field states exactly what is recorded ("Anonymous: we store your text and your department, nothing else"). Over-claiming anonymity is a fireable offense in the spec.
7. **Aggregate-only AI.** Sentiment/theming AI runs over batched, redacted corpora; outputs are themes and counts, never "who wrote this."
8. **Legal alignment.** GDPR + Jamaica Data Protection Act (2020) + works-council-friendly defaults: lawful basis register, DPIA template shipped with the product, data-subject request tooling (export/delete with anonymity-preserving carve-outs), whistleblower-directive-compatible complaint handling (EU tenants).

---

## 8. AI Layer — Claude inside the product

### 8.1 Architecture
A single isolated **AI Service** owns the `LLM` port. Nothing else in the system may call a model. It enforces, in order:

```
request → purpose check (allow-listed use cases per tenant)
        → consent/policy check (tenant AI egress policy from residency.yaml)
        → PII/identifier redaction pass (deterministic + NER)
        → prompt assembly from versioned prompt registry
        → provider adapter (Anthropic API | Bedrock | Vertex | customer gateway)
        → output guard (schema validation, moderation, no-identity check)
        → ai_jobs audit record (purpose, scope, token counts — never content)
```

- **Model strategy:** Claude Haiku-class for high-volume/low-stakes (icebreaker generation, tagging, autocomplete); Sonnet-class for summarization, theming, routing classification; batch API for nightly digest jobs. Prompt caching for the large static system prompts (policy packs, taxonomies).
- **Structured outputs everywhere:** classification and routing prompts demand strict JSON; responses are schema-validated and fall back to "needs human" on parse failure.
- **Human-in-the-loop:** AI may *suggest* routing, moderation verdicts, and red-flag escalation; humans confirm anything consequential. AI never de-anonymizes, never evaluates individuals, never feeds performance management — enforced by purpose allow-list and contractually in the customer agreement.

### 8.2 In-product AI use cases (mapped to modules)
| Use case | Module | Notes |
|---|---|---|
| Icebreaker & question generation (tone/topic/locale aware) | M1 | curated-bank fallback offline |
| Stand-up auto-summary + action item extraction | M1 | opt-in per session |
| Suggestion theming & duplicate clustering | M2 | aggregate-only |
| Complaint topic classification + severity triage suggestion | M2/M8 | human confirms |
| Routing classifier (forced/multi-routing predicates) | M8 | logged with confidence |
| Pulse/wellness trend narratives ("what changed this month") | M2/M3 | k-anon aggregates only |
| Photo & content moderation pre-screen | M4/M5 | human queue for borderline |
| Natural-language analytics ("show participation by unit, Q2") | M8 | text-to-chart over the analytics store |
| Style-neutral rewrite for anonymous submitters | M2 | client-initiated, §7.4 |
| Competition idea generator, recognition draft writer | M5/M4 | fun, low stakes |
| Admin copilot (configure a pulse campaign from a sentence) | M9 | produces config diff for review |

### 8.3 Cost, safety, observability
Per-tenant token budgets and rate limits; cached prompt prefixes; nightly batch jobs; evaluation harness with golden datasets for the routing/moderation classifiers (precision/recall tracked per release); red-team suite for prompt injection via user content (all user content is delimited and treated as data, never instructions); kill switch per use case per tenant.

---

## 9. Security & Compliance

**Identity & access**
- SSO only (OIDC Auth Code + PKCE via system browser; SAML for legacy). No passwords stored, ever. SCIM deprovisioning revokes sessions within minutes.
- RBAC with node-scoped roles (TenantAdmin, NodeAdmin, Facilitator, HRCaseHandler, Auditor, Member, Guest) + policy engine (Cedar/OPA style) for ABAC rules like "HRCaseHandler can read complaint bodies only in assigned cases."
- Short-lived access tokens (15 min) + rotating refresh tokens bound to device keys stored in OS keychain/TPM where available.

**Application & data**
- TLS 1.3 everywhere; AES-256-GCM at rest; per-tenant data-encryption keys via envelope encryption (KMS adapter per residency mode); field-level encryption for complaint bodies and vault mappings.
- Desktop hardening: code signing + notarization, signed auto-update manifests, CSP, IPC schema validation, no remote code eval, dependency SBOM (CycloneDX) shipped with every release.
- API: input validation at the edge (JSON Schema), idempotency keys on mutations, per-user and per-tenant rate limits, audit on every privileged call.
- Anti-cheat & anti-abuse: server-authoritative game scores, vote dedupe, anomaly detection on leaderboards, profanity/abuse filters with human appeal.

**Operations**
- Secrets in Vault/KMS adapters; zero secrets in code or config files.
- Observability: OpenTelemetry traces/metrics/logs, content-free by default; SLOs (poll vote p99 < 300 ms ingest-to-broadcast; dashboard freshness < 2 s).
- Backups: encrypted, tested restores quarterly; DR targets RPO ≤ 15 min, RTO ≤ 4 h (Mode A); runbooks shipped to Mode B/C customers.
- SDLC: threat modeling per module (STRIDE), SAST/DAST/dependency scanning in CI, annual external pen test, signed releases, vulnerability disclosure policy.
- Compliance roadmap: SOC 2 Type II (year 1), ISO 27001 (year 2), GDPR/Jamaica DPA/CCPA mappings, DPIA + DPA templates, accessibility WCAG 2.2 AA.

---

## 10. Building CES *with* Claude — the development methodology

You asked for a plan to "use Claude LLM to create this perfectly." Perfection comes from process, not prompts — the method below makes Claude a force multiplier inside a rigorous loop.

### 10.1 Toolchain
- **Claude Code** (CLI/desktop) as the primary agentic builder, working in a monorepo.
- **Claude API** for custom internal tooling: spec-lint bots, PR review assistants, test generators.
- **MCP servers** wired into Claude Code: Postgres (schema introspection), GitHub (issues/PRs), Figma (design tokens), Playwright (E2E driving), the staging API — so Claude can read real state instead of guessing.
- **CI gatekeepers Claude must satisfy like any engineer:** type checks, tests, coverage floors, SAST, contract tests, migration rehearsal.

### 10.2 Repository & context engineering
```
/ces
  CLAUDE.md                  ← project constitution (see below)
  /docs/adr/                 ← architecture decision records (Claude reads & writes these)
  /docs/specs/               ← one spec per module, the source of truth
  /packages/domain/<module>/ ← modular monolith, enforced boundaries (dep-cruiser rules)
  /packages/ports/           ← integration interfaces
  /packages/adapters/<vendor>/
  /apps/desktop/  /apps/server/  /apps/join-web/
  /skills/                   ← custom Claude skills (below)
  /prompts/                  ← versioned in-product AI prompts + eval datasets
  /infra/ (terraform, helm)  /db/migrations/
```
**CLAUDE.md contents:** stack versions, module boundary rules, "never do" list (no vendor SDK in domain code, no UPDATE on append-only tables, no user_id in anonymity-critical tables, no console logging of content), testing conventions, definition of done, how to run everything locally.

**Custom skills to author for Claude Code** (each a SKILL.md + scripts):
1. `ces-module` — scaffolds a new domain module with boundaries, tests, fixtures.
2. `ces-adapter` — scaffolds a connector against a port, with contract tests + sandbox config.
3. `ces-migration` — writes forward-only migrations, rehearses against all 3 residency modes, checks RLS coverage.
4. `ces-anonymity-check` — static checks: forbidden columns, log-pipeline grep, timestamp precision rules.
5. `ces-threat-model` — STRIDE pass template per feature, outputs mitigations into the spec.
6. `ces-realtime` — patterns for session rooms, idempotent ingestion, aggregate broadcast.

### 10.3 The working loop (every feature, no exceptions)
1. **Spec first.** Human writes intent; Claude expands `/docs/specs/<feature>.md`: user stories, API contracts (OpenAPI), data changes, authz matrix, anonymity impact, failure modes, telemetry, acceptance criteria. Human reviews and signs off — *the spec, not the chat, is the contract.*
2. **Test scaffold.** Claude generates failing tests from acceptance criteria (unit + contract + Playwright E2E for the desktop flow).
3. **Implement.** Claude Code implements to green, in small reviewed PRs (≤ ~400 lines), each PR referencing the spec section it satisfies.
4. **Adversarial pass.** A *separate Claude session with a reviewer persona* (fresh context, given only spec + diff) hunts for boundary violations, authz gaps, injection paths, anonymity leaks. Findings become PR comments.
5. **Human review & merge.** Humans own merges, ADRs, and anything touching the vault, authz, or migrations.
6. **Eval & document.** For AI-layer features, run the prompt eval harness; Claude updates docs/runbooks/changelog.

### 10.4 Division of labor
- **Claude excels at:** scaffolding, exhaustive test matrices, adapter implementations against well-defined ports, migrations, documentation, refactors within boundaries, finding inconsistencies between spec and code.
- **Humans must own:** the anonymity architecture, key management, authz policy review, vendor/legal decisions, UX taste, production access, and final security sign-off.
- **Rule of two:** no AI-authored change to security-critical paths (vault, authz, audit chain, crypto) merges without two human approvals.

### 10.5 Suggested team & cadence
Lean build team: 1 product lead, 1 staff engineer/architect, 2–3 engineers pairing with Claude Code, 1 designer, fractional security engineer + counsel. Two-week iterations; each iteration ships at least one vertical slice end-to-end (DB → API → realtime → desktop UI → tests → docs).

---

## 11. Roadmap (phased, each phase shippable)

**Phase 0 — Foundations (weeks 1–6)**
Monorepo, CI/CD, CLAUDE.md + skills, identity (OIDC SSO), org hierarchy + ltree scoping, RBAC/policy engine, audit chain, desktop shell with auto-update, telemetry, threat model v1.
*Exit:* a signed desktop app that logs in via Entra/Okta and renders the org tree.

**Phase 1 — Live Engagement MVP (weeks 7–14)**
M1 core: sessions, scan-to-play (QR + join code + thin web join), live polls with simultaneous visualization, random picker, icebreaker bank, RPS; Redis realtime path; presenter view; basic Teams/Slack notify.
*Exit:* a real department runs Mentimeter-style stand-ups end-to-end. **This is the adoption wedge.**

**Phase 2 — Voice & Governance (weeks 15–24)**
M2: suggestion/brainstorm boxes with workflow + SLA, votes; anonymous complaints with identity vault + claim tickets; routing engine (forced + multi) with audit; M8 dashboards (instant dept info); moderation suite v1; retention engine.
*Exit:* HR pilots the complaint workflow; legal signs off the anonymity design.

**Phase 3 — Pulse, Wellness & AI (weeks 25–32)**
Pulse campaigns (3-question pops, throttling, eNPS), wellness check-ins with k-anonymity, red-flag protocol; AI service + first use cases (theming, summaries, routing classifier, icebreaker generation); natural-language analytics beta.
*Exit:* monthly org pulse running; AI evals green; DPIA completed.

**Phase 4 — Community & Competition (weeks 33–42)**
M4 recognition/history/memories/photo drop (consent + moderation + "on this day"); M5 competitions + minigame runtime + leaderboards with anti-cheat; M6 plans, fundraising transparency, Opportunity Centre.
*Exit:* first org-wide competition runs with automated recognition.

**Phase 5 — Enterprise depth (weeks 43–52)**
Residency Modes B/C GA (Terraform/Helm, air-gap docs), SCIM directory sync GA, SIEM export, HR case adapter, admin copilot, SOC 2 audit window opens, performance hardening (10k-participant org-wide live session load test).

Adoption workstream runs in parallel from Phase 1: champion program, facilitator training kits, launch playbooks per department, success metrics (see §13).

---

## 12. Non-Functional Requirements (acceptance bar)

- **Scale:** 50k users/tenant; 10k concurrent participants in one org-wide session; 5k votes/sec burst.
- **Latency:** vote→visualization p99 < 500 ms end-to-end; dashboard data freshness < 2 s; app cold start < 3 s.
- **Availability:** 99.9% (Mode A); offline tolerance in desktop (read cache + queued non-anonymous actions; anonymous actions are never queued locally).
- **Accessibility:** WCAG 2.2 AA including presenter views; full keyboard play for games where feasible; reduced-motion modes.
- **Internationalization:** full i18n/l10n framework from Phase 0; AI features locale-aware.
- **Supportability:** every error user-reportable with a content-free diagnostic bundle.

---

## 13. Success Metrics

Adoption: WAU/MAU per node, % teams running ≥1 live session/week, scan-to-play conversion.
Voice: suggestions per 100 employees, % answered within SLA, complaint resolution time, pulse response rate (target ≥ 60%) and trend.
Culture: recognition events per month, competition participation, photo-drop consent acceptance rate.
Trust (the one that matters most): anonymous-channel usage trend, "I trust this tool" pulse item ≥ 75% favorable, zero substantiated anonymity incidents.
Platform: SLO attainment, AI classifier precision/recall, cost per active user.

---

## 14. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Employees distrust anonymity → silence | High | Critical | §7 architecture + third-party attestation of the anonymity design, published to employees; transparent UI claims |
| Engagement fatigue / gimmick decay | High | High | Frequency caps, pulse throttle, seasonal content, facilitator playbooks, measure & prune unused features |
| Leaderboards/competitions turn toxic | Medium | Medium | Team-based (not individual) defaults, opt-in individual boards, season resets, conduct policy hooks |
| Complaint box becomes legal liability | Medium | High | Case-management workflow, counsel-reviewed retention, whistleblower-compatible process, training for handlers |
| Integration sprawl breaks "loose coupling" | Medium | High | Ports/adapters discipline enforced by dep-cruiser CI rules; contract tests; no roadmap promises without a port design |
| AI misclassification routes a complaint wrong | Medium | High | Human confirmation on consequential routing; confidence thresholds; eval harness; full decision audit |
| Desktop estate friction (IT rollout) | Medium | Medium | MSI/MSIX + Intune/SCCM docs, pilot rings, thin web join page keeps sessions usable before install |
| Works council / regulator objection | Medium | High | DPIA shipped, k-anonymity defaults, no individual analytics ever, consultation pack for councils |
| Scope explosion (this feature list is huge) | High | High | Phased roadmap with hard exit criteria; modules toggleable; Phase 1 wedge first |
| LLM provider/cost shock | Low | Medium | LLM port with 3 adapters incl. customer gateway; budgets, caching, batch, kill switches |

---

## 15. Iterative Review Log (how this plan was stress-tested)

**Iteration 1 — gap analysis of the raw concept.** Findings → fixes:
- *No moderation story* for photos, suggestions, public answers → added Moderation Suite (M8) + consent model on photos.
- *No lifecycle* for suggestions (boxes become graveyards) → status workflow + response SLA + answered-rate metric.
- *Wellness/complaints had no duty-of-care path* → red-flag escalation protocol, identity-free, human-handled.
- *Audit logs claimed but not tamper-evident* → hash-chained append-only design with external anchoring.
- *"Force depts to route? or multi-routing?"* resolved: support **both** as rule modes (FORCED for compliance topics, MULTI for fan-out), every decision audited.
- *Retention/legal hold unaddressed* → retention_policies engine + DPIA + whistleblower-directive alignment.
- *No backup/DR, no observability* → §9 operations added with explicit RPO/RTO and SLOs.

**Iteration 2 — adversarial review of the v0.2 plan.** Findings → fixes:
- *Desktop-only contradicts scan-to-play* (guests/meeting-room phones can't install an MSI) → added thin web join page for sessions only; desktop remains the full product.
- *Tree-only hierarchy fails for ERGs/committees/project squads* → virtual nodes (M7).
- *Subtraction attacks on k-anonymous aggregates* (compare week N vs N+1 to isolate one person) → small-cell suppression on deltas.
- *Writing-style de-anonymization* → optional style-neutral rewrite (§7.4).
- *Leaderboard cheating & toxicity* → server-authoritative scoring, anomaly detection, team-based defaults.
- *Engagement fatigue* → pulse throttle (max 3 questions, quiet hours), notification budgets per user.
- *Air-gapped Mode C breaks AI* → LLM port with customer-gateway/Bedrock/Vertex adapters + graceful AI-off degradation.
- *Adoption is not automatic* → parallel adoption workstream, facilitator kits, Phase-1 wedge strategy.

**Iteration 3 — final completeness pass.** Findings → fixes:
- *Offline behavior undefined* → read-cache + queued actions, with anonymous actions explicitly never queued (privacy).
- *Accessibility & i18n missing* → NFRs §12, Phase 0 framework requirement.
- *No success definition* → §13 metrics, with trust as the headline metric.
- *Cross-residency migration testing* → migrations rehearsed against all three modes in CI.
- *AI prompt injection via user content* → red-team suite, content-as-data delimiting, output guards (§8.3).
- Remaining open questions deliberately left open (below) — they require stakeholder answers, not more planning.

**Verdict:** the plan is now internally consistent, every raw-idea item maps to a module, every module has a data home, a security posture, an AI touchpoint where useful, and a delivery phase. Remaining uncertainty is concentrated in the open questions — which is exactly where it should be.

---

## 16. Open Questions for Stakeholders (answer before Phase 0 ends)

1. **First deployment target:** which OS mix and MDM (Intune? Jamf?) — drives packaging priority.
2. **Residency mode for the launch customer:** A, B, or C? (C pulls infra work forward.)
3. **IdP and HRIS in production:** Entra/Okta? Workday/BambooHR/CSV? — fixes the first two adapters.
4. **Mobile companion app:** explicitly out of scope for v1 (thin web join covers meetings) — confirm, because it's the most common follow-up request.
5. **Complaint handling ownership:** HR, Legal, or an ethics office? Determines routing defaults and training.
6. **Fundraising money handling:** ledger-only transparency (recommended) vs. actual payment processing (pulls in PCI scope — recommend against for v1).
7. **AI egress posture of the launch customer:** Anthropic API direct, Bedrock/Vertex in their cloud, or off?
8. **Branding/white-label depth** per division?
9. **Budget & team size confirmation** against the 52-week roadmap (compressible by ~30% with a larger team or a narrower Phase 4).

---

*End of plan — v1.0*
