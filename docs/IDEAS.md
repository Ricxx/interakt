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

## Personal dashboard ✅ BUILT (home screen) + Profile v1
- Home: avatar + greeting + an **owner-editable status** (click → profile overlay edit); private "rough
  stretch" wellness nudge; **only non-zero** attention tiles (no scary "0 X"); "Coming up" (sessions +
  events, tenant-tz); "Big-ups & awards you've received"; recent task activity; a **"Try out"** feature-
  discovery grid. Pure frontend composition — no new server routes for the dashboard itself.
- **Profile v1 ✅**: `users.avatarUrl` (URL-based — real file upload waits on the MinIO slice) + `statusText`,
  self-edited via `PATCH /api/profile/me`; shown in the profile overlay (self-edit there), dashboard, and
  shell (reusable `ui/avatar.tsx` with initials fallback). **Institution toggle** `tenants.profilePicsEnabled`
  (Settings): when off, avatars hide everywhere + can't be set (status still editable). `/auth/me` + the
  CurrentUser now carry avatar/status. Verified 10/10.
- Deliberately deferred (need their own data/foundations): **achievements** + **games-won** (gamification
  ledger), **site-wide notices**, **board-post feed**, scheduled **wellness check-in reminders**.

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
- **Meeting toolkit ✅ BUILT (Q&A queue + dot voting + fist-of-five).** Three new activity types on the
  existing session engine (type enum + `buildActivityConfig` + submit endpoints + a `currentActivity()`
  payload branch + a `features/sessions/*.tsx` view, all matching POLL):
  - **Q&A queue** (`QNA`, migration 0047): ask → upvote (toggle) → host marks answered; open-first then
    by-votes ordering; `anonymous` config hides asker names from everyone. Verified 13/13.
  - **Dot voting** (`DOT_VOTE`, migration 0048): spend a budget of dots across options; server enforces
    sum ≤ budget; live totals + leader. Verified 10/10.
  - **Fist of Five** (`FIST`, migration 0049): one-tap 1–5 confidence check; live average + distribution;
    re-vote replaces. Verified 9/9.
  - **Planning Poker** (`POKER`, migration 0050): blind Fibonacci estimation; host reveals all at once;
    distribution + consensus flag; re-estimate clears. Verified 13/13.
  - **Retro Board** (`RETRO`, migration 0051): cards in preset columns (Start/Stop/Continue, etc.), upvote
    to sort; author/host delete; anonymous mode. Cross-industry review tool. Verified 13/13.
  - **Checklist / protocol** (`CHECKLIST`, migration 0053): host pastes items (one per line); the room ticks
    them off live (records who + when); progress bar; host reset. Cross-industry — pre-op, deploy runbooks,
    month-end close, safety/audit. Verified 10/10.
  - **Meeting Timer** (`TIMER`, no migration — config jsonb): shared countdown to timebox a topic/speaker;
    host start/pause/resume/reset; clients tick locally from `endsAt` (no server polling). Verified 11/11.
  - **Round Robin** (`ROUNDROBIN`, no migration — config jsonb): shuffled go-around order seeded from the
    room; host Back/Next/Reshuffle, current speaker can pass to themselves. Stand-ups. Verified 10/10.
  - **In-session Scoreboard** (`SCOREBOARD`): deploy a points board's live standings to the room; host
    awards points in-session by room roster / name. Verified 5/5 + 6/6.
  - **In-session Tournament** (`TOURNAMENT`): watch a bracket live in the room; results reported on the
    full Tournaments page reflect live. Verified 6/6.
- **Retreat mode ✅** — scoreboards (solo/team, per-game), scan-to-join + TV view-only QR, groups+self-pick+
  host roster, TV/presentation watcher excluded from random-pick pools. See `memory/scoreboard.md`.
- **Activity explainers ✅ BUILT.** Accessible `?` info icon (`ui/info-tip.tsx`) with a centralized
  `ACTIVITY_HELP` map (blurb + 2–3 steps per type) shown on every launcher card **and** once on the running
  activity — so anyone can self-serve "how do I use this" and cut down questions.
