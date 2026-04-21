# PCC2K Client Portal — Master Plan

> Target: `portal.pcc2k.com` — a unified, client-facing "single pane of glass" that replaces and subsumes the two existing portals on DocHub and TicketHub.
>
> Repo and DNS will be created 2026-04-22. This doc is the plan as of 2026-04-21 evening, after a full recon of both existing portals.

---

## 1. Why a third repo (vs folding into one of the two)

This is the foundational decision — everything else depends on it.

### The three options considered

| Option | Portal lives in… | Owns identity? | Pros | Cons |
|---|---|---|---|---|
| A. Portal = third repo, thin BFF, no DB | New Next app at `portal.pcc2k.com` | No — delegates to TicketHub `tH_ContactPortalToken` + DocHub `PortalUser` | Zero data migration; ships fastest | Keeps the two-identity-system mess. Hard to add new cross-cutting features (SSO, passkey, unified login history). |
| **B. Portal = third repo, owns identity layer** | New Next app, own DB tables for user/session/token/passkey/vault | **Yes** | One identity system. Clean split: DocHub/TicketHub own *their* data, portal owns *who can see it*. Matches the CloudRadial/DeskDirector pattern exactly. | Migration work: move `PortalUser` + `PortalCredential` + `PortalVaultSession` from DocHub; add magic-link layer that subsumes TicketHub's token table. |
| C. Fold into DocHub (keep one app) | Expand DocHub portal to include TicketHub data via cross-app calls | N/A (DocHub owns it) | No new infra | DocHub becomes a monolith for two unrelated products. Can't scale the portal's UX/auth model independently. Ownership ambiguity — does the DocHub repo "contain" TicketHub's customer UI? |

### Decision: **Option B**

Reasons:

1. **The research says single-pane portals win only when identity is unified.** Magic-link alone gets 30–40% → 75%+ adoption. Two systems = two login UXs = zero adoption.
2. **The MSP-overlay pattern (CloudRadial, DeskDirector, Invarosoft) is exactly "third repo that owns identity + calls the PSA/docs via API."** That's the proven shape.
3. **DocHub's `PortalUser` and TicketHub's `tH_ContactPortalToken` are already split by accident** — they were never designed to talk to each other. Keeping them split costs more over time than unifying them now.
4. **Option A's "thin BFF, no DB" sounds lean but fails on day-one UX work** — the moment we want a magic link that *also* logs you into the session-based side, we need a bridge. That bridge IS a portal identity layer. Building it properly now avoids a second migration later.

### Non-goals

- Not building a PSA, not building a docs app — those stay as DocHub and TicketHub. Portal is presentation + identity only, plus small amounts of cross-cutting state (vault, preferences, notifications).
- Not shipping a native mobile app. PWA + responsive web only (per research — every vendor ships a native app, no small-MSP customer uses one).
- Not shipping a community forum or chatbot in v1.

---

## 2. Architecture

```
                                                 ┌───────────────────────────────────┐
                                                 │        portal.pcc2k.com            │
                                                 │  (new repo, Next.js, own Postgres)  │
                                                 │                                     │
                                                 │  Owns:                              │
                                                 │   • PortalUser, PortalSession       │
                                                 │   • PortalMagicLink, PortalPasskey  │
                                                 │   • PortalVault*                    │
                                                 │   • PortalPreference                │
                                                 │                                     │
                                                 │  Reads via HTTPS BFF:               │
                                                 │   • DocHub (docs/assets/licenses…)  │
                                                 │   • TicketHub (tickets/estimates/…)  │
                                                 └──────────────┬──────────────────────┘
                                                                │ service-to-service
                                                                │ (HMAC or mTLS)
                                     ┌──────────────────────────┼───────────────────────────┐
                                     ▼                                                      ▼
                  ┌──────────────────────────────────┐                    ┌───────────────────────────────┐
                  │       dochub.pcc2k.com           │                    │     tickethub.pcc2k.com       │
                  │  (staff admin — unchanged UX)     │                    │   (staff admin — unchanged)   │
                  │                                   │                    │                               │
                  │  Exposes NEW endpoints under       │                    │  Exposes NEW endpoints under   │
                  │  /api/bff/portal/*:                │                    │  /api/bff/portal/*:            │
                  │   • GET /persons/:id                │                   │   • GET /contacts/:id           │
                  │   • GET /clients/:id/assets         │                   │   • GET /clients/:id/tickets    │
                  │   • GET /clients/:id/documents      │                   │   • GET /clients/:id/estimates  │
                  │   • GET /clients/:id/licenses       │                   │   • GET /clients/:id/invoices   │
                  │   • …                               │                   │   • POST /estimates/:id/respond │
                  └──────────────────────────────────┘                    │   • POST /reminders/:id/ack     │
                                                                            │   • …                          │
                                                                            └───────────────────────────────┘
```

