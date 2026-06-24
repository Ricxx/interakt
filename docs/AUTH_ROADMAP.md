# Login & identity — roadmap (features needed later)

> Captures the authentication/onboarding features to build before a wide / enterprise launch.
> Status: ✅ built · 🔨 needed (with rough effort) · 🧭 decision. Today the app is **email + password**.

## Where we are today (✅)
- **Email + password** login (scrypt-hashed; no passwords stored in clear).
- **First-user-admin bootstrap** + a **local break-glass admin** (always works, even if SSO later breaks).
- **Invite by email** (single) → accept link → user sets their password.
- **Open self-registration** mode (`registrationMode = OPEN`) → self-register → lands **Pending** → admin approves.
- **Forgot / reset password** flow.
- **Account lifecycle**: invite / approve / reject / **deactivate / reactivate / erase**; status ACTIVE/DISABLED/PENDING; disabled accounts are blocked at login instantly.
- **RBAC**: roles + permission groups + scoped capabilities.
- **30-day "stay logged in" session**; **device-local PIN app-lock** (privacy gate, doesn't log out).
- **Auth rate-limiting** (10/min); **login success + failure** are recorded for the security stats.
- Schema already has placeholders: a `totpSecret`-style hook (2FA) and a note that **OIDC subjects** get added to user rows later.

## What's missing (the gaps, by theme)

### A. SSO / "log in with what they already use" 🔨
The single biggest gap. Standards-based, so **one OIDC build covers most providers** (Azure AD/Microsoft, Google, Okta, Auth0, Clerk) by config.
- 🔨 **OIDC Auth Code + PKCE** core (the doctrine's intended auth). Admin pastes issuer + client id/secret. **~2 days.**
- 🔨 **"Log in with Google / Microsoft"** presets first — the accounts no-IT companies already have. *Highest priority.*
- 🔨 **JIT provisioning** — first SSO login auto-creates the CES account (map email/name; default role; map IdP groups → dept/role optionally).
- 🔨 **SAML 2.0** — some enterprises mandate it. Bigger; do after OIDC if demand appears. **~2 days.**
- 🧭 **Multi-IdP per tenant?** (e.g. SSO for staff + password for contractors.) Decide if needed.
- Principle: **keep break-glass local admin** so a misconfigured IdP can't lock everyone out.

### B. Provisioning & bulk onboarding 🔨
For "set up 2,000 staff" without doing it by hand.
- 🔨 **CSV bulk import** — upload name/email/role/dept → create accounts + per-user **"set your password" links** (emailed or exported). The direct answer to mass onboarding. **~1 day.** *(Highest near-term priority alongside Google/MS login.)*
- 🔨 **Domain auto-approve** — "anyone with `@acme.com` may self-register and is auto-activated" → zero per-user admin. **~0.5 day.**
- 🔨 **Bulk admin actions** — bulk-approve pending, bulk-deactivate (offboarding a team). **~0.5 day.**
- 🔨 **SCIM 2.0** — the IdP/HRIS (Azure AD, Okta, BambooHR…) pushes hires/leavers → CES auto-provisions/deprovisions. The "manage access in HR, not in CES" answer at scale. **~2–3 days.**
- 🔨 **HRIS / directory sync** (BambooHR/Workday) — via SCIM or a direct sync; CSV is the low-tech fallback.

### C. Account security 🔨
- 🔨 **2FA (TOTP authenticator app)** — the schema hook exists; add enroll + a verify step in login. Optionally enforce per-role/tenant. **~1.5 days.**
- 🔨 **WebAuthn / passkeys** — passwordless, phishing-resistant. Nice later.
- 🔨 **Magic-link / passwordless email login** — low-friction option for non-SSO users.
- 🧭 **Password policy** — strength rules, breach/HIBP check, expiry (or deliberately none), lockout after N failures (today it's only rate-limited). Decide the stance.

### D. Sessions & devices 🔨
- 🔨 **Sliding sessions** — refresh the 30-day cookie on activity so active users never get logged out.
- 🔨 **Active-sessions / devices list** + **"sign out everywhere"** (revoke all sessions) — important once SSO/sensitive.
- 🔨 **Forced logout on disable/erase** — confirm a disabled user's existing session dies immediately (not just blocked at next login).
- 🔨 **Step-up auth** — re-prompt PIN/2FA for sensitive actions (erase member, change billing, edit legal).

### E. Audit & compliance ✅/🔨
- ✅ Login success/failure recorded (stats); privileged actions hash-chain audited.
- 🔨 Surface an **auth audit view** (logins, failures, SSO events, provisioning) for admins/security.
- 🔨 IP allowlist / session-policy controls (enterprise ask).

## Recommended sequence
1. **CSV bulk import + domain auto-approve + bulk admin actions** (B) — unblocks "2,000 staff" *now*, no SSO needed. *(Smallest, highest immediate value.)*
2. **"Log in with Google / Microsoft" (OIDC core + JIT)** (A) — the real onboarding fix for most companies.
3. **2FA (TOTP)** (C) — security baseline; hook already stubbed.
4. **SCIM** (B) + **generic OIDC/SAML** (A) — when selling to larger / IT-heavy customers.
5. Sessions/devices polish (D) + auth audit view (E) as hardening.

## Design principles (carry through)
- **Standards-based** (OIDC/SAML/SCIM) → one build serves many providers; avoid per-vendor hacks.
- **Always keep a local break-glass admin** + the option of password login, so SSO/IdP outages can't lock a tenant out.
- **JIT + SCIM** = the path to "manage people in your IdP/HR, CES follows."
- See also: `docs/ROADMAP.md`, `docs/LAUNCH_CHECKLIST.md`.
