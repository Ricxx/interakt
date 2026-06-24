# The Office Game — design doc (working title)

> Status: **DESIGN — not built.** This is the plan to agree on before any code. Open questions are
> marked **[DECIDE]**. The game is an **optional, sellable module** (a plugin), **off by default**,
> **opt-in per user**, **admin-controlled**, with a **separate fun currency** that never touches real
> reward points.

## 1. Concept & pillars
You're an employee surviving/climbing the corporate ladder in a parallel, comedic version of the office.
Chaos happens to you; you scheme, defend, and react; a leaderboard tracks who's "winning" office life.

Pillars:
- **High interaction** (not a passive Tamagotchi): daily actions, player-vs-player schemes, reactions, defenses.
- **Risk/reward**: actions and schemes can pay off or **backfire**.
- **Named-colleague spice** (opt-in + disclaimer): the fun of "*Dave swapped your appraisal sheets and got your bonus*."
- **Server-wide chaos**: admins/scheduler trigger office-wide events (rain day, tax season, new policy).
- **Office-themed, friendly**: comedic corporate mishaps only. **Hard-excluded:** gambling/betting mechanics, drugs, violence/murder, anything that reads as harassment/discrimination. (Enforced by the curated event library + content policy.)

## 2. Tone, consent & safety (non-negotiable)
- **Off by default.** Admin enables the module (and the "name colleagues" sub-toggle separately).
- **Opt-in per user**, behind a **one-time disclaimer**: *"This is a comedic game. Events that name colleagues are fictional fun, randomly generated — not real claims, not personal. Be a good sport. Report anything that crosses a line."*
- **Targeted/named events only involve players who BOTH opted in.** A non-player is never named.
- **Friendly, curated language.** Events are office-mishap flavored ("swapped your appraisal sheets", "ate your labelled lunch", "took credit for your deck"). No protected-class, pay-dispute-real, or harassment framing.
- **Report path** reuses the existing moderation queue; admin can mute a player or kill the module instantly.
- All game data is **fictional flavor** — no real PII, no link to real performance/pay.

## 3. The currency (separate)
- A purely-for-fun currency — **[DECIDE] name**: "Office Bucks (OB)" / "Clout" / "Cred" / yours.
- **Separate append-only ledger** (`game_ledger`), walled off from real reward points/shop. RNG can be chaotic because nothing real is at stake.
- Balance = sum of ledger. **[DECIDE]** floor at 0, or allow a small "in debt" overdraft for flavor.
- Earn: daily actions, winning schemes, surviving events, defending, achievements.
- Lose: failed schemes, being targeted, taxes/policies, misfortune.

## 4. The core loop (this is the heart)
**Daily "shift" — energy/actions.** Each player gets **N action points/day** (**[DECIDE]** e.g. 3), refilled on a daily reset. Spend them on:
- **Do work** — safe, modest earn.
- **Slack off** — risky: usually fine (small earn), sometimes "caught" (lose), sometimes lucky (bonus).
- **Network** — build Reputation (defense) / favors.
- **Scheme** a colleague (PvP, §5) — the spicy one.
- **Defend / secure** — lower your chance of being a target for a while.

**Ambient events** fire on their own (scheduler, work-hours-aware) between actions:
- *Self*: "You found $50 in the vending machine. (+50)" / "Coffee on the keyboard. (−15)"
- *NPC*: fictional coworkers cause floor-wide mischief ("Gary microwaved fish — morale −10 each").
- *Targeted* (if enabled, both opted in): "Dave swapped your appraisal sheets and pocketed your bonus. (−40)" → you get a **reaction**.

**Reactions** — when something hits you, you may get a one-tap response: **retaliate** (counter-scheme), **report to HR** (an NPC — small payout, ends it), or **shrug it off** (tiny morale reward). Keeps it interactive, not just "stuff happens to me."