### Why BFF, not direct DB

We briefly considered having the portal share DocHub's or TicketHub's database. It's tempting (one Prisma schema, no HTTP hop). Rejected because:
- DocHub's schema is a 1670-line monolith. Portal doesn't need 95% of it.
- TicketHub lives in its own Postgres schema. Cross-schema Prisma is painful.
- Shared DB = tight coupling = schema migrations block portal deploys.

HTTP BFF isolation pays for itself on day one: portal ships on its own cadence, DocHub and TicketHub don't know or care about portal UI changes.

### Cross-service auth

Portal calls DocHub/TicketHub BFFs with a **service bearer token** (shared secret in env), scoped by HMAC signature of the request body + timestamp. Both downstream apps verify before serving. Rotate quarterly. This is not the portal user's session token — that stays in the portal; DocHub/TicketHub never see customer cookies.

---

## 3. Identity model

### The tables portal owns

```
PortalUser
  id               cuid
  email            string unique (lowercase)
  name             string
  phone            string?
  passwordHash     string?        // nullable — magic-link or SSO users have none
  isActive         bool
  lastLoginAt      datetime?
  createdAt/updatedAt

PortalUserClientLink                     // FIXES the single-client limit
  id               cuid
  portalUserId     fk
  clientId         string          // DocHub Client.id (authoritative)
  role             string          // "OWNER" | "BILLING" | "TECHNICAL" | "USER" | "VIEWER"
                                   //   Stored as string so the set can move to a
                                   //   PortalRole table + FK later without an enum drop.
                                   //   Validated at app layer. See app/lib/portal-roles.ts.
  permissions      json            // Per-link overrides on top of the role's preset.
                                   //   Empty = use preset as-is. { assets, documents,
                                   //   tickets, invoices, estimates, payments, ... }
  createdAt

PortalSession                             // replaces DocHub PortalSession
  id               cuid
  token            string unique   // 32-byte hex cookie value
  portalUserId     fk
  activeClientId   string?         // currently-selected client for multi-client users
  userAgent        string?
  ipAddress        string?
  lastSeenAt       datetime
  expiresAt        datetime        // 30-day sliding window
  createdAt

PortalMagicLink                           // replaces tH_ContactPortalToken, adds email-action tokens
  id               cuid
  token            string unique   // 32-byte url-safe random
  portalUserId     fk
  purpose          enum {LOGIN, ACTION_APPROVE_ESTIMATE, ACTION_ACK_REMINDER, ACTION_SNOOZE_REMINDER, ACTION_CONFIRM_APPT, ACTION_PAY_INVOICE}
  payload          json?            // e.g. {estimateId, reminderId}
  consumedAt       datetime?        // single-use unless recurring
  usesLeft         int              // for multi-use links (default 1)
  expiresAt        datetime         // always set; default 7 days for LOGIN, 30 days for ACTION_*
  createdAt

PortalPasskey                             // WebAuthn — new to portal (staff has it, portal doesn't)
  id               cuid
  portalUserId     fk
  credentialId     bytes unique
  publicKey        bytes
  counter          bigint
  deviceLabel      string?          // "iPhone", "MacBook"
  lastUsedAt       datetime?
  createdAt

PortalVaultSession                        // moved from DocHub verbatim
  portalUserId     fk
  unlockedUntil    datetime

PortalCredential                          // moved from DocHub verbatim
  id, portalUserId?, clientId, visibility, title, username, encPassword,
  totpSecret, notes, url, ...

PortalPreference                          // new
  portalUserId     fk unique
  emailNotifications  bool default true
  theme            enum {SYSTEM, LIGHT, DARK}
  locale           string default "en-US"
```

### Key design decisions in this schema

- **`PortalUserClientLink` fixes DocHub's single-client limit.** A consultant can be a member of 3 clients with different permissions at each. This required a join table; we're adding it now rather than later.
- **`PortalMagicLink` merges two currently-separate concepts:** TicketHub's per-contact login token AND per-action links (approve estimate, acknowledge reminder). One table, `purpose` field disambiguates. Every link has a bounded TTL and a uses-count — fixes TicketHub's "nullable expiresAt + no revocation" bugs.
- **Entra SSO is not a table** — it's handled at the `/api/auth/entra/callback` route which creates or upserts a `PortalUser` keyed by email on first login. No separate SSO user table.
- **Passwords are optional.** Most users will never set one — magic-link + SSO cover the common paths. Password exists for users who explicitly want it.

### Mapping portal user → DocHub Person / TicketHub Contact

