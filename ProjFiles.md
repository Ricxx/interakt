# Corporate Engagement Suite — Plan v3.0 ("The Participation Layer")

Builds on v1.0 (architecture/modules) and v2.0 (solo-builder scope, locked decisions).
v3 changes the product thesis based on research into why internal comms tools fail, adds the features that make CES a must-have, kills features that are bloat, and locks open-source build-vs-borrow decisions.

---

## 1. What the Research Says (and what CES must do about it)

| # | Finding (sources) | Implication | CES design response |
|---|---|---|---|
| 1 | **Inaction fatigue is the #1 killer.** McKinsey-reviewed studies: the top driver of "survey fatigue" is the belief the org won't act. Only ~7% of employees say their company acts on feedback well; engagement roughly **doubles** when employees see feedback acted on. (Qualtrics, Tivian, Perceptyx, Forvis Mazars) | Collecting feedback without visible action *actively damages* trust. Most tools stop at collection. | **The Action Ledger (§2.1)** — a public "You Said → We Did" closed loop becomes the flagship of the entire product. |
| 2 | **Measurement is the #1 internal-comms team pain.** ~50% of communicators lack tools to measure; only ~20% are confident in their measurement. (Workshop 2025 trends, Axios HQ) | Comms teams can't prove impact, so they can't get budget or improve. | **Broadcast & Measure module (§2.2)** — every announcement gets reach/read/ack/sentiment analytics natively. |
| 3 | **Leaders overestimate their own transparency.** 45% of leaders say they proactively engage tough topics; only 23% of employees agree. (Axios HQ) | A perception gap no newsletter fixes. | **Leadership AMA (§2.3)** — anonymous, upvoted questions; answer rate publicly tracked. |
| 4 | **Frontline/non-desk workers are abandoned.** Only 9% of non-desk employees are very satisfied with internal comms; crisis comms rated poor by a third in some sectors. (Staffbase/YouGov 2025) | A desktop-only app misses break rooms, floors, depots. | **TV/Kiosk Channel (§2.4)** — a zero-login big-screen mode for shared spaces; web join page already covers phones. |
| 5 | **Information overload & channel chaos.** ~25% of leaders cite overload as the barrier; comms teams juggle email + intranet + Teams + events. (Axios HQ, Workshop) | Another feed = part of the problem. | CES is **a participation layer, not a feed** (§3) + **AI Weekly Digest (§2.5)** that compresses, never adds. |
| 6 | **Intranets fail through staleness, top-down publishing, complexity, and no perceived value.** Employees return to old habits when content is stale or the tool doesn't help them *do* anything. (Simpplr, Happeo, ThoughtFarmer, Lightspeed) | Content must generate itself bottom-up; every screen must let you *act*, not read. | Memories/photo drops/Q&A auto-generate living content; freshness jobs archive stale items; 2-click rule (§3). |
| 7 | **Trust and transparency drive everything** — transparent communication measurably builds commitment and satisfaction. (PoliteMail 2026) | Trust features are not "nice"; they're the engine. | v1 §7 anonymity architecture stays sacred; Action Ledger + AMA + fundraising ledger all compound it. |

**The reframed one-line pitch:** *Every other tool helps the company talk. CES proves the company listens.*

---

## 2. New & Upgraded Flagship Features

### 2.1 The Action Ledger ("You Said → We Did") — THE differentiator
Upgrade of the v1 suggestion-SLA workflow into the product's centerpiece:
- Every suggestion, complaint theme, pulse insight, and AMA question enters a **public ledger** scoped to its node: *Raised → Acknowledged → In progress → Done / Declined (with reason)*.
- **Declines are first-class.** "No, because X" builds more trust than silence; templates make a respectful decline a 60-second job.
- **Acted-on rate** is computed per department and shown on its dashboard — leaders are accountable by design, gently and publicly.
- **Loop-closing notifications:** everyone who voted for a suggestion is notified when its status changes — the moment that converts skeptics.
- Quarterly **"You said / We did" auto-report** (AI-drafted from ledger data) ready for town halls.
- Anonymous items participate fully: the claim-ticket holder gets status updates without identity ever existing.

### 2.2 M11 — Broadcast & Measure (new module; fixes a real gap)
v1/v2 had no way to *send* communication — only to collect it. An internal comms platform needs both halves:
- **Announcements** targeted by org scope, with priority levels; rendered in-app, on kiosk screens, and mirrored to Teams/Slack via the Messaging port.
- **Acknowledgment tracking** for must-read items ("I've read the new safety policy") — exportable for compliance.
- **Crisis mode:** a break-glass broadcast that overrides quiet hours, demands ack, and shows a live "reached/acked" board — directly answering the research on poor crisis comms.
- **Measurement studio:** per-message reach, read time, ack rate, reaction sentiment, and — uniquely — *downstream participation* ("this announcement drove 40 pulse responses and 12 suggestions"). This is the measurement story ~50% of comms teams say they lack.
- **AI writing assist:** drafts concise, scannable versions (leaders name "writing concisely" a top difficulty), suggests reading level, flags jargon. Human always sends.