## 5. PvP schemes (interaction + backfire)
- Pick a target (opted-in) + a scheme ("swap appraisal sheets", "steal the good stapler", "take credit for the deck", "frame for the coffee machine").
- **Success chance** = base × your Cunning × (1 − target's Defense), with caps.
- **Success:** you gain / they lose OB; both notified with comedic text.
- **Backfire (the believaboat twist):** "Dave tried to swap your sheets — *and got caught!* He owes you 20 OB and takes a reputation hit." The target is rewarded; the schemer pays.
- **Cooldowns + caps**: limit how often you can hit the same person; daily scheme cap. Anti-bullying guardrail.

## 6. Server-wide events (admin + scheduled)
A **Game Master console** (admin) + a scheduler can fire office-wide events:
- "**Rain day** — everyone −5 morale."
- "**Tax season** — 10% of everyone's OB to the Office Pool."
- "**New policy** — anyone over Level 5 pays 30 OB/week for 3 weeks." (time-boxed recurring)
- "**Bonus Friday** — double earnings today."
- "**Audit** — top 3 richest get randomly 'investigated' (−X)."
These create shared, social moments and self-balance the economy (taxing the top).

## 7. Progression & stats (the multipliers)
- **Career ladder / title**: Intern → Associate → Manager → Director → VP → C-Suite, by lifetime OB or XP. Higher = more actions/bigger schemes, **but** bigger taxes + a bigger target on your back (self-balancing).
- **Stats** (the "multipliers" admins manage): **Hustle** (earn), **Cunning** (scheme success), **Reputation** (defense), **Luck** (event swing). Players earn/allocate small boosts; **admins set global multipliers** on each.
- **Achievements** reuse the existing engine. **Cosmetics** reuse profile flair/titles (fun-only).

## 8. Event library (built-in + office-extensible)
- A **curated built-in library** of weighted event templates: `{ key, category, text (with {actor}/{target} tokens), effectRange, targetType (SELF|RANDOM|NAMED|ALL), weight, conditions, enabled }`.
- **Admins can add/edit their own events** (office in-jokes) and adjust weights → keeps it fresh and local. New custom events pass a length/word check; the report path covers misuse.
- **[DECIDE]** moderation of admin-authored event text (auto vs. trust admin).

## 9. Admin controls, modules & plugin/monetization
- **Tenant entitlement** flag (the game is a **separately-sold plugin** — set in the original meeting/contract).
- **Master on/off** + **sub-modules**: PvP schemes, named-colleague events, server-wide events, custom events.
- **Global knobs**: earn rate, scheme success, event frequency, tax rates, starting balance, daily actions, debt floor, work-hours window.
- **Game Master console**: fire/schedule server-wide events; adjust multipliers; mute a player; reset.
- All admin actions audited.

## 10. Integration with the app
- A **"Game" nav item** (toggleable module, behind entitlement + opt-in).
- **Game dashboard**: your balance, title/level, daily actions, the **event feed**, leaderboard.
- **Notifications**: game events flow into the existing notifications feed (+ future OS toasts).
- **Realtime**: server-wide events broadcast over the existing WebSocket (feels live).
- **Leaderboards / achievements / cosmetics**: reuse existing patterns/engines.
- **Clearly separated** from real points everywhere (different colour/label) so no one confuses OB with real rewards.

## 11. Data model (sketch — not final)
- `game_settings` (tenant): entitlement, enabled, module flags, multipliers, economy params.
- `game_players` (tenant, userId): optedIn, level, xp, stats(jsonb), defenseUntil, actionsLeft, lastResetDay, status.
- `game_ledger` (append-only): tenant, userId, delta, reason, refType (ACTION|EVENT|SCHEME|TAX|GIFT), refId, day.
- `game_events` (library): tenant(null=built-in), key, category, text, effect, targetType, weight, enabled.
- `game_event_log`: occurrences (feed + lightweight audit).
- `game_schemes`: actor, target, type, outcome, day (+ cooldown lookups).

## 12. Cadence / scheduler
- **Daily reset** (refill actions, accrue recurring policies).
- **Ambient tick** (in-process interval, work-hours-aware): per opted-in player, low chance per window to roll an event.
- **Server-wide events**: scheduled or manual.

## 13. Anti-abuse & fairness
Cooldowns + per-target caps + daily scheme cap; report path; no real-money/gambling; excluded-content policy enforced by the curated library; admin kill-switch.

## 14. Build plan (vertical slices — agree, then build in order)
1. **Foundation & toy**: entitlement + opt-in + disclaimer; currency ledger; game dashboard; daily actions (Do work / Slack off); a starter built-in event library + ambient tick (self/NPC events only); event feed; basic leaderboard. *(Playable, safe, no PvP/naming yet.)*
2. **Interaction**: PvP schemes + backfire + reactions + defense; cooldowns/caps.
3. **Named-colleague events** (the spicy module, gated + disclaimer) + report integration.
4. **Server-wide events** + Game Master console + scheduled policies/taxes.
5. **Progression**: career levels, stats/multipliers, achievements, cosmetics.
6. **Admin-authored custom events** + multiplier console.

## 15. Open questions **[DECIDE]**
- Game + currency **name**.
- Daily **action count**; **debt** allowed or floor at 0.
- Career **level thresholds** + what each unlocks.
- Default **multipliers / tax rates / event frequency**.
- Moderation of **admin-authored** event text (auto-scan vs trust).
- Is the **entitlement** a manual operator flag for now (vs a real billing hook)?