Both DocHub's `Person` and TicketHub's `TH_Contact` are MSP-owned records *about* a person. Neither is an identity. The portal user **maps to them by email** (verified at sign-up / invite time, stored on `PortalUserClientLink`).

DocHub BFF exposes `GET /api/bff/portal/persons/by-email?email=X&clientId=Y` → returns the `Person` row if one exists. Portal uses this to:
- resolve which LOB app seats a user has (apps feature — currently orphaned, see §9)
- pre-fill "Contact us" forms

TicketHub does the same with `TH_Contact`.

**No foreign keys across services.** Email is the join key; if an email changes we update on both sides via invite flow.

---

## 4. Auth flows

### 4.1 Magic-link login (primary path)

1. User hits `portal.pcc2k.com/login`, enters email.
2. Portal looks up `PortalUser` by email. If not found, 200 with generic "check your email" (no account enumeration).
3. If found, create `PortalMagicLink(purpose=LOGIN, usesLeft=1, expires=now+15m)`.
4. Send email via M365 Graph `Mail.Send` (reuse TicketHub's sender; see §7): subject "Sign in to PCC2K Portal", body has big "Sign In" button pointing to `https://portal.pcc2k.com/auth/magic?t=<token>`.
5. User clicks. Handler: verify token, mark consumed, create `PortalSession` (30-day sliding), set cookie, redirect to intended URL or `/dashboard`.
6. On next visit within 30 days, cookie logs them in — no email needed.

### 4.2 Entra (M365) SSO — secondary path

For client contacts who have an M365 account at their company:
1. `/login` has a "Sign in with Microsoft" button.
2. Standard OIDC dance: redirect to Entra authorize, callback with code, exchange for tokens.
3. Email claim → upsert `PortalUser` (find or create by email; if create, link to client based on domain mapping — see §12).
4. Create `PortalSession`, cookie, redirect.

Decision to defer: Entra SSO with **per-client tenant whitelisting** (so that only `@clientdomain.com` users auto-link to that client). Phase 2. Until then, unknown email addresses go to a "request access" form.

### 4.3 Passkey (optional, frequent users)

Same WebAuthn flow DocHub staff already has — adapted for portal. User adds passkey from Account Settings after first magic-link login. Subsequent visits: `/login` detects platform authenticator, offers passkey, one-tap in.

### 4.4 Password (legacy fallback)

DocHub's existing 9 portal users have passwords. We migrate those hashes verbatim (scrypt, same format). The `/login` page still accepts `email + password` as a tab, but magic-link is the default.

### 4.5 Email-action tokens (the Freshservice pattern)

Independent of login. When we send a reminder email or estimate email, we embed a single-use action link:

```
https://portal.pcc2k.com/a/<token>
```

That token is a `PortalMagicLink(purpose=ACTION_APPROVE_ESTIMATE, payload={estimateId}, usesLeft=1, expires=30d)`.

Handler `/a/[token]`:
- Verify token.
- If not logged in: create short-lived (30-min) session for that user, carrying the action intent.
- Route to the action confirmation page: `/estimates/{id}?via=email` with approve/decline pre-loaded.
- User clicks approve → action runs, token consumed, session persists for 30 min (so they can poke around).

This is the single biggest adoption lever from the research. Every outbound email gets an action button; the portal is a fallback.

---

## 5. Route map

```
/                               → redirect to /dashboard if logged in, else /login
/login                          → magic-link, SSO, password tabs
/auth/magic                     → POST handler for magic-link consumption
/auth/entra/start               → Entra OIDC redirect
/auth/entra/callback            → Entra callback
/auth/passkey/{register,verify} → WebAuthn endpoints
/auth/logout                    → POST

/dashboard                      → Home: cards for each section with counts ("3 pending items", "5 expiring licenses")

/tickets                        → list of open tickets (new, TicketHub-backed)
/tickets/new                    → 5-template ticket creator (New User, User Left, Printer Down, Password Reset, Other)
/tickets/[id]                   → ticket detail + reply

/estimates                      → list
/estimates/[id]                 → full estimate (merges TicketHub native + Syncro)
/estimates/[id]/approve         → approve/decline action (with signature capture, see §11)

/invoices                       → list
/invoices/[id]                  → detail + pay button (Square — see decision §12)

/pending                        → unified reminder inbox (moved from TicketHub /portal/[token])

/assets                         → DocHub-backed
/assets/[id]                    → detail

/documents                      → DocHub-backed
/documents/[id]                 → reader

/licenses                       → DocHub-backed
/domains                        → DocHub-backed
/locations                      → DocHub-backed
/contacts                       → people at my company (read-only for most users, editable for OWNER role)

/vault                          → personal + shared passwords

/account                        → profile, passkeys, preferences, sign-out

/a/[token]                      → email-action consumer (see §4.5)
/s/[token]                      → secure share viewer (fixes the orphaned SecureShareLink feature)
/note/[id]                      → ephemeral note viewer (fixes the orphaned EphemeralNote feature)

/admin                          → staff-only (NextAuth via Entra AD, same allow-list as DocHub staff)
  /admin/users                    → list all portal users across all clients
  /admin/users/[id]               → edit permissions, resend invite, deactivate
  /admin/magic-links              → recent magic-link audit log
  /admin/sessions                 → active sessions
```

### Nav structure (primary)

Top bar with:
- Left: PCC2K logo + client-switcher dropdown (for multi-client users)
- Middle: main nav — Dashboard, Pending, Tickets, Assets, Documents, Vault, More (dropdown: Licenses, Domains, Locations, Contacts, Invoices, Estimates)
- Right: user avatar + menu

### Nav structure (mobile)

Bottom tab bar: Dashboard, Pending, Tickets, Assets, More. Classic mobile-web pattern.

---

## 6. Email-first workflow (the core UX)

The research was blunt: **most customers never open the portal; they act from email**. Our design has to treat email as the primary UI and the portal as the dashboard behind it.

### Outbound email catalog

| Trigger | Subject | Primary CTA | Secondary links |
|---|---|---|---|
| Estimate sent | "Estimate #1234 from PCC2K" | [Approve] / [Decline] buttons in email body | View in portal |
| Reminder due | "Pending: {title}" | [Mark Done] / [Snooze 3 days] | View all pending |
| Invoice sent | "Invoice #1234 — $X due" | [Pay Now] (opens portal payment page) | View invoice |
| Appointment scheduled | "Confirmed: tech visit {date}" | [Confirm] / [Request reschedule] | Open portal |
| License expiring | "Heads up: {license} expires in 14 days" | [Acknowledge] | View license |
| Password share | "{Tech} sent you a password" | [View once] (time-boxed) | — |

Every email button is a `PortalMagicLink` with the appropriate purpose. Clicking it either:
- Performs the action immediately and shows a confirmation page, OR
- Opens the portal with the action pre-loaded (for complex actions like payment).

### Why this matters structurally

- **Portal's job is to be the dashboard + the action-confirmation destination,** not the first-touch surface.
- **Every TicketHub/DocHub feature that wants to drive action from a customer** goes through `PortalMagicLink`. That's the shared rail.
- **Unsubscribe / CAN-SPAM compliance lives on the portal** (`/account` has email prefs). Each email includes `{portal.pcc2k.com}/account/unsubscribe?t=<token>` link.

---

## 7. API contracts — DocHub BFF

Add to DocHub under `/api/bff/portal/*`. All require service bearer + HMAC signature.

```
GET  /api/bff/portal/persons/by-email?email=&clientId=
     → { id, name, email, phone, isPrimary, isBilling, isActive } | 404

GET  /api/bff/portal/clients/:clientId/assets
     → [{ id, name, category, status, make, model, serial, assetTag,
          ipAddress, room, purchaseDate, warrantyExpiry, location, assetType }]
     (same shape as current /api/portal/assets)

GET  /api/bff/portal/clients/:clientId/documents
     → [{ id, title, content, category, isPinned, updatedAt, folder }]

GET  /api/bff/portal/clients/:clientId/contacts
     → [{ id, name, role, email, phone, mobile, isPrimary, isBilling }]

GET  /api/bff/portal/clients/:clientId/locations
     → [{ id, name, address, city, state, zip, ispName, wanIp, notes }]

GET  /api/bff/portal/clients/:clientId/licenses
     → [{ id, name, vendor, seats, assignedSeats, expiryDate, renewalDate }]

GET  /api/bff/portal/clients/:clientId/domains
     → [{ id, domain, registrar, autoRenew, expiresAt, sslExpiresAt, sslIssuer }]

GET  /api/bff/portal/clients/:clientId/apps
     → [{ seatId, appName, url, launcherType }]
POST /api/bff/portal/clients/:clientId/apps/:seatId/rdp
     → returns RDP file bytes (unlocks the orphaned /api/portal/apps feature)

POST /api/bff/portal/notes
     body { resource, passphrase?, expiresInHours } → { noteId, viewUrl }
GET  /api/bff/portal/notes/:id       → existence + hasPassphrase
POST /api/bff/portal/notes/:id/view  body { passphrase? } → burns, returns content
     (these three fix the orphaned EphemeralNote + SecureShareLink features)
```

### What stays on DocHub's own domain

- **All staff admin UI** — `/clients/:id`, `/alerts`, `/runbooks`, everything outside `/portal`.
- **The `PortalUsersPanel` and `PortalVaultPanel` staff widgets** need to switch from calling `/api/clients/:id/portal-users` (local) to calling `portal.pcc2k.com/api/admin/clients/:id/users` (cross-origin). Either:
  - Use fetch with `credentials: 'include'` + CORS on portal API (simpler), OR
  - Add a thin proxy on DocHub at `/api/clients/:id/portal-users` that forwards to the portal's admin API (cleaner — keeps the widget's fetch local).
  - **Decision: go with proxy.** Zero CORS setup, no cookie-domain gymnastics.

