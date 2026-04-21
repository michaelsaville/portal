# Portal Auth — Deep Dive

Covers the three primary auth flows (magic-link, Entra SSO, passkey) plus the email-action-token pattern that's the core UX unlock. Password-based login is kept as a fallback but is explicitly the least-preferred path.

## Cookie & session model

- Cookie name: `portal_session`
- Format: opaque 32-byte hex (256 bits), server-verified against `PortalSession` table in Postgres. Not a JWT.
- Attributes: `httpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, 30-day `Max-Age`.
- Sliding window: each request updates `PortalSession.lastSeenAt` and, if within the last 7 days of expiry, extends `expiresAt` by 30 days. Users who visit weekly never see a re-login prompt.
- Absolute max session lifetime: 90 days (hard cap regardless of sliding).
- Bound metadata: `userAgent`, `ipAddress`, `activeClientId` (for multi-client users — the client they've "switched to" in UI).

## Flow 1 — Magic-link login (primary)

```
USER                        PORTAL                     EMAIL (M365)
 |                             |                            |
 | GET /login                   |                            |
 |---------------------------->|                            |
 | renders email input          |                            |
 |<----------------------------|                            |
 |                             |                            |
 | POST /auth/magic-link/request { email }                 |
 |---------------------------->|                            |
 |                             | findUnique PortalUser      |
 |                             | rate-limit check           |
 |                             | createMagicLink(LOGIN,     |
 |                             |   expires=now+15m,         |
 |                             |   usesLeft=1)              |
 |                             | consume prior unused       |
 |                             |   LOGIN links for user     |
 |                             | POST tickethub/internal/   |
 |                             |   send-email               |
 |                             |--------------------------->|
 |                             |                            | (M365 Graph
 |                             |                            |  sendMail)
 | 200 { "check email" }        |                            |
 |<----------------------------|                            |
 |                             |                            |
 | (clicks link)                                             |
 | GET /auth/magic?t=<token>                                |
 |---------------------------->|                            |
 |                             | verify token:              |
 |                             |  - exists                  |
 |                             |  - not consumed            |
 |                             |  - not expired             |
 |                             |  - purpose=LOGIN           |
 |                             | mark consumedAt=now        |
 |                             | createPortalSession        |
 |                             | Set-Cookie: portal_session |
 |                             | audit: LOGIN_MAGIC         |
 | 302 /dashboard               |                            |
 |<----------------------------|                            |
```

### Failure modes & responses

| Condition | Response | Why |
|---|---|---|
| Email not found | 200 "check your email" | No account enumeration. |
| Rate limit hit (5/hour/email or 20/hour/IP) | 429 "too many requests" | Prevent abuse. |
| Token expired | 410 Gone, "link expired" page with "get a new link" form | Not 4xx — friendlier copy. |
| Token consumed | 410 Gone, "already used" | Same friendly page. |
| Token mismatch | 404 | Fail closed, no detail. |
| User `isActive=false` | 403 "contact your MSP" | Prevent soft-deleted accounts from logging in via old links. |

### Token shape

- 32 bytes from `crypto.randomBytes(32)`, encoded `base64url` (43 chars, no padding).
- Unique index on column.
- Stored in full (no pre-hashing). Rationale: the DB itself is the trust boundary; pre-hashing buys nothing here the way password hashing does. Leaking the DB is catastrophic in either case.
- Time to brute-force: ignore. 256 bits of entropy.

### Email body sketch

```
Subject: Sign in to PCC2K Portal

Hi {first_name},

You can sign in to your PCC2K client portal using this link:

   [Sign in]  ← big button → https://portal.pcc2k.com/auth/magic?t=<token>

This link expires in 15 minutes and can only be used once.

If you didn't request this, you can ignore the email.

— PCC2K
```

## Flow 2 — Entra (M365) SSO

Standard OIDC authorization code flow. Portal is a new app registration, separate from DocHub's staff registration (so staff/client scopes don't collide).

### App registration notes

- App name: `PCC2K Client Portal`
- Redirect URI: `https://portal.pcc2k.com/auth/entra/callback`
- Supported account types: "Accounts in any organizational directory (Any Azure AD tenant - Multitenant)"
- API permissions: `openid`, `profile`, `email` only — we just need identity. No Graph/Mail/Files.
- Client secret: stored in portal env as `ENTRA_CLIENT_SECRET`; rotate quarterly.

### Flow

