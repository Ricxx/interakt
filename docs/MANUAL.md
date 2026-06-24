# CES — User & Admin Manual

A living guide to every screen, written section by section as we walk the app. Each section
covers what a normal user sees and does, then any admin-only extras.

---

## Dashboard

Your landing screen after sign-in — a personal hub that only surfaces things that need you.
It does **not** show empty "0" tiles; cards appear only when there's something in them.

### What you see

- **Welcome header** — your avatar, first name, and your status line. Click the status
  (or "+ Set a status") to open your profile and edit it.
- **Wellbeing nudge** *(only if it applies)* — if you've flagged feeling stressed a few times
  recently, a gentle amber note suggests opening Wellness. This is computed **on your device
  only** — your individual moods are never sent to the server.
- **Streak card (top)** — your 🔥 daily-streak count and points balance, with the **Daily
  check-in** button. Checking in each day grows your streak and earns points (plus a bonus the
  longer the run, and any special reward set for that day). Once you've checked in it shows
  "✓ Checked in today".
- **Daily draw (the attached strip below)** — one free spin a day for bonus points. Press
  **Spin**; if you've already played it says to come back tomorrow. "View calendar →" opens your
  check-in calendar.
- **Attention tiles** *(only when non-zero)* — quick counts for Invitations & live sessions,
  approvals awaiting you, and upcoming events. Click to jump straight there.
- **Coming up** — your next sessions and events, in time order.
- **Big-ups & awards you've received** — recent recognition from colleagues.
- **Recent task activity** — the latest updates on your to-dos.
- **Try out** — shortcuts to start common things (run a session, give a big-up, plan an event,
  Wellness, build a survey, make a quiz, start a list, post to a board).

### Streaks & being away

Streaks are kept by **checking in each day** — there's no "I'm on leave" button (it caused
confusion and could be misused). If someone is genuinely away and misses days, an **admin can
protect those days** so the streak holds (below).

### Admin: fixing a streak for someone

If you have the **"Set daily check-in rewards" (reward.manage)** permission (admins always do):

1. Open the person's profile (click their name anywhere, e.g. in the Directory).
2. In the **Streak fix-up** box you'll see their current streak and any already-protected days.
3. Pick a date they were genuinely away and press **Protect day** — their streak will bridge
   that gap. Click a protected day's chip to remove it again.

Every fix-up is recorded in the audit log. Members cannot do this themselves.

### Related

- **Calendar** shows your check-in history and any day-specific rewards (admins set rewards there).
- **Shop** is where points are spent.

---

## App lock (PIN) & staying signed in

You stay **signed in for 30 days** (so the app is just *there* day to day). For shared or unattended
machines, set a **PIN lock**: the **🔒** button at the bottom of the sidebar. A PIN covers the screen
without logging you out — it's a local privacy gate on *this device* only (it never leaves your machine).

- **🔒 left-click** = lock now (once a PIN is set); **right-click** = manage (set/change/remove PIN + options).
- Options: **lock when idle** (2–30 min, or never) and **require PIN when the app opens**.
- Forgot the PIN? It's device-local — clearing the app's site data resets it; your account is unaffected.

## Footer (every screen)

At the bottom of the sidebar: **Help · Report a bug · Privacy**, centered, with a light, centered
**© {year} {workspace} · v{version}** line underneath (the year is always current). Each link opens a
pop-up over a soft blurred backdrop. Admins can hide the copyright/version line in **Settings →
Branding** ("Show … in the footer").

- **Help** — a quick orientation to the app.
- **Report a bug / idea** — pick 🐞 Bug or 💡 Idea, describe it, send. It includes only the page you're
  on. Reports go to your **workspace admin**, who can forward the useful ones to the makers.
- **Privacy** — a plain-language summary: anonymous submissions stay anonymous, aggregates hide small
  groups, you can download or erase your data, and nothing is sold or shared outside your organisation.
- **vXX** — the app version.

### Admin: Feedback inbox (Oversight → Feedback)

Admins see every bug/idea report. For each you can **Forward to makers** (emails them if a vendor address
is configured; always flags it) or **Close** it. The sidebar shows a badge with the count of new reports.

---

## Terms & Privacy (Settings → Terms & Privacy, admin)