---

## 8. API contracts — TicketHub BFF

Add to TicketHub under `/api/bff/portal/*`.

```
GET  /api/bff/portal/contacts/by-email?email=&clientId=
     → { id, firstName, lastName, email, phone, ... } | 404

GET  /api/bff/portal/clients/:clientId/tickets?status=OPEN|CLOSED|ALL&contactId?=
     → [{ id, number, subject, status, priority, createdAt, updatedAt, lastReplyAt }]

GET  /api/bff/portal/tickets/:id
     → full ticket + replies
POST /api/bff/portal/tickets
     body { clientId, contactId, template, subject, body, fields } → { id }
POST /api/bff/portal/tickets/:id/replies
     body { contactId, body } → { id }

GET  /api/bff/portal/clients/:clientId/estimates
     → [{ id, number, title, status, total, sentAt, validUntil }]
GET  /api/bff/portal/estimates/:id
     → full estimate incl. line items
POST /api/bff/portal/estimates/:id/respond
     body { action: approve|decline, contactId, reason?, signatureName, signatureIp }
     → { status }
GET  /api/bff/portal/estimates/:id/pdf?download=1
     → PDF bytes (portal-auth — replaces broken staff-only one)

GET  /api/bff/portal/clients/:clientId/invoices?status=
     → [{ id, number, amountCents, status, dueDate, paidAt, firstViewedAt }]
GET  /api/bff/portal/invoices/:id
     → full invoice incl. line items
POST /api/bff/portal/invoices/:id/pay
     body { method: SQUARE, return_url, cancel_url } → { checkoutUrl }
POST /api/bff/portal/invoices/:id/viewed
     → tracks firstViewedAt (replaces the pixel-tracking placeholder)

GET  /api/bff/portal/contacts/:contactId/reminders?status=
     → [{ id, title, body, actionUrl, source, status, recurrence, dueDate, nextNotifyAt, notifyCount }]
POST /api/bff/portal/reminders/:id/acknowledge
     body { contactId } → {}
POST /api/bff/portal/reminders/:id/snooze
     body { contactId, days? } → {}
```

