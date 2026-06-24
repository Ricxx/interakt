# CES — High-value roadmap

Where the product is: a comprehensive **internal** engagement suite (sessions/activities, recognition,
wellness, gamification + rewards shop, feedback/suggestions, events, surveys/quizzes, tournaments,
boards/lists/tasks, org/RBAC, audit, retention/GDPR, moderation, branding, and now a deep stats suite).

What's missing to **drastically** increase value falls into a few themes. Each item notes the value, the
rough build effort, and whether it stays inside the build doctrine (no heavy infra, mostly in-house).

## 🔥 Biggest levers (recommend for the 3-day window)

1. **Slack / Microsoft Teams integration (outbound)** — *huge adoption, low infra.*
   Admin pastes an incoming-webhook URL per workspace/channel; CES posts recognition, announcements,
   poll results, "employee of the week", at-risk nudges into Slack/Teams. **Meeting people where they
   already work is the single biggest engagement multiplier.** No broker, just HTTPS POST. ~1–1.5 days.

2. **Email notifications & digests** — *re-engagement engine.* We already send invite/reset email.
   Add: "you were recognised", new announcement, **weekly personal recap**, and a **manager Monday
   digest** (your team's check-in rate, at-risk people, new recognition). Drives people back in.
   Reuses SMTP + pg-boss-less in-process scheduler we already have. ~1–1.5 days.

3. **Real reward fulfilment** — *makes the points economy "real".* Today points buy
   manually-fulfilled perks/codes. Integrate a gift-card API (Tremendous/Tango) so points →
   actual gift cards automatically. Needs one external API + budget controls. ~1.5–2 days (or stub the
   provider and ship the budget/approval flow first).

## 🏢 Enterprise utility (drives the buyer, not just the user)

4. **Real SSO (OIDC/SAML)** — Okta/Azure AD/Google Workspace. The doctrine always intended SSO; the
   built app uses password login. Table-stakes for selling to IT. ~2 days.
5. **HRIS / directory sync** — auto-provision users + org tree from BambooHR/Workday/SCIM. Removes the
   biggest admin chore. (CLAUDE.md parks this — revisit for enterprise.) ~2–3 days.
6. **Manager toolkit** — **1-on-1s** (shared agenda, notes, action items), **goals/OKRs**, lightweight
   **continuous/360 feedback** cycles. Turns CES from "fun" into "runs my team". ~2 days each.
7. **Onboarding journeys** — new-hire checklists, buddy assignment, 30/60/90 plans. High HR value. ~1.5 days.
8. **eNPS campaigns + trend** — the headline metric execs ask for; we already have the survey + k-anon
   machinery. ~1 day.

## 🎨 Customization & reach

9. **Localization (i18n)** — multi-language UI. Critical for any global org. ~2 days (framework) + ongoing.
10. **White-label polish** — custom email templates, custom domain, fuller theming (we have accent +
    name + logo emoji already). ~1 day.
11. **Native-feel mobile (PWA)** — installable, push-capable. Engagement lives on phones. ~2–3 days.
12. **Public API + webhooks** — let orgs build on CES. ~1.5 days.

## 🤖 AI (the parked layer — focused, high-value uses)

13. **AI theme/sentiment insights** — auto-summarise survey + suggestion themes (aggregate-only, never
    "who"), surface "what changed this week", flag sentiment shifts. This is where AI genuinely adds
    value on data you already collect. ~1.5 days (needs the Anthropic SDK + key — currently unbuilt).
14. **AI onboarding guide / in-app assistant** — the "training how to use the tools" idea: an assistant
    that answers "how do I run a poll?" and suggests next actions. ~1.5 days.
15. **AI-assisted facilitation** — icebreaker/meeting-prompt generation in-session. ~0.5 day.

## 📊 Analytics next (building on the new stats)

16. **Scheduled report emails** (weekly stats to admins/managers) — pairs with #2. ~0.5 day.
17. **Benchmarking** (vs anonymised peers / historical baselines) + **predictive attrition risk**
    (extend the at-risk signal). ~2 days.
18. **Date-range picker + custom dashboards** for stats (deferred from the stats build). ~1.5 days.

---

### Recommended 3-day plan
**Slack/Teams outbound (#1) + Email digests/notifications (#2)** — together they create the *return loop*
that every engagement product lives or dies on, both are buildable in-house with no new infra, and they
make everything already built far more visible. If there's a 4th slot: **eNPS (#8)** or **1-on-1s (#6)**.