```
USER                      PORTAL                         ENTRA
 |                           |                             |
 | click "Sign in w/ M365"   |                             |
 | GET /auth/entra/start     |                             |
 |-------------------------->|                             |
 |                           | generate state, nonce       |
 |                           | set short-lived cookie      |
 |                           |   portal_oidc=...           |
 | 302 login.microsoftonline.com/.../authorize             |
 |<--------------------------|                             |
 | (Entra login UI)                                         |
 |----------------------------------------------------------->
 |                                                         |
 | 302 portal.pcc2k.com/auth/entra/callback?code=...       |
 |<----------------------------------------------------------
 |                           |                             |
 | GET /auth/entra/callback?code=...&state=...              |
 |-------------------------->|                             |
 |                           | verify state matches cookie  |
 |                           | POST entra/token            |
 |                           |   (client_id, secret, code) |
 |                           |---------------------------->|
 |                           | {access_token, id_token}    |
 |                           |<----------------------------|
 |                           | verify id_token sig + nonce  |
 |                           | extract email, name          |
 |                           | upsert PortalUser by email   |
 |                           | - if new: needs client link  |
 |                           |   (see "domain claim" below) |
 |                           | createPortalSession          |
 |                           | audit: LOGIN_ENTRA           |
 | 302 /dashboard            |                             |
 |<--------------------------|                             |
```

### Domain claim (auto-link to client on first Entra login)

New users logging in via Entra don't know which client they belong to. Options:

- **a. Domain whitelist per client.** Admin sets `Client.emailDomains = ["acmecorp.com"]`. First login matches → auto-links with default MEMBER permissions.
- **b. Invite-only for Entra.** User must be pre-invited; Entra login only works for users who already exist.
- **c. Holding pen.** Unknown Entra users are created but marked `pendingClientLink=true`; admin sees them in `/admin/pending` and approves.

**Recommendation: (a) first, (c) as fallback.** Domain whitelist covers 90% of cases; holding pen covers consultants and `@gmail.com` contacts.

### Entra ↔ magic-link interaction

- A user with both Entra SSO and magic-link access has one `PortalUser` row, just different login paths.
- If they link a passkey after Entra login, all three paths work.
- Logout wipes the portal session but does NOT end the Entra session (they'd click "Sign in with M365" and be logged in again silently).

## Flow 3 — Passkey (WebAuthn)

Copy DocHub staff's passkey implementation for portal; same shape.

### Registration

After first login (any method), `/account/passkeys` has "Add a passkey" button.

```
client requests options from /auth/passkey/register/options
  → { challenge, rpId: portal.pcc2k.com, rpName: "PCC2K Portal", user: {...} }
browser invokes navigator.credentials.create(options)
client POSTs attestation to /auth/passkey/register/verify
  → server verifies, stores PortalPasskey row
```

### Authentication

On `/login`, if browser supports conditional UI (autofill-driven passkey), the email field surfaces passkeys. User taps → `navigator.credentials.get()` → POST assertion to `/auth/passkey/verify` → session created.

### Notes

- `WEBAUTHN_RP_ID = "portal.pcc2k.com"` — **different from DocHub's RP ID** (so staff passkeys don't leak into portal and vice versa).
- `WEBAUTHN_ORIGIN = "https://portal.pcc2k.com"`.
- Vault unlock (§5 of PLAN.md) will prefer passkey if enrolled, else fall back to password. This replaces DocHub's current "re-type your login password to unlock vault" UX.

## Flow 4 — Password (legacy fallback)

Tab on `/login` labeled "Use password instead." Only shown if `PortalUser.passwordHash` is not null.

Same scrypt verification as DocHub's current portal (salt:hex format, cost parameters carried over verbatim).

No password reset flow in v1 — admin resets by sending a new magic-link with purpose `PASSWORD_RESET` → user sets a new password on landing. (Phase 5 adds self-service "forgot password" which is literally the same flow triggered by the user.)

## Flow 5 — Email-action token (the big UX unlock)

Not a login flow. An action token is a `PortalMagicLink` with `purpose=ACTION_*` that represents intent to perform one specific action.