### 2.3 Leadership AMA
- Recurring or ad-hoc AMA spaces per scope: employees submit questions (anonymous by default), everyone upvotes, leaders answer in text or short video.
- **Answer rate and median time-to-answer are public.** Unanswered top-voted questions stay visibly pinned — polite, relentless accountability.
- AI clusters duplicate questions and drafts a briefing pack for the leader.
- Feeds the Action Ledger when an answer implies a commitment.

### 2.4 TV / Kiosk Channel
- A URL the IT team opens fullscreen on any break-room TV, lobby screen, or factory floor display (the join-web app in display mode — near-zero extra code).
- Rotates: live poll results during sessions, recognition shout-outs, competition standings, photo-drop highlights, announcements, "you said / we did" wins.
- QR code permanently in the corner → scan-to-participate from any phone. This is how CES reaches the 91% of non-desk workers other tools fail, without building a mobile app.

### 2.5 AI Weekly Digest ("5 things, 90 seconds")
- Per-person, per-scope digest: what happened, what needs your vote, what got actioned from your feedback, what's coming. Hard-capped length.
- Delivered in-app + via Messaging port. Replaces notification spam: CES budgets each user's weekly notification load and the digest absorbs the overflow — an explicit anti-overload contract.

### 2.6 Live Brainstorm Canvas
- The Brainstorm Box gains an embedded **Excalidraw** collaborative whiteboard (MIT-licensed React component) with **Yjs** CRDT sync — real-time sticky-note ideation during sessions, then AI clusters the stickies into themes that flow into the suggestion pipeline → Action Ledger.

### 2.7 Living Directory
- A people directory that builds itself: peer Q&A answers ("favourite snack", "ask me about…"), recognition history, competition wins, and skills tags populate rich profiles — solving "the org chart is dead, who *is* this person on my call?"
- **Meilisearch**-powered instant search across people, suggestions, memories, announcements, and the Action Ledger. Findability is a top intranet-failure cause; CES makes search excellent on day one.

---

## 3. Product Doctrine (the rules that prevent us becoming a failed intranet)
1. **Participation over publication.** Every screen has an act-in-2-clicks affordance (vote, answer, suggest, recognize). No read-only dead ends.
2. **Content generates itself.** Sessions, photos, Q&A, wins, and ledger updates *are* the content. No content team required — the failure mode of every intranet.
3. **Freshness is automated.** Stale items auto-archive; "on this day" resurfaces the good stuff; nothing rots on a homepage.
4. **The loop always closes.** Nothing collected without a visible path to action and a notification when action happens.
5. **Respect attention.** Notification budgets, 3-question pulse cap, quiet hours, one digest. CES must *reduce* total comms noise to earn its seat.
6. **Trust is architectural.** Anonymity by design (v1 §7), public accountability metrics, transparent ledgers. Never negotiable, never quietly weakened.

---

## 4. Open-Source Decisions (build / borrow / cut)

| Need | Decision | Tool & license | Rationale |
|---|---|---|---|
| Realtime fan-out at scale | **Borrow (scale path)** | **Centrifugo** (MIT, Go, single binary) | Pilot uses in-process WebSockets (v2). When one box stops being enough, Centrifugo replaces the custom gateway — battle-tested, language-agnostic, drops into Docker Compose. Cheaper than building Redis pub/sub fan-out ourselves. |
| Whiteboard/brainstorm | **Borrow** | **Excalidraw** (MIT) + **Yjs** (MIT) | World-class canvas for free; we only build the AI-clustering bridge. |
| Search | **Borrow** | **Meilisearch** (MIT) | Typo-tolerant instant search in one container; indexing job is a day of work. |
| Resumable photo/file uploads | **Borrow** | **Uppy + tus protocol** (MIT) | Solves flaky-network uploads to MinIO properly. |
| Rich text (announcements, answers) | **Borrow** | **Tiptap** (MIT core) | Solid editor; we style it. |
| SSO for companies without Entra/Okta | **Bundle optionally** | **Keycloak** (Apache-2.0) in an optional Compose profile | Our generic OIDC adapter points at it; instantly serves SMBs with no IdP. |
| Surveys/pulse engine | **Build (keep native)** — studied Formbricks/LimeSurvey for UX patterns | — | The k-anonymity engine, vault, throttling, and Action Ledger integration ARE the moat; embedding a foreign survey stack (and its AGPL/enterprise-tier complexity) breaks the anonymity guarantees and the data model. |
| Anonymous complaints | **Build (keep native)** — adopt **GlobaLeaks'** receipt/threat-model patterns | (studied, not embedded) | Same reason: anonymity must be one audited pipeline, not a bolted-on second system. |
| Notifications infra | **Build thin** | (Novu evaluated → too heavy; ntfy optional later for desktop push) | Our needs are in-app + Teams/Slack mirror + digest. A full notification platform is overkill on one server. |
| Product analytics | **Build thin** | (PostHog evaluated → heavy for Mode C boxes) | Participation metrics are first-class domain data already; a few SQL views + dashboards beat another 2 GB of containers. |
| UI kit | **Borrow** | shadcn/ui + Tailwind + TanStack Query/Table (MIT) | Speed + consistency; Claude Code is extremely fluent in these. |