### What stays on TicketHub's own domain

- **The reminder cron** (`/api/cron/reminder-notify`) continues to run on TicketHub. It calls out to Portal to generate magic-link URLs for email buttons (new endpoint: `POST portal.pcc2k.com/api/internal/magic-link { email, purpose, payload }` → returns `{ url }`).
- **M365 Graph sender** stays on TicketHub (the app registration and `M365_SENDER_UPN` are configured there). Portal calls `POST tickethub.pcc2k.com/api/internal/send-email { to, subject, html }` — or we migrate the sender to portal. **Decision: keep sender on TicketHub for v1** to avoid re-doing the Graph app registration; portal requests emails via internal API. Revisit once migration is stable.

---

## 9. Bugs and cleanup to roll into the migration

From the recon, these are the known issues that should be addressed as we build the new portal — fixing them in place in the old repos is wasted effort if the code is about to move.

### Portal-side bugs (DocHub)

1. **`EphemeralNote` viewer page missing.** `/api/notes/route.ts:36` emits `${NEXTAUTH_URL}/note/${id}` but no `app/note/` route exists. Fix: new portal ships `/note/[id]` + `/s/[token]` viewers.
2. **`SecureShareLink` viewer page missing.** Same shape.
3. **`/api/portal/apps` orphaned.** RDP-file feature never wired to UI. Fix: add `/apps` page to portal nav or delete the endpoints.
4. **`Person ↔ PortalUser` joined only by email string.** Fragile. Fix: portal's `PortalUserClientLink` stores the DocHub `Person.id` explicitly at invite time; email becomes a display field, not a join key.
5. **`revokeSessions` toggles `isActive` off/on** with a race window. Fix: dedicated `/admin/sessions/:id` DELETE endpoint.
6. **`isPortalOwner` toggle has no role check** — any DocHub staff user can grant portal ownership. Fix: portal `/admin/*` requires Entra AD + role=ADMIN (not just TECH).
7. **`proxy.ts:58` dead `CLIENT` role branch** — delete in DocHub during split.
8. **Portal has no MFA.** Fix: passkey support in new portal (see §4.3).