- **Mini questions / fun facts / favorites** — snack, candy, music, movie, movie-type, etc.
  Icebreaker variant; bank of prompts; per-person answers shown. Low risk, high charm.
- **Mentimeter-style + Word cloud** — open-text submissions, sized by frequency, live. (In IDEAS above.)
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
- **R-likes/profile** ✅ **Kudos** = a row of **gold ⭐ medals**, one per giver, hover shows their name;
  **no notification**. **Anonymous kudos** ✅ opt-in, gated by the new boolean cap `recognition.anonymous`
  (grant it to management groups so upper staff can support without conflict-of-interest optics; rest
  must show). Anonymous givers render as "Anonymous" — their name AND user id never go over the wire.
  Same-anonymity click toggles off; different switches public↔anon. Recipient cards show **job title +
  department** under the name (jobTitle admin-set on Members). **Comments** ✅ on each recognition
  (attributed, scope-gated; author/admin delete; count on the card, lazy-loaded thread).
- **R2b ✅ BUILT — recipient notifications.** `recognition_reads` (per-user last-seen marker) →
  `GET /api/recognitions/unread` counts recognitions addressed to YOU (you / your dept subtree / a team
  you're on) since you last looked, excluding ones you gave. Unread **nav badge** on Recognition (polled
  45s); opening the page marks read. **Per-person 🔔 toggle** in the shell footer (prefs.ts) hides it.
  Kudos/comments never notify — only the recognition itself. Verified 8/8.
- R-next: recognition as an in-session activity (shout-outs); pin a big-up to a board.

### Profiles ✅ STARTED — clickable profile overlay
- `ProfileProvider` + `useOpenProfile(userId)` → an overlay reachable from anywhere (shell name,
  recognition card names). `GET /api/profile/:id` = identity (name/title/dept/role) + recognition
  received (scope-filtered to the viewer) + star totals.
- Shell user-block fixed: name/role is its own clickable row (opens your profile); mute/theme/
  sign-out moved to a second row so they never crowd the name.
- This overlay is the seam for Epic G below (awards/trinkets/achievements decorate the profile here).

### Epic G — Gamification, achievements & loyalty
- **Foundation ✅ BUILT — points ledger + daily streak/loyalty.** `points_ledger` (**append-only**: trigger +
  ces_app REVOKE, like contributions) — balance = sum of deltas. `features/points/routes.ts`: `GET
  /api/points/me` (balance, streak, checkedInToday, recent), `POST /api/points/checkin` (once/day; base 10
  + streak bonus up to +14), `POST /api/points/leave` (flag a day leave/sick so it bridges a gap). Streak =
  consecutive covered days (check-in or leave) ending today/yesterday. Dashboard check-in card (🔥 streak +
  balance + claim + "on leave today"). Verified 8/8 incl. leave-bridge + append-only. Daily reset is UTC for now.
- **Check-in calendar + rewards ✅ BUILT.** `checkin_rewards` (per-tenant per-day; kind POINTS|PRIZE|TITLE|
  PROFILE + label + points; admin-editable). Monthly calendar (`GET /api/points/calendar`) shows your
  check-in marks + each day's reward; admins set/clear rewards per day (`PUT/DELETE /points/rewards/:day`).
  On check-in a POINTS reward is auto-credited; a non-POINTS reward (real-world/title/profile) is returned
  as a "you won" prize (fulfillment is offline/derivable). **Public streak**: profiles now show `streak`
  (shared `lib/streak.ts`). Nav "Check-in" + dashboard card links to it. Verified 11/11.
- **Achievements ✅ BUILT.** `achievements` (admin-defined: name/desc/category/icon, **metric** ∈
  BIGUPS_RECEIVED | BIGUPS_GIVEN | GAMES_WON | CHECKIN_STREAK | CHECKINS, threshold, period LIFETIME|MONTHLY)
  + `achievement_awards` (unique per achievement+user+periodKey). `GET /api/achievements/me` computes each
  metric & **auto-awards** newly-earned (idempotent); admin CRUD. Earned badges show on the **profile** +
  an **Achievements page** (earned + progress bars). Ties together recognition/tournaments/streaks.
  Verified 11/11. (MONTHLY filters timestamped metrics; GAMES_WON/CHECKIN_STREAK are point-in-time.)