Compose stack after v3: `postgres ×2 (app + vault) · minio · meilisearch · ces-server · join-web · caddy` — and optionally `keycloak`, later `centrifugo`. Still runs on one 8 GB box.

---

## 5. The Cut List (creative freedom includes subtraction)

| Cut / demoted | Why |
|---|---|
| **Custom WASM minigame runtime** → ship 3 fixed built-in games (trivia, typing race, RPS ladder) | A game *platform* is a product in itself; 3 polished games deliver 90% of the fun for 10% of the work. Leaderboards/seasons stay. |
| **Natural-language analytics ("text-to-chart")** → later backlog | Dashboards + digest answer the real need; this was demo-candy. |
| **Admin copilot** → later backlog | Nice, not must-have; admin UI must simply be good. |
| **Opportunity Centre** → folded into Boards (a generic "marketplace board" type alongside suggestion boxes) | Same mechanics, one less module to maintain; claim/approve workflow retained. |
| **RPS bracket "whole-room last one standing"** → keep 1v1 + simple bracket only | Realtime complexity disproportionate to laughs delivered. |
| **Per-vote granular audit retention** → aggregate after 90 days by default | Storage discipline; full audit chain on privileged actions unaffected. |
| **SuccessFactors/BambooHR adapters at launch** (already deferred in v2 — reaffirmed) | CSV + OIDC + optional Keycloak covers every pilot on earth. |

---

## 6. Roadmap Deltas (on top of v2's 20-week plan)

| Phase | Change |
|---|---|
| 1 (Live wedge) | + Kiosk/TV display mode (small lift on join-web) |
| 2 (Voice) | Suggestion workflow ships as the full **Action Ledger** with public statuses, decline-with-reason, loop-closing notifications, acted-on rate |
| 3 (Pulse + AI) | + **AI Weekly Digest**; + **Leadership AMA** (reuses sessions + voting + ledger machinery — cheap to add here) |
| 4 (Community + Rewards) | + Brainstorm Canvas (Excalidraw/Yjs); + Living Directory + Meilisearch; minigames reduced per cut list |
| **NEW Phase 4.5 (2 wks)** | **M11 Broadcast & Measure**: announcements, ack tracking, crisis mode, measurement studio, AI writing assist |
| 5 (Hardening) | + Centrifugo migration rehearsal (not deployment); + kiosk burn-in test |

Net schedule impact: ~+2 weeks (cuts pay for most of the additions). Pilot-complete in ~22 focused weeks.

---

## 7. Review Iteration 4 (this pass) — log entry
- *Gap:* product could only collect, not broadcast → **M11 added**; CES is now a complete comms loop (send → measure → listen → act → prove).
- *Gap:* nothing answered the #1 research finding (inaction fatigue) as a headline → suggestion workflow elevated to **Action Ledger**, now the flagship and the demo opener.
- *Gap:* non-desk workers unreachable by a desktop app → **Kiosk Channel** + existing web join close it without a mobile app.
- *Bloat identified:* game runtime, NL analytics, admin copilot, Opportunity Centre as a standalone module → cut/demoted (§5).
- *Build-vs-borrow undisciplined:* resolved with the §4 table; the moat (anonymity + ledger + hierarchy) stays hand-built, commodities are borrowed MIT-licensed.
- *Thesis sharpened:* CES is the **Participation Layer** — it does not compete with Teams/Slack/email for conversation; it sits beside them, mirrors into them, and owns the listening loop they all lack.

**Verdict:** v3 is no longer "Mentimeter plus a suggestion box." It is the system of record for whether a company listens — with the fun layer as the adoption wedge and the Action Ledger as the reason nobody ever uninstalls it.

*End of v3.0*
[text](ces-plan-v3-participation-layer.md)