# Data retention & erasure

> Engineering record, **not legal advice.** Confirm periods and obligations with counsel /
> your data-protection officer. Anything touching anonymity/identity gets a careful human read.

## Why

CES holds personal data about employees and (separately) anonymous feedback. Three regimes
drive how long we may keep it:

| Principle | 🇯🇲 Jamaica DPA 2020 | 🇪🇺 GDPR | 🇺🇸 US (CCPA/CPRA + states) |
|---|---|---|---|
| Storage limitation | Standard 5 — no longer than necessary | Art 5(1)(e) | CPRA: disclose + honour retention periods |
| Right to erasure | Yes | Art 17 | CCPA delete (covers employees since 2023) |
| Right of access | Yes | Art 15 | CCPA |
| Accountability / records | OIC registration, DPO | Art 30 | disclosure |
| Sensitive data | health etc. | Art 9 (wellness = health) | CPRA "sensitive PI" |

Jamaica's DPA tracks GDPR closely, and GDPR is stricter than current US state law for HR data,
so **building to GDPR grade satisfies all three.**

## What protects us by design

- **Suggestions / complaints / wellness check-ins are FORCED_ANON** — no identity stored, so they
  are arguably not "personal data": storage-limitation/erasure rights barely attach because we
  provably cannot link an item to a person. The submitter's **claim ticket** is the only handle.
- **Coarse `created_day` + k≥5 aggregates** stop re-identification.
- **No vault DB** exists (FORCED_ANON needs none) → no identity map to retain or leak.

So retention work targets the **identified** data: `users` (+ profile fields), and the
append-only `audit_log` / `points_ledger` (kept for accountability).

## What we built

1. **Erasure = anonymize, not delete** (`features/retention/anonymize.ts`). Admin → Members →
   *Erase*. Scrubs PII on the `users` row (name → "Former member", email → `erased-…@removed.invalid`,
   nulls avatar/status/hobbies/school/title/flair/colour, clears password, `erased_at` set) but
   **keeps the row** so the audit/ledger hash-chains stay intact and verifiable. Satisfies erasure
   "to the extent possible" while honouring the accountability basis to retain immutable records.
2. **Offboarding** — *Deactivate* (reversible) sets `status=DISABLED` + `deactivated_at`, starting
   the PII clock; *Reactivate* undoes it (unless already erased).
3. **Retention schedule** (`retention_settings`, one row/tenant, **off by default**). Admin-editable
   in Settings → Data retention: resolved complaints (default 12 mo), raw wellness (90 d), offboarded
   PII (60 d). "Run now" + a daily in-process sweep (`features/retention/job.ts`). Only opted-in
   tenants are touched. Purges are audited by **counts only** (`retention.purged`).
4. **Audit log & ledgers are NEVER auto-purged** — append-only integrity wins; purging them, if ever
   needed, is a manual, rehearsed operation.

5. **Right of access / subject access request** (`features/privacy/routes.ts`, `GET /api/me/export`).
   Self-service "Download my data" (profile overlay) returns a JSON bundle of everything LINKED to
   you: profile, points ledger, recognition given/received, achievements, group memberships, event
   contributions. Anonymous artifacts are **excluded by design** — they carry no identity, and the
   bundle says so. The honest, correct answer to a SAR under FORCED_ANON.

## Open / future

- Move the daily sweep onto **pg-boss** once it's wired (today it's an in-process interval, fine for
  the single-box deploy).
- Windowed audit purge with a re-anchored checkpoint hash (only if a legal period demands it).