- **Marketplace + lottery ✅ BUILT.** `marketplace_items` (admin CRUD: name/icon/cost/active) + `redemptions`
  (name snapshot). Redeem → balance check → **append-only ledger spend** (negative delta) + a redemption row;
  Shop page (storefront, "Not enough" gating, my redemptions; admin manage). **Daily lottery** `POST
  /api/points/lottery` (once/day, random 5–50 windfall) — dashboard "🎲 Daily draw". Closes the earn/spend
  loop. Verified 10/10 (spend, insufficient 400, hidden items, append-only spend, once-a-day lottery).
- **Equip-able profile flair ✅ BUILT.** Marketplace items have a `kind` (PERK | PROFILE); PROFILE items
  grant an `augment` (a flair emoji). Redeeming a PROFILE item makes it **owned** (snapshot on the
  redemption; can't re-buy); `users.flair` is the equipped one, set via PATCH /api/profile/me {flair}
  (validated against owned), surfaced via /me + profile + shown next to the name on the profile overlay,
  shell footer, and dashboard greeting. `GET /api/profile/augments` lists owned + equipped. Verified 10/10.
- **Richer augments — frames/colours/titles ✅ BUILT.** PROFILE items now carry an `augmentKind` slot:
  **FLAIR** (emoji, existing), **TITLE** (short text shown under the name), **COLOR** (a fixed-palette token
  — `COLOR_TOKENS` rose/amber/emerald/sky/violet/slate — that colours the name **and** the avatar ring, i.e.
  the "frame"). `marketplace_items.augment_kind` + `redemptions.augment_kind` (snapshot) + `users.title` /
  `users.name_color` (migration 0045, backfills existing PROFILE rows → FLAIR). Equip via the same
  `PATCH /api/profile/me {flair,title,nameColor}` — each validated against an owned redemption in the
  matching slot (`augment_not_owned`); `/api/profile/augments` returns owned grouped `{FLAIR,TITLE,COLOR}`
  + equipped per slot. Admin shop form picks the kind (emoji input / title input / colour dropdown), with
  server-side palette + length validation. Avatar gained a `ring` prop. Verified 17/17.
- **Dept-scoped + scheduled achievements ✅ BUILT.** Achievement defs gained `scopeKind`/`scopeId`
  (ALL | NODE | GROUP — reuses the `canSeeScoped` spine) and an optional inclusive `activeFrom`/`activeUntil`
  date window (migration 0046, existing rows default scopeKind ALL). Catalog + `/me` now only show defs the
  viewer is in scope for, and `/me` auto-awards **only while the window is ACTIVE** (UPCOMING/ENDED are
  visible-but-not-earnable, so a time-boxed challenge can't be pre- or post-claimed). Admin form (still
  TENANT_ADMIN) got an Everyone/Department/Team picker (reusing `useOrgNodes`/`useGroupsList`) + two date
  inputs; rows show a scope chip + a status chip (starts/until/ended). Cross-field validation (node needs a
  target, window can't invert) lives in the handler so PATCH `.partial()` still works. Verified 12/12.
- **Sidebar ✅ reorganized** into themed **collapsible** sections (Activities / Resources / Workplace +
  admin People/Settings + Oversight); collapsed state persists; a collapsed section with pending badges
  shows a count chip so notifications aren't hidden.
- **Team calendar ✅ BUILT.** One **"Calendar"** sidebar page = a month grid showing big-ticket **Events**
  (by startAt) **+ the daily check-in rewards + your check-in ✓** all in one view; **iCal export**
  (`GET /api/events/calendar.ics`, scope-filtered, downloadable → any personal calendar); admins set
  per-day rewards inline (admin-only). Events can **attach a List/to-dos** (`events.listId`, set on the
  event detail, links to /lists/:id). The standalone "Check-in" nav item was removed — the daily check-in
  action lives on the dashboard; rewards now live on the team calendar. Verified 8/8 (+11/11 calendar earlier).
  - Deferred: iCal **import** (parsing external .ics → events); putting sessions on the calendar too.
- **Calendar v2 ✅ BUILT.** **Reward-setting is its own capability** `reward.manage` (admin or granted —
  e.g. HR; deliberately NOT the dept calendar manager; fail-closed) — the calendar's reward editor only
  shows to those. **Scope filter** (Everything / Org-wide / Department / Team — events list now exposes
  `scopeKind`). **Month / Week / Day views** (Week = days with timed events; Day = full detail + reward).
  Verified 6/6.
- **"Add to calendar" ✅ BUILT.** Reusable `AddToCalendar` popover (prefilled title + datetime + scope
  picker → creates a PLAN event) on **notice posts** (prefill the notice title) and **list detail** (prefill
  the list title + attach the list via `listId` on event-create). Verified 3/3. Next: a true time-grid
  timetable (time slots × days with block-outs) if wanted; iCal **import**.
Captured from the vision; NOT built yet. Keep it under Recognition conceptually but likely its **own
window** once it grows. Build order TBD; each is a slice.
- **Achievements** (admin-defined): thresholds set "in a clever way" — e.g. "Large commenter",
  "Highest comments this month". Periodic (monthly) **and** lifetime. **Scoped org/dept** (some only
  shown to a dept, to cut spam). **Categorized.** Admin controls visibility/rate to minimize noise.
  Shows who earned what, monthly + all-time.
- **Daily points lottery** — random windfalls; points spend on profile augmentations / little gifts.
- **Daily login rewards + streaks** — claim small gifts by signing in; a work **loyalty program**.
  Streak protection: a person can log **leave / sick days** to skip without breaking the streak.
- **Marketplace** — designs, trinkets, achievements to "pimp" profiles; spent via points/lottery.
- Foundation needed first: append-only **points_ledger** (CLAUDE.md), then earn/spend rails, then the
  storefront + the profile-customization layer hanging off the profile overlay.

### Org structure — de-locked for any company shape ✅ + next: a management view
- **Reach generalized ✅** — capability scope went from fixed tiers (SELF/DEPT/DIVISION/ORG, keyed on
  literal nodeType names) to **relative reach SELF / NODE (your home subtree) / ORG**. `orgNodes.nodeType`
  is now **free-form** (companies name their own levels). Migration 0030 maps old grants → NODE. The tree
  was always generic (parentId + path); only labels + reach were locked. Verified 9/9.
- **Org management view ✅ BUILT** — /org now shows the full hierarchy with each named level, **per-node
  member counts** (shared with member management), inline **rename**, **move** (reparent — re-roots the
  subtree's paths; cycle-guarded), delete, and a **Recent changes** log (audits org.node_created/renamed/
  moved/deleted via `GET /api/org/log`, admin-only). Rename never touches `path` (random segments) so
  scope is unaffected; move rewrites the subtree path prefix. Verified 13/13.
  - Note: org *nodes* ≠ `groups` (cross-cutting member sets, managed on the Members/Permissions side).
- **Timezone** ✅ `tenants.timezone` (IANA, default UTC) + `features/tenant/routes.ts` (GET all / PATCH
  admin, validated via Intl, audited `tenant.timezone_set`); Settings page picker. Scheduled-time
  displays (sessions, clue release, matches) should render in this zone — **wiring those displays to it
  is still TODO** (today it's stored + settable). This `tenant` feature is where the usage-log toggle lands.

### Quick games ✅ BUILT — tic-tac-toe, connect four, checkers (activity engine)
- All three are 1v1/turn-based activities sharing the RPS skeleton (two players pinned in
  `activity.config`, board state in config — no extra table). Pure rules in
  `features/activities/boardgames.ts` (initBoard/applyMove); one server-authoritative move endpoint
  `POST /api/activities/:id/board/move` (+ `/board/rematch`); `board` payload block in currentActivity;
  one `boardgame.tsx` panel renders all three; CATALOG + AddActivity reuse the RPS player picker.
- Checkers engine handles forced captures, multi-jump chains, kinging, and win-by-no-legal-moves.
- Verified 25/25 (pure rules for all 3 + HTTP turn/authz/win/rematch guards).
- Not wired: a session-log summary for ended games (the live panel is complete); add if wanted.

### Epic E2 — Events / team planning + galleries
- **Slice 1 ✅ BUILT** — `events` (kind PLAN | FUND | THEME_DAY; title, instructions, scope ALL/NODE/GROUP,
  startAt/endAt in tenant tz, goalAmount placeholder). Org-wide needs the new `event.manage` capability
  (no-lockout; dept/team open). **Gallery** ✅ `event_photos` (uniquely numbered per event, URL-based),
  `event_photo_comments` (one-level replies), `event_photo_likes` (count always shown; **liker names
  hidden unless the creator/admin turns gallery anonymity OFF** — toggle built). Verified 14/14.
  Files: `features/events/routes.ts`, desktop `features/events/page.tsx` + `detail.tsx`, `lib/events.ts`.
- **Slice 2 ✅ BUILT — contributions / fund.** `event_contributions` is **append-only** (per CLAUDE.md):
  a `ces_append_only()` trigger blocks UPDATE/DELETE for every role + the table is in the ces_app
  REVOKE list. Record a contribution (amount + note) toward `goalAmount`; FUND-only, scope-gated;
  progress bar + total/goal/mine + ledger list. Immutable once recorded (record-only). Verified 10/10
  incl. the trigger rejecting edits/deletes. No payment rails — internal pledge tracker.
- **Real photo upload ✅ BUILT (MinIO wired).** `lib/storage.ts` (MinIO client; endpoint accepts a bare
  host OR a full URL) + `@fastify/multipart`. `POST /api/uploads` (auth, image-only, 8 MB) proxies to
  MinIO (bucket `ces-uploads`, key `tenantId/uuid.ext`) → returns `{key, url:/api/uploads/<key>}`;
  `GET /api/uploads/*` streams it back (auth-gated; **proxied so MinIO stays internal** — never exposed
  to clients). Wired into the **profile avatar** + **gallery add-photo** (Upload button next to the URL
  field; validators accept http(s) OR `/api/uploads/…`). Verified 9/9 (real round-trip, byte-for-byte,
  auth, type guard).
- **QR → phone-upload ✅ BUILT.** Organizer (event creator/admin) mints a signed, 2h-expiring HMAC token
  (`GET /api/events/:id/upload-token` → `{token, url:<this-server>/u/<token>}`; non-organizers get 403).
  The token IS the capability — `GET /u/:token` serves a self-contained no-login HTML page that POSTs to
  `/api/uploads/qr/:token`, which verifies the token, proxies the image to MinIO and inserts an
  `event_photos` row tagged "via QR". Served by the existing Fastify server (no new app); URL built from
  the request host so a phone on the same LAN can reach it; opt-in (off until minted). Desktop shows a QR
  (rendered client-side via `qrcode`) on the gallery. **Gotcha:** the ~150-char base64url token exceeds
  Fastify's default `maxParamLength: 100` → silent JSON 404 on `/u/:token`; fixed by `maxParamLength: 256`
  on the Fastify instance. Verified 7/7 (mint authz, public page, no-login upload, gallery insert, bad-token
  401, expired page).
- **iCal import ✅ BUILT (inverse of the export).** `POST /api/events/import-ics` takes raw `.ics` text,
  parses VEVENTs (RFC 5545 line-unfolding; SUMMARY/DESCRIPTION/DTSTART/DTEND only; handles UTC `…Z`,
  floating, `VALUE=DATE` all-day, and `TZID=` — the last two treated as UTC, no tz database shipped) and
  creates **PLAN** events filed under the importer's department (NODE-scoped, importer is creator). One
  click, no scope picker; caps at 200 and returns `{imported, skipped}`. Desktop: an "⤒ .ics" file-picker
  next to the export button on the team calendar. Verified 10/10 (count/skip, unescape, fold-unfold, UTC &
  all-day instants, no-events 400, no-department 400, unauth 401).
- **Timetable (time-grid) view ✅ BUILT.** Fourth calendar view ("grid") next to month/week/day: **hours
  across the top, days down the left** (the horizontal schedule the user asked for). Each day's events
  render as positioned **block-outs** (left% = start hour, width% = duration) on their own stacked line so
  overlaps never collide; hour window defaults to business hours (08–18) and widens to fit any event in the
  visible week. Frontend-only (`TimetableView` in `features/calendar/page.tsx`) — the one backend change was
  adding `endAt` to the `GET /api/events` list payload so durations render. Uses the browser's local hours
  (tz-perfect placement deferred). Both typechecks clean; `endAt` round-trip smoke-tested.

### Epic C — Competitions ("in-house competitions"). Reuses scope/groups + timezone
- **Tournament bracketing ✅ BUILT (slice 1).** `tournaments` (title, gameLabel, scope, status, rounds) +
  `tournament_players` (seeded) + `tournament_matches` (round, slot, player1/2, winner, scheduledAt).
  Pure single-elim engine `bracket.ts` (`buildBracket` distributes byes one-per-match so two byes never
  meet; `nextSlot` propagates winners) — tested. Create (pick entrants; org-wide needs `tournament.manage`),
  bracket view (rounds as columns, winner highlight, champion banner), organizer reports results →
  winners advance → final crowns champion + marks DONE; per-match scheduling in tenant tz. Verified 17/17.
  - **Signup / quick / withdraw / champion award ✅ BUILT.** Create modes: **PICK** (choose entrants),
    **QUICK** (auto-fill everyone in a scope via peopleInScope + random seed, starts now), **SIGNUP**
    (status SIGNUP; `joinPolicy` OPEN=just join / APPLY=organizer approves; `requirements` text). Entrants
    join/apply + can **withdraw** during signup; organizer accepts applicants + **starts** (random-seeds the
    accepted into a bracket). Deciding the final **awards the champion** an official recognition AWARD
    (shows on the wall + notifies). `tournament_players.state` (APPLIED/ACCEPTED), `tournaments.rounds`
    nullable until start. Verified 13/13.
  - **RPS settle-it ✅ BUILT.** The two players in a match can settle it in-app with Rock-Paper-Scissors
    instead of waiting on the organizer. `POST /api/tournaments/:id/matches/:matchId/play {throw}` —
    players only (organizer can't play); both throw **blind** (`p1_throw`/`p2_throw` cols), and the moment
    both are in the winner is computed and run through the SAME `applyMatchWinner` advance/champion path as
    manual entry; a **tie clears both throws** for a replay. The detail exposes per-viewer `canPlay`,
    `myThrow`, `oppThrew` (boolean only — the opponent's actual throw is **never** sent until decided).
    Desktop shows ✊✋✌️ buttons on your live match and polls every 3 s (function-form `refetchInterval`)
    so a throw resolves without a refresh. Verified 12/12 (incl. no-leak + tie-replay).
  - **Next (forks):** auto-advance from other game activities (checkers/quiz result); double-elim /
    round-robin; auto time/court scheduling; "games won" feeds achievements (already wired as a metric).
- **Still future:** media-submission vote/comment competitions (needs MinIO); timed scavenger hunt (clue
  release via pg-boss, uses the tenant tz).
- **Media-submission competitions** — entrants submit a video/photo/link; **staff vote + comment**
  (reuse the recognition kudos+comments pattern + MinIO for uploads); leaderboard; scope-gated.
- **Scavenger hunt** — **timed clue release** (clues unlock at set times, in the tenant timezone — needs
  pg-boss scheduling), team submissions/answers, standings. The timezone setting above is a prerequisite.

### Usage log (admin-toggleable; for dept heads / higher-ups) ✅ BUILT
- Coarse, **content-free** view: who joined which sessions + the activity **TYPES** that ran
  ("Friday Standup · Alice · Checkers"). Derived from sessions/participants/activities — **never** content,
  and it never touches anonymity-critical tables (wellness, anonymous surveys, anonymous kudos).
- **Off by default** (`tenants.usageLogEnabled`, toggled in Settings, audited). **Fail-closed** authz
  (deliberate exception to no-lockout, since it's oversight): admin or the new scoped `usage.view`
  capability; NODE reach → your subtree only, ORG → all. Nav "Usage" appears only when you can view AND
  it's enabled (via `GET /api/usage/access`). `features/usage/routes.ts`. Verified 9/9.

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