Admins can write/edit the **Terms of Service** and **Privacy Policy**. Saving an edit **bumps the version**,
which **re-prompts everyone to accept it the next time they log in** — a full-screen acceptance step they
must complete before using the app. The footer **Privacy** link shows the published Privacy Policy.

## AI assistant (Settings → AI, admin sets up)

**Bring your own key — your organisation pays for its own AI usage; the vendor never does.**

Setup (admin): enable AI, pick a **provider** (Anthropic / OpenAI / Google) and a **model** (each shows its
rough $/1M-token price), and paste your provider **API key**. The key is encrypted at rest and never shown
again (only a "saved" indicator). Set a **weekly token cap** (whole workspace) and a **per-user daily cap**
— 0 means unlimited. When a cap is hit, the assistant politely defers until it resets.

Usage & cost: the AI card shows **estimated spend this week / last 30 days**, your weekly-cap progress, and
the **top users** by tokens — so you can spot anyone burning a lot.

For everyone: once it's on, an **✨ Ask AI** link appears in the footer. It answers "how do I…" questions
about CES — and *only* about CES (it's grounded in the product guide, so it won't wander off-topic or invent
features). It never sees your personal data; only token counts are recorded (never the question or answer).

## Statistics (Oversight → Statistics)

A four-tab analytics suite with **⬇ CSV** (daily metrics, spreadsheet-friendly) and **⬇ JSON** (full
report) exports. **Anonymous data (wellness, complaints) is only ever counted, or averaged over groups
of 5+ — never tied to a person.**

**Who sees what (scoping).** Admins (and anyone with *View statistics* at **org** reach) see the whole
organisation. A manager granted *View statistics* at **node** reach sees **only their team** — the
people and content in their part of the org tree — with a "Scoped to your team" badge. Everyone else
has no access. Anonymous feedback counts are shown only at the org level (a team manager can't be given
attributed counts without risking identification).

**Overview** — a 🌡️ **temperature check** of warning signals; headline KPIs with **▲/▼ vs the previous 14
days**; **weekly-active %** and **engagement tiers** (members by when they last checked in — today / this
week / this month / dormant); at-risk pointer; member growth, in-meeting reach; plus 14-day charts.

**People** — every member with their **individual stats** (last check-in, check-ins/30d, last login, points,
recognition), **searchable** by name/role/dept and **filterable** by department or "**Members to check in
on**" (the at-risk people — no check-in or login for 14 days). Click anyone to open their profile.

**Teams** (admins only) — a **department comparison**: each top-level team ranked by check-in engagement,
with headcount, recognition, and average wellbeing (shown only for teams with 5+ check-ins).

**Engagement** — login activity (successful & failed sign-ins, distinct people); **reach by area** (views,
distinct people reached, reach % of the workforce); and **most-viewed items** — specific boards, surveys,
quizzes and sessions people actually opened.

**Programs** — recognition (totals, stars, **recognised %** + **gave-recognition %** of members over 90d —
shows whether it's widespread or concentrated — a **per-week** trend, by badge, most-recognised people);
wellbeing (check-in count, average stress, distribution [5+ only], and a **check-ins-per-week** trend); and
a **survey funnel** per survey: views → started → completed, completion rate and average progress.

**Content** — **quizzes** (players, average score, 🏆 winner); **announcement reach** (recipients,
how many **opened** it, and acknowledged); **🏆 tournament champions**; **events** (count, fundraisers,
amount raised, photos); **achievements earned** (and the most-earned); **in-session activities run** by
type (polls, Q&A, dot-vote, word cloud…); board posts & most-discussed; tasks/requests/feedback per day;
**complaints per week** (last 12 weeks — anonymous volume only); and shop redemptions by item. The Overview tab also shows **member growth** (new sign-ups/day, disabled
accounts) and **in-meeting reach** (distinct people who actually joined sessions — phone joiners
included); the Programs tab shows a **6-week stress trend** (weeks under 5 check-ins stay hidden).

**How reach & logins are measured:** as people move around the app, each area (and the specific item, when
the screen has one) is logged — just the area/item, the person, and the day, never *what* they did. Login
successes and failures (wrong password on a real account) are recorded for the security view. Most other
numbers are derived directly from the underlying data, so they're accurate from day one; reach/view
numbers build up from when tracking started.