### Portal-side bugs (TicketHub)

9. **Token generation inconsistent.** Schema default `cuid()` vs code-generated `crypto.randomUUID()`. Fix: portal's `PortalMagicLink.token` is always `crypto.randomBytes(32).toString('base64url')` (fully specified, 256 bits entropy).
10. **`expiresAt` nullable → means "never expires."** Fix: portal's schema requires `expiresAt`, no null allowed.
11. **No revocation path for portal tokens.** `isActive` exists but nothing toggles it, and the estimate-respond route doesn't even check it. Fix: portal has explicit "revoke all tokens for user" admin action + auto-revokes on email change.
12. **Multiple active tokens accumulate per contact.** Fix: magic-link issuance consumes prior LOGIN links for the same user.
13. **No last-used tracking.** Fix: `PortalMagicLink.consumedAt` + audit log.
14. **`/api/estimates/[id]/respond` not in TicketHub middleware matcher exclusion.** Latent bug (works today only because the fetch sends no session). Fix: respond endpoint moves to portal; TicketHub's own no longer exists.
15. **Estimate PDF broken from portal** — `/api/estimates/[id]/pdf` requires staff auth. Fix: new BFF PDF endpoint authed by portal bearer.
16. **Estimate approval captures no signature/IP/agreement.** Fix: new flow captures typed-name signature + IP + user-agent + "I agree to the terms" checkbox; stored on `TH_Estimate`.
17. **Client-scope (not contact-scope) on estimate visibility.** Any contact at a client can approve any estimate at that client. Intentional? Need user decision — flagging as open question (§12).
18. **Tailwind classes silently broken.** `bg-th-bg`, `text-th-text-secondary`, etc. resolve to nothing because the Tailwind config is incomplete. Fix: new repo's Tailwind theme is defined from scratch with all tokens, or we migrate to pure CSS vars.
19. **Hardcoded `tickethub.pcc2k.com` base URLs in 3 places** (`reminder-notify`, `estimates.ts`, `estimates/[id]/send`). Fix: all email URLs point to `portal.pcc2k.com` and are constructed via a single `PORTAL_BASE_URL` env.
20. **`TH_Invoice.firstViewedAt` / `viewCount` exist but no portal route writes them.** Fix: portal invoice page hits the BFF tracking endpoint.
21. **Reminder cron may not actually be running** (not in user's crontab per recon). **Needs user verification tomorrow.** If it isn't, clients haven't been getting reminders — this is a live incident.

---

## 10. Phased migration plan

Each phase is independently shippable and reversible. No big-bang cutover.

### Phase 0 — Repo + infra (user does 2026-04-22)

- Create `portal` repo on GitHub.
- DNS: `portal.pcc2k.com` → same nginx box that fronts DocHub/TicketHub (tailscale IP from `reference_servers.md`).
- nginx site config: proxy to container port (suggest 3002 — 3000 is DocHub, 3001 is TicketHub).
- Let's Encrypt cert.
- `docker-compose.yml`: new service `portal`, Postgres on same host or sibling `portal_db`.
- CI: push to `master` → GHCR image → watchtower pulls.

### Phase 1 — Skeleton + identity foundation (me, ~1 session)

- Next.js 16 app, same vendored fork as DocHub (match the `AGENTS.md` constraint).
- Prisma schema for portal-owned tables (§3).
- Magic-link login end-to-end: email via TicketHub internal API, cookie session, redirect.
- `/dashboard` is a stub: "Welcome {name}" + empty section cards.
- `/admin/users` basic: list, create, resend invite.
- **Migration script:** import DocHub's 9 existing `PortalUser` rows → new `PortalUser` + `PortalUserClientLink`. Scrypt hashes carry over. Re-encrypt `PortalCredential` with new portal-owned `ENCRYPTION_KEY`. Invite-email re-sent to all 9.
- **At end of Phase 1:** DocHub's `/portal/*` still works (not yet torn down). Portal can log in via email but has no data.

### Phase 2 — Port DocHub sections (me, ~1-2 sessions)

- DocHub ships new `/api/bff/portal/*` endpoints.
- Portal adds `/assets`, `/documents`, `/contacts`, `/locations`, `/licenses`, `/domains` pages hitting the BFF.
- Portal `/vault` + `/account/passkeys`.
- Staff-side `PortalUsersPanel` / `PortalVaultPanel` in DocHub switch to proxying to portal's admin API.
- DocHub's `/portal/*` routes start returning a banner: "Portal has moved → portal.pcc2k.com"; old cookies rejected.
- After 7 days, delete DocHub's `/portal/*` and `/portal-admin/*` entirely.

### Phase 3 — Port TicketHub portal (me, ~1 session)

- TicketHub ships new `/api/bff/portal/*` endpoints.
- Portal adds `/pending`, `/estimates`, `/estimates/[id]`, `/tickets`, `/tickets/new`.
- TicketHub reminder cron switches email URL builder to `portal.pcc2k.com`.
- TicketHub `/portal/[token]` routes get redirect stub pointing to portal.
- TicketHub's hardcoded `tickethub.pcc2k.com` URLs (3 places) switch to env-driven.
- **Fix the cron schedule issue** if it's really not running.

### Phase 4 — Email-first + new features (me, ~2-3 sessions)

- `PortalMagicLink` extended to support ACTION_* purposes.
- Email templates refactored: Approve/Decline, Done/Snooze, Confirm/Reschedule buttons embedded.
- `/a/[token]` router implements the short-lived-session pattern.
- Ticket creation with 5 templates.
- Invoice list + Square Web Payments SDK checkout (matches Smelly Melly's Square choice from memory).
- Signature capture on estimate approval.

### Phase 5 — Polish (me, ongoing)

- Dashboard cards with real counts.
- Quick-share pattern (fixed `EphemeralNote` / `SecureShareLink` viewers).
- Client-switcher UI for multi-client users.
- Entra SSO tenant-aware auto-linking.
- Mobile PWA tuning.
- Audit log viewer in admin.

### Rollback plan

- Phase 1 is additive; no cutover. DocHub portal keeps working the whole time.
- Phase 2: if it goes wrong, flip DNS back to DocHub's portal. Data is still in DocHub until the 7-day sunset.
- Phase 3: same — TicketHub's `/portal/[token]` is redirected, not deleted, until we're sure.

---

## 11. Security items

1. **CSRF:** current DocHub portal relies on `SameSite=Lax`. New portal does the same but **also adds double-submit token** for mutations (defense in depth; cheap to implement).
2. **Origin check on BFF:** DocHub/TicketHub BFF endpoints reject requests without matching service HMAC.
3. **Rate limiting:** magic-link requests per-email per-hour (default 5), per-IP per-hour (default 20). Bump to stricter limits after abuse telemetry.
4. **Token entropy:** all tokens 256-bit base64url random. No cuid/UUID mixing.
5. **Audit log:** every login, every action-token consumption, every admin change. Table `PortalAuditEvent { userId?, actorIp, eventType, targetType, targetId, metadata, createdAt }`.
6. **Signature capture on estimate approval:** typed full name, IP, user-agent, timestamp, "I agree to the terms" checkbox. Stored on `TH_Estimate`.
7. **Session revocation:** admin can kill any session; user can see + kill own sessions in `/account`.
8. **Contact-scope vs client-scope:** open question — see §12.

---

## 12. Open decisions (need user input tomorrow)

### ~~D1. Database deployment~~ — RESOLVED 2026-04-21

**Decision:** same Postgres instance as DocHub + TicketHub, new schema
`portal`. Already referencing both their data anyway; one backup; FK to
`dochub.Person.id` / `tickethub.TH_Contact.id` becomes possible later
if email-join proves fragile. No cross-instance BFF dance needed.

#### Original options:
Portal needs its own Postgres schema. Options:
- **Same Postgres instance as DocHub** (add a `portal` schema) — simplest, one backup.
- **Same instance as TicketHub** — also fine.
- **Separate container** — cleanest isolation but more infra to maintain.

**Recommendation:** same instance as DocHub, new schema `portal`. DocHub already has the backup + monitoring.

### D2. Multi-client support on day 1

Are there actual consultants who need access to multiple clients? If no, Phase 1 can ship single-client like DocHub does today, and the join table `PortalUserClientLink` is scaffolded but unused. If yes, we need client-switcher UI in Phase 1.

**Update 2026-04-21:** The billing-person-at-multiple-clients use case
is a real ask (e.g. "Jen is billing for X, Y, Z"). So day-1
multi-client support IS needed, which makes the client-switcher UI a
Phase 1 deliverable rather than a Phase 5 polish. The `activeClientId`
on `PortalSession` already scaffolds for this.

### D-Roles. Editable role catalog vs fixed 5-role set — RESOLVED 2026-04-21

**Decision:** ship the 5 fixed roles (OWNER / BILLING / TECHNICAL /
USER / VIEWER) with permission presets defined in code
(`app/lib/portal-roles.ts`). Store role as `String` in the DB — NOT a
Prisma enum — so a later migration to a first-class `PortalRole`
table + FK is non-breaking. Per-link JSON permissions blob remains the
escape hatch for one-off overrides ("Jen is BILLING everywhere except
at ClientZ").

**Why not build editable-now:** MSP client-side roles are conservative
and well-understood; the 5 archetypes cover the realistic use cases.
An admin role-CRUD UI is ~2-3 hours of scope creep that onboarding a
real editable-role feature would need (rename semantics, cascading
updates, etc.) — not earned yet. Revisit if client demand shows up.

**Recommendation:** build the join table on day 1 (cheap), defer the switcher UI to Phase 5 unless there's a pending use case.

### ~~D3. Invoice payment provider~~ — RESOLVED 2026-04-21

**Decision:** Stripe. User has no use for Square on the PSA side.

#### Original options:
Options (from memory):
- **Square** — already integrated in Smelly Melly, you know the API.
- **Stripe** — industry standard, better dashboards.
- **ConnectBooster** — MSP-specific (from competitor research).

**Recommendation:** Square, for reuse of Smelly Melly wiring.

### D4. White-label / multi-MSP

Is this eventually a product for other MSPs, or permanently PCC2K-branded? Affects branding config and tenant isolation.

**Recommendation:** assume PCC2K-only for now; design token vars so branding is swappable later but don't build multi-tenant routing.

### D5. Contact-scope vs client-scope on estimates

Current TicketHub behavior: any contact at a client can view/approve any estimate at that client. Is that intentional?

**Recommendation:** keep client-scope (covers co-approvers, matches current behavior), but add an optional `TH_Estimate.restrictedToContactId` field for estimates the tech explicitly wants to limit.

### D6. Where does M365 Graph sender live long-term?

v1 keeps it on TicketHub. Long-term: move to portal so portal is the email hub? Or keep TicketHub as sender for PSA-originated email?

**Recommendation:** revisit after Phase 3 ships. Not a blocker.

### D7. Password-based login in v2

Keep as fallback forever, or sunset after all existing users have migrated to magic-link/SSO/passkey?

**Recommendation:** sunset after Phase 4 + 90 days.

### ~~D8. Reminder cron — is it even running?~~ — RESOLVED 2026-04-21

Verified: was NOT in crontab, now added (`*/5 * * * *` calling
`/api/cron/reminder-notify`). No harm done — `tickethub.th_reminders`
table had 0 rows, meaning the feature was wired but had never
triggered a live reminder. Cron is now in place so the next reminder
created will actually get delivered.

---

## 13. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Vault re-encryption loses data | 9 users' passwords garbled | Dry-run migration on staging DB first; keep old `ENCRYPTION_KEY` around for rollback. |
| Cross-origin cookies break staff widgets | PortalUsersPanel/VaultPanel in DocHub stop working | Proxy pattern (§7) avoids cross-origin entirely. |
| M365 sender rate limits / app-registration permissions | Emails don't send | Keep using TicketHub's existing Graph registration; portal calls internal API. |
| Magic-link emails land in spam | Portal adoption tanks | SPF/DKIM/DMARC on `pcc2k.com` (presumably already set for TicketHub). Subject-line warmup if needed. |
| DocHub or TicketHub goes down → portal goes down | Client-facing outage | BFF calls have timeouts + graceful per-section degradation ("Assets temporarily unavailable"). Dashboard still loads. |
| Service-to-service bearer leaks | Full BFF access | HMAC over body+timestamp+nonce, 5-minute replay window, rotate quarterly, never log the secret. |
| Passkey registration friction | Users abandon | Passkey is opt-in only; magic-link is never disabled. |
| Migrated portal users' scrypt hashes fail verification in new code | 9 users locked out | Use identical scrypt params (verify by unit test before migration). Send password-reset emails to all 9 pre-emptively as belt-and-suspenders. |

---

## 14. Day 1 checklist (for 2026-04-22)

- [ ] Create GitHub repo `portal` (or preferred name).
- [ ] DNS A/AAAA record for `portal.pcc2k.com` → PCC2K nginx server tailscale IP.
- [ ] nginx site config + certbot.
- [ ] Decide **D1 (database deployment)**, **D3 (payment provider)**, **D4 (white-label scope)**.
- [ ] **Verify crontab: is `/api/cron/reminder-notify` actually firing?** (D8 — urgent.)
- [ ] Tell Claude when ready — I'll scaffold Phase 1 (skeleton + identity foundation + migration script for the 9 users).

---

## 15. Sibling docs in this folder

- `AUTH.md` — deep dive on auth flows (magic-link, SSO, passkey) with sequence diagrams.
- `API-CONTRACTS.md` — complete BFF endpoint specs (request/response shapes, auth, error codes).
- `FIXES.md` — the bug list from §9, one per row, with file:line citations from the recon.
- `DB.md` — Prisma schema draft for the portal repo.