```
EMAIL                       PORTAL
 |                             |
 | user clicks                 |
 | https://portal.pcc2k.com/a/<token>
 |---------------------------->|
 |                             | verify token:
 |                             |  - exists, not consumed, not expired
 |                             |  - purpose starts with ACTION_
 |                             | examine purpose + payload:
 |                             |   ACTION_APPROVE_ESTIMATE {estimateId}
 |                             |   ACTION_ACK_REMINDER {reminderId}
 |                             |   ACTION_SNOOZE_REMINDER {reminderId, days}
 |                             |   ACTION_CONFIRM_APPT {apptId}
 |                             |   ACTION_PAY_INVOICE {invoiceId}
 |                             |
 |                             | does user already have a valid PortalSession?
 |                             |   yes → use it
 |                             |   no  → createPortalSession for token's user
 |                             |         with absoluteExpiry=now+30m
 |                             |         (enough to complete the action)
 |                             |
 |                             | route by purpose:
 |                             |   ACTION_APPROVE_ESTIMATE →
 |                             |     302 /estimates/{id}?via=email&ticket=<action_token>
 |                             |     (action_token passed so the Approve button
 |                             |      can consume it on submit)
 |                             |   ACTION_ACK_REMINDER →
 |                             |     perform action immediately,
 |                             |     consumedAt=now,
 |                             |     show "Acknowledged, thanks" page
 |                             |   …
 | 302 /estimates/1234?via=email
 |<----------------------------|
```

### Why a short-lived session after click

Research insight: if the user clicks an email button, they're ALREADY in a trusted action. Forcing them through a login at that moment is pure friction. The short-lived session (30 min max) gets them to the confirmation page and lets them poke around if they want, but expires before the device is re-used by someone else.

### Action-token lifecycle

- Created by DocHub or TicketHub when composing email.
- TTL: 30 days (matches current TicketHub estimate-link expiry).
- Single-use by default (`usesLeft=1`). Reminders are single-action.
- Action tokens are *never* valid for login purposes — the handler rejects LOGIN-like operations.
- Consuming an action token does NOT extend the user's main portal session cookie.

### Security nuance: "clicked from shared device"

If user forwards the email or reads on a shared device, action could be performed by a non-authorized party. Mitigations:

- High-impact actions (APPROVE_ESTIMATE, PAY_INVOICE) show a confirmation page with typed-name signature + checkbox, not one-click.
- Low-impact actions (ACK_REMINDER, SNOOZE_REMINDER) one-click is fine — worst case is a forwarded reminder gets dismissed; we can re-send.
- Audit log captures IP + user-agent for every action; tech can verify if a dispute arises.

## Admin auth (the staff side of the portal)

`/admin/*` in the portal is for PCC2K staff only, not for client users.

- Uses NextAuth + Entra AD, same configuration DocHub staff uses today.
- Same `StaffUser` allow-list table. Portal admin doesn't have its own user table.
- `requireAuth("ADMIN")` gate on every `/admin/*` route (fixing the current DocHub gap where any TECH can promote portal owners).
- Admin sessions are entirely separate from portal user sessions — different cookie names, different auth provider.

## Session revocation

Admin and user both need this.

- **User self-service:** `/account/sessions` lists all active sessions (device label, IP, last seen). "Sign out" button on each row calls `DELETE /api/auth/sessions/:id`. Useful for "I left it logged in on the office PC."
- **Admin:** `/admin/users/:id/sessions` same UI, admin-scoped. "Kill all" button.
- **Automatic:** on email change, on password change, on `isActive=false`.

Revocation deletes the row; next request reads no session and redirects to `/login`. No blacklist needed.

## Audit log

Every auth event goes to `PortalAuditEvent`:

| eventType | target |
|---|---|
| LOGIN_MAGIC / LOGIN_ENTRA / LOGIN_PASSKEY / LOGIN_PASSWORD | user |
| LOGIN_FAILED (with reason) | email (may not be a user) |
| SESSION_REVOKED | session |
| MAGIC_LINK_REQUESTED | user |
| MAGIC_LINK_CONSUMED | link |
| ACTION_CONSUMED (with purpose) | link + target resource |
| PASSKEY_REGISTERED / PASSKEY_REMOVED | passkey |
| ADMIN_USER_CREATED / ADMIN_USER_DEACTIVATED / ADMIN_SESSION_KILLED | user |
| ADMIN_PERMISSIONS_CHANGED | user + diff |
| VAULT_UNLOCKED / VAULT_LOCKED / VAULT_ITEM_REVEALED | vault item |

Retention: 1 year. `/admin/audit` viewer in Phase 5.

## What we're NOT doing

- **SMS-based login or 2FA.** Magic-link via email already provides possession-factor, and SMS is measurably worse security. If we ever need MFA, passkey or TOTP is the path.
- **OAuth as a consumer of third-party identity (Google, GitHub).** Entra covers the client-side M365 story. Consumer OAuth adds surface area without adoption benefit for MSP clients.
- **Federated-to-DocHub-staff sessions.** Staff log in separately on dochub.pcc2k.com; they don't use the client portal. No SSO bridge between the two sides.
