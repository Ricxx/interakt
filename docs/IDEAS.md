# CES — Future ideas (parking lot)

Captured for reference. Not scheduled — pulled in deliberately, one at a time, on the
existing session → activity → realtime spine. Keep the doctrine: build when needed.

## Activity types (the catalog grows)
- **Mentimeter-style poll** — host asks a question, multiple-choice or scale, live bars.
- **Word cloud** — open text answers, sized by frequency, live.
- **Kahoot-style game** — timed quiz, points per speed+correctness, leaderboard.
- **Big Ups** (Jamaican for kudos/shoutouts/thanks) — recognition activity; let the host
  rename it per org (e.g. "Kudos", "Shoutouts", "Thanks"). Feeds a recognition feed.
- **Awards & trophies** — nominate/award; a trophy cabinet per person/team.

## Personal dashboard + feed (its own slice)
- Per-user stats: activities participated, points earned, awards earned.
- "My awards" — see your trophies/badges; profile.
- Opt-in **news feed**: staff can share their awards; departments can post their wins.
  Doubles as a lightweight internal comms feed.

## Notice boards & long-lived sessions
- **Pin / notice boards** per department, division, org — pin items to a board to share
  with wider staff or specific teams. **Pins can require dept-management approval.**
- **Brainstorm activity** — collaborative idea collection (sticky notes / list), themes.
- **Long-lived (persistent) sessions** — open a session and leave it running for, say, a
  week (e.g. an ongoing brainstorm) while still joining other sessions. Some session
  types need this "always-on" mode rather than a single live meeting.

## Beyond activities
- **Games & points** — points economy across activities; seasons; anti-cheat.
- **House colors (sports)** — assign people to houses/teams; house standings; ties into
  competitions and points. A cross-cutting layer over activities.

## Roles & control (next concrete slice — see below)
- Upgrade participants to **moderator / co-host / host**; a "control spectrum" of what
  each can do (drive activities, invite, remove, end). Member-level ordering for
  host-disconnect failover (TBD with the user).

## Nomination options (being built now)
- Anonymous (default) vs named ("bold face") voting — named must be host-enabled.
- Show/hide results (poll numbers) — host reveal.
- Expanded votes (who voted for whom) — only when named.
- Voting timer (countdown) or none.

---

# Backlog brain dump (captured 2026-06-16)

Grouped by theme with reuse/dependency notes. ⚠️ = anonymity-critical (slow down, no
identity in tables, k-anonymity, careful logging). Nothing here is scheduled; pull one
small slice at a time per the doctrine.

## A. Live in-meeting activities (extend the existing activity engine)
- **Mini questions / fun facts / favorites** — snack, candy, music, movie, movie-type, etc.
  Icebreaker variant; bank of prompts; per-person answers shown. Low risk, high charm.
- **Mentimeter-style + Word cloud** — open-text submissions, sized by frequency, live. (In IDEAS above.)
- **Q&A** ⚠️ — submit questions in a meeting; others **upvote** the ones they want answered.
  Asker **anonymous by default**, can opt to show name (confirm first). Q&A can be private;
  expose only counts / question numbers/ids when private. Asked-count + ids usable as a digest.
- **In-meeting quick surveys** — small, fast, single-screen pulse during a meeting.
- **Guess the item/animal** (host-specified game) — host builds a custom word/category list;
  words dealt at random to N people (N = #words, even if more members). Each person sees
  ONLY their own word on their turn; an **admin/scorekeeper** reveals it at the right time.
  Hotseat person describes without saying it; on correct guess: confetti, scoreboard +1,
  next person. Options: host can/can't see words (so host can play too); text-based or
  spoken (on a call); playable casually outside a call. Word used once then removed from pool.
- **Draw straws** — quick random "who's it" with a straw-pull animation.
- **Team selectors** — split people into teams: random, manually placed, or team-leads pick
  in turns. Extends the existing randomizer/pool plumbing.

## B. Meeting artifacts (new concept — attach to a session, not an "activity")
- **Agenda + artifacts** — agenda table already exists; let a session carry attachments
  everyone can open instantly without screen-share: **links, images, videos/YouTube embeds**.
- **Data viz on the fly** — import data (paste/upload), render as a shareable **table** and
  quick **charts** in-meeting (reuse the ECharts setup from poll). Lives as a meeting artifact.

## C. Surveys & feedback (standalone, longer-lived)
- **Staff-wide surveys** — pop-ups / a survey dashboard / sectioned surveys; org-wide reach.
- **Long-form surveys** ⚠️ — open for X time; **resumable**; **interval reminders**
  (e.g. 2×/week, or 7d/3d/1d/12h/3h before close, or every X days). k-anonymity on results.

## D. Boards & feeds (generalize the board/feed primitive)
- **Fix the noticeboard / pin board** — existing feature is broken; repair first.
- **Listy** — collaborative checklists. A list has a **title** (required); anyone can check
  items complete / incomplete, leave a comment; the list keeps a **log**. Multiple lists.
  Lists can be **closed** or **recurring** (daily / weekly / quarterly). Items checked off
  as work progresses.
- **Department board** — historical fun feed ("16 Jun: rick officially named master of WFH").
- **Achievements & rewards boards** — what the dept achieved, on a date, with team members
  (optional); individual awards link up to the dept achievement above.
- **Sports team** — its own area: **main feed**, **events** feed, and a **leaderboard**
  (animated bars loaded with points, stacked high→low), managed by a sports-team manager.

## E. Identity & gamification (greenfield — the big shared foundation)
These share three foundations: a **points/economy ledger** (`points_ledger`, already in the
append-only plan), **profiles**, and the generalized **board/feed**. Build foundations once.
- **Employee cards** — a profile surface viewable anywhere: name, nicknames, display image,
  appointed titles, awards/trophies, fun trinkets.
- **Profiles + customization shop** — spend earned currency on cosmetics (gold borders,
  profile-pic halos, etc.).
- **Gamify the whole system + Achievements** — points across activities; achievement unlocks.
- **Awards / trophies / Big Ups** — recognition; trophy cabinet per person/team. (In IDEAS above.)
- **Leaderboard** — global/team standings off the points ledger.
- **The office RPG** — UnbelievaBoat-style, work/office-themed, with an economy and "a little
  life." Explicitly just-for-fun.

## Prioritized roadmap (the build order)

Combined into epics, fixes pulled into their own track, ordered so foundations land
before the clusters that need them. Each epic ships as small slices (DB→API→UI→test).
Current build order — work top-down, one slice at a time.

### Fixes track (pull in opportunistically, not a feature epic)
- **Fix noticeboard / pin board** — diagnose what's broken in the boards/repo pin flow and
  repair. Do this right before Epic 5 (boards), since that epic builds on a healthy pin flow.

### Epic 1 — Listy ✅ start here  (self-contained, fully specced, fast win; no deps)
Collaborative checklists. Slices: (1) create/list lists (title required) + items + check
on/off; (2) per-item comments + per-list activity log; (3) close vs recurring
(daily/weekly/quarterly) lifecycle. Reuses DataTable/card primitives. ~3–6 files/slice.

### Epic 1.5 — Scoped collections (the shared spine for lists / todos / boards)
Boards, lists, and todos are all "a scoped collection of items people act on." Build the
shared machinery ONCE, reuse three times — don't triplicate scoping/nav/badges.
- **1.5a — Scoping ✅ DONE for lists** — `scopeKind` (ALL/NODE/GROUP) + `scopeId`, default
  to the creator's department; visibility == access; shared `canSeeScoped()`/`scopeLabel()`
  in `lib/scopeAccess.ts` (boards now reuse it too).
  - **Todos decision:** the kanban To-do has NO named-board concept (groups only by org unit),
    so "named committee/dept todo-boards" = the deferred Trello feature. **Lists already covers
    that need** (a scoped, grouped, badged collection of checkable to-dos). So we DON'T add
    named-boards or GROUP scope to the kanban — Lists is the named-collection tool; the kanban
    stays the simple assigned-work board. (Honors "quick simple, not a PM tool".)
- **1.5b — Grouped index + search** — group lists/todos by scope on the index (sections:
  *My committees* / *My department* / *Org-wide*) with a client-side search box and back
  buttons. Pure presentation over the scope model.
- **1.5c — Change badges** — per-user read tracking (reuse the `sessionChatReads.lastReadAt`
  pattern: a `last_seen_at` per user per list/board) → "updated since you looked" badges,
  reused across lists, todos, boards. One mechanism, not three.
- **1.5d — References / previews ✅ DONE (lists)** — paste a list link (`/lists/<id>`) into a
  comment or session chat and it renders as a permission-checked chip via `POST /api/refs/resolve`
  (`lib/scopeAccess` → title only if accessible; otherwise `accessible:false`, null title — leak-safe).
  Shared `<RefText>` component wired into session chat + list-item comments; "Copy link" button on
  the list header. Todos deferred (no stable detail URL yet); @mention autocomplete is a later add-on.

> **On "epics" / hierarchy (decided):** Don't add an Epic entity or multi-level nesting to
> todos. The grouping is already covered by **scope** (a committee/dept task-board IS the
> "epic") and the existing one-level task `parentId` (a parent task with sub-tasks). A board
> is a collection surface, not a work-item — keep them distinct. Add depth only on a real
> second caller, never speculatively.

### Epic S — Surveys ✅ BUILT (S1–S7)  [superseded old 2d + Epic 6]
Shipped: builder + sections + collaborators + edit log (S1/S1.5), distribute by scope + org-except
+ lifecycle (S2), paged/resumable responses with Named/Anonymous + "Other" capture (S3), results +
CSV with k-anonymity (S4/S5), in-meeting SURVEY activity (S6), and the Insights tab — published
analysis/resolutions linked to a survey (S7). Anonymous = no identity (pseudonym + client ticket),
coarse day timestamps, k≥5 on results. Original slice plan kept below for reference.

### Epic S — Surveys (form builder → distribute → respond → insights)  [supersedes old 2d + Epic 6]
A full survey system, built in slices. Reuses: `canSeeScoped` (distribution), the activity
engine (in-meeting launch), the poll CSV pattern (export), read-tracking (assigned/complete).
Two surfaces: **Create** (build/manage) and **Complete** (fill); then **Past** + **Insights**.
- **S1 — Builder + schema** — `surveys` + `survey_questions` (types: single/multi/text/scale;
  options; required; allowOther; page). Author a DRAFT, edit freely, **copy** a survey. Create section.
- **S2 — Distribute + lifecycle** — scope (ALL/NODE/GROUP + "org-except" exclusions); DRAFT→OPEN
  →PAUSED→CLOSED; live response count. The Complete section (surveys assigned to me).
- **S3 — Respond** — paged form (x/page), **resumable** (save progress per page), submit; capture
  "Other" free-text.
- **S4 — Anonymity** ⚠️ — per-survey Named vs Anonymous. Anonymous = no identity (pseudonym_ref +
  vault, client claim-ticket for resume), coarse timestamps, **k≥5** on results/insights.
- **S5 — Results + CSV** — counts, CSV export incl. "Other" answers; Past surveys.
- **S6 — In-meeting activity** — a `SURVEY` activity type: preplan → launch in session → fill live
  → mark the response complete in the survey section.
- **S7 — Insights tab** — per-survey analysis (ECharts) + institution-authored notes/resolutions;
  aggregate-only (k-anonymity) for anonymous surveys.

> **Quick activities without a session (parked 2026-06-17):** The Random Name Picker hangs off
> the Sessions page a bit orphaned. Idea: a lightweight "Activities" entry point where someone can
> do a quick thing — pick a name, challenge a specific person (e.g. RPS), draw straws — WITHOUT
> formally creating a session. Two ways to do it: (a) standalone one-off activities (more new code:
> activities currently assume a session/room), or (b) make "quick activity" silently spin up a
> minimal/ephemeral session under the hood and drop you in (reuses the whole spine, far less code —
> likely the right call). Lean toward (b) so we don't fork the activity engine. Decide scope before
> building; don't duplicate the session machinery.

### Epic W — Wellness / stress (IMPORTANT) — anonymity-critical, reuses the survey/anon spine
Both of the things you described, and they fit together — the survey system already gives us the
hard part (anonymous responses: pseudonym only, no identity, coarse day timestamps, k≥5 on results).
- **Deployed pulse/wellness check** = a recurring **Anonymous survey** (existing) — scheduled, k-anonymous.
- **Always-on self check-in** = a lightweight, always-available anonymous "how are you / stress level"
  (a 1–5 mood/stress slider + optional note), submittable any time, *separate* from the scheduled push,
  so people can vent when they need to. Anonymous by construction (no user_id, coarse week).
- **Stress portal / dashboard** = aggregate stress **by department**, **only at k≥5** (never below), with
  trend over time. Anonymous-only; AI/themes aggregate-only. Plus **guidance** — institution-shared
  support resources / resolutions (the insights pattern), per dept or org-wide.
- Anonymity here is the non-negotiable (CLAUDE.md): worthless if identity can leak. Reuse the anon
  response model + k-anonymity already built for surveys; don't roll a new one.
- Slices: W1 always-on anon check-in + k≥5 by-dept portal ✅; **individual self-care ✅** (on-device
  history → "rough stretch" nudge to take a day off + tips; rotating positive quote — all client-side
  so the server never links check-ins to a person); **W2 weekly stress trend ✅** (org-wide, each week
  k≥5 or hidden); **W3 institution support content ✅** (admin-managed resources + "get help" email/
  WhatsApp buttons that open off-app for privacy + a risk-free vent promise; published→visible to all).
- W-next ideas: per-dept trend; AI theming over anonymous notes (aggregate-only); scheduled pulse push.

### Epic R — Recognition / big-ups + awards ✅ BUILT (attributed, NOT anonymous)
- **R1** ✅ peer big-up: badge (6 presets) + message → wall + most-celebrated board (people + dept totals).
- **R2a** ✅ SCOPED redesign (reuses the canSeeScoped ALL/NODE/GROUP spine + peopleInScope):
  - Recipient = a **person**, a whole **department** (org node), or a **team** (group). Clicking a
    dept/team award lazy-loads its members (`/recognitions/:id/recipients`).
  - `kind` = BIGUP (peer, fun) vs AWARD (official). Dept/team recipients are always AWARDs.
  - Visibility scope: **recipient's dept by default**, **org-wide** if the issuer holds the new
    `recognition.award` capability (no-lockout: ungoverned open, admins bypass; org-wide audited).
  - Wall split **Recent (≤30d) / Past**; board counts visible individuals only.
- **R2b (next)**: recipient **notifications** + unread nav badge (reuse `*_reads` + hub.sendToUsers) +
  a per-person on/off toggle in Settings (reuse the prefs.ts localStorage pattern).
- R-next: react/+1; points ledger when gamification lands; recognition as an in-session activity.

### Epic 2 — Meeting toolkit  (high daily value, reuses the activity + session spine)
- **2a. Artifacts on a session** — attach links, images, YouTube/video, files everyone can
  open instantly (no screen-share). Agenda table already exists; extend it.
- **2b. Data-viz artifact** — paste/import data → shareable table + quick ECharts on the fly.
- **2c. Quick activities** — word cloud / menti, draw straws, team selectors (extends
  randomizer), mini-questions/favorites (icebreaker bank). Each is a tiny activity slice.
- **2d. In-meeting quick survey** — small single-screen pulse during a meeting.

### Epic 3 — Q&A ⚠️  (high meeting value; anonymity-critical, so slow down)
Submit questions in-meeting; upvote; **anonymous by default**, opt-in named (confirm first);
private mode exposes only counts/ids. No identity in tables; coarse timestamps; careful logs.

### Epic 4 — Identity & gamification  (the big shared foundation; build once, in order)
- **4a. Profiles + employee cards** — the identity surface, viewable anywhere.
- **4b. Points/economy ledger** (append-only — already in the data plan) + **achievements**.
- **4c. Leaderboard** off the ledger.
- **4d. Awards / trophies / Big Ups** — recognition + trophy cabinet (links to cards).
- **4e. Profile customization shop** — spend currency on cosmetics (borders, halos).
- **4f. Office RPG** — UnbelievaBoat-style, just-for-fun; last, rides on 4a–4e.

### Epic 5 — Boards & recognition feeds  (needs a generalized board/feed + profiles)
Fix the noticeboard first (Fixes track), then: **department board** (historical fun),
**achievements/rewards boards** (links to individual awards), **sports team** (feed +
events + leaderboard with animated stacked bars; manager-run — needs the points ledger).

### Epic 6 — Long-form surveys ⚠️  (heaviest; scheduling + anonymity)
Org-wide surveys open for X time, resumable, interval reminders (via pg-boss), k-anonymity
on results, survey dashboard/sections. Do after the gamification foundation settles.
