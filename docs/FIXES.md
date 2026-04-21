# Bugs & Cleanup — Fix During Migration

Pulled from the deep recon of both existing portals (2026-04-21). Numbered to match PLAN.md §9. Each has file:line citations for the original code.

Priority: F = live bug (users affected now), C = cleanup / latent, S = security.

---

## DocHub portal

### 1. [C] `EphemeralNote` viewer page missing
- **Evidence:** `/home/msaville/dochub/app/app/api/notes/route.ts:36` emits URLs of the form `${NEXTAUTH_URL}/note/${id}` but no `app/note/` directory exists under `/home/msaville/dochub/app/app/`.
- **Impact:** The "ephemeral note" feature is half-built. Staff can create notes and get a URL back, but opening the URL 404s.
- **Fix:** New portal ships `/note/[id]` page that reads from the new BFF `GET /api/bff/portal/notes/:id` + `POST /api/bff/portal/notes/:id/view`.

### 2. [C] `SecureShareLink` viewer page missing
- **Evidence:** `/home/msaville/dochub/app/prisma/schema.prisma:1622-1632` defines the model; `/home/msaville/dochub/app/app/api/share/[id]/route.ts:7-76` handles the view/burn API. No `app/s/` or `app/share/` directory exists.
- **Fix:** New portal ships `/s/[token]` page. Same pattern as notes.

### 3. [C] `/api/portal/apps` routes orphaned
- **Evidence:** `/home/msaville/dochub/app/app/api/portal/apps/route.ts` and `.../apps/[seatId]/rdp/route.ts` exist but nothing in portal nav or pages references them.
- **Decision needed:** ship the feature (add `/apps` page with RDP-file download per seat) OR delete the endpoints. The feature is genuinely useful for clients with LOB apps.
- **Recommendation:** ship it. Add `/apps` to portal nav in Phase 5.

### 4. [C] `Person ↔ PortalUser` joined only by email string
- **Evidence:** `/home/msaville/dochub/app/app/api/portal/apps/route.ts:30` does `person: { email: user!.email }`. No FK between the two models in schema.
- **Impact:** Email change on the Person record silently breaks the join. No way to notice.
- **Fix:** Portal's `PortalUserClientLink` stores `dochubPersonId` explicitly, set at invite time.

### 5. [S] `revokeSessions` toggles `isActive` off/on with race
- **Evidence:** `/home/msaville/dochub/app/app/portal-admin/page.tsx:105-122` — "Kick" button flips isActive false then true.
- **Impact:** If the second call fails, user stays disabled. If a concurrent login happens between the two calls, it can succeed.
- **Fix:** Portal has `DELETE /admin/sessions/:id` that deletes the session row directly. No isActive toggling.

### 6. [S] `isPortalOwner` toggle has no role check
- **Evidence:** `/home/msaville/dochub/app/app/api/portal-users/[id]/route.ts:6-7` calls `requireAuth()` (any role), not `requireAuth("ADMIN")`.
- **Impact:** Any PCC2K staff user (TECH role) can promote themselves-or-a-friend to portal owner at any client.
- **Fix:** Portal's `/admin/*` endpoints require Entra AD role=ADMIN.

### 7. [C] `proxy.ts:58` dead `CLIENT` role branch
- **Evidence:** `/home/msaville/dochub/app/proxy.ts:58` checks `token.role === "CLIENT"` but no `CLIENT` role is ever issued to staff users.
- **Fix:** Delete the branch in DocHub as part of splitting out portal.

### 8. [S] No MFA on portal
- **Evidence:** `/home/msaville/dochub/app/app/portal/login/page.tsx:13-30` is email+password only. No passkey, no TOTP, no magic-link.
- **Impact:** Shared password = full vault access for anyone who gets it.
- **Fix:** Portal gets passkey support in Phase 2. Magic-link becomes primary in Phase 1.

---

## TicketHub portal

### 9. [C] Token generation inconsistent
- **Evidence:** Schema default is `@default(cuid())` (`/home/msaville/tickethub/prisma/schema.prisma:1071`) but `/home/msaville/tickethub/app/lib/actions/estimates.ts:35` explicitly sets `token: crypto.randomUUID()`.
- **Impact:** Mixed cuid/UUID tokens in the wild. Log grepping is harder; any token-format validation has to accept both.
- **Fix:** Portal's `PortalMagicLink.token` is always `crypto.randomBytes(32).toString('base64url')`. One format everywhere.

### 10. [S] `expiresAt` nullable → null means never expires
- **Evidence:** `/home/msaville/tickethub/prisma/schema.prisma:1072` — `expiresAt DateTime?`. Only `/home/msaville/tickethub/app/lib/actions/estimates.ts:36` ever sets it. Checks at `page.tsx:33`, `estimate/[id]/page.tsx:34`, snooze/ack routes:19 all treat null as "never expires."
- **Impact:** Any token created by any other code path is immortal.
- **Fix:** Portal's schema has `expiresAt DateTime` (non-null). No way to create a tokenless-of-expiry.

### 11. [S] No revocation path for portal tokens
- **Evidence:** `isActive` exists on `TH_ContactPortalToken` but no code toggles it. Worse: `/home/msaville/tickethub/app/api/estimates/[id]/respond/route.ts:27,81` does NOT check `isActive`, only `expiresAt`.
- **Impact:** Even if we manually set a token to inactive, estimate respond endpoint still honors it.
- **Fix:** Portal has explicit "revoke user tokens" admin action + respond endpoint checks full validity.

### 12. [C] Multiple active tokens accumulate per contact
- **Evidence:** `sendEstimateEmail` at `/home/msaville/tickethub/app/lib/actions/estimates.ts:32-38` creates a new token every send. No dedup.
- **Impact:** A contact with 10 estimates has 10 active portal tokens. Any one still grants full portal access.
- **Fix:** Portal's magic-link issuer consumes prior unused LOGIN links for the same user when issuing a new one. Action-links are fine to accumulate (each represents a distinct action).

### 13. [C] No last-used tracking
- **Evidence:** Schema has no `lastUsedAt` or `useCount`.
- **Impact:** Can't audit which tokens are active; can't cull stale ones; can't answer "did customer X click my estimate email?"
- **Fix:** Portal's `PortalMagicLink.consumedAt` captures use; `PortalAuditEvent` logs every click.

### 14. [S] `/api/estimates/[id]/respond` not in TicketHub middleware matcher exclusion
- **Evidence:** `/home/msaville/tickethub/middleware.ts:17` matcher excludes `/api/portal` but not `/api/estimates`. The respond route is invoked by the portal UI (`EstimatePortalView.tsx:59`) with no session.
- **Impact (current):** `withAuth` callback `authorized: ({ token }) => !!token` will 307 any unauthenticated request to `/api/auth/signin` BEFORE the route handler runs. **The portal estimate-respond flow is currently broken for logged-out users.** The only reason it might work is if the portal page causes a session to exist somehow — which it shouldn't.
- **Urgency:** Need to verify tomorrow whether estimate approvals have been working at all. If not, this is a live incident.
- **Fix:** Respond endpoint moves to portal repo; old TicketHub one is deleted.

### 15. [F] Estimate PDF broken from portal
- **Evidence:** `/home/msaville/tickethub/app/portal/[token]/estimate/[id]/EstimatePortalView.tsx:319` links to `/api/estimates/${id}/pdf`. That endpoint at `/home/msaville/tickethub/app/api/estimates/[id]/pdf/route.tsx:14` calls `requireAuth()` (staff-only).
- **Impact:** The "Download PDF" button in the client-facing estimate view 401s.
- **Fix:** New portal BFF endpoint `GET /api/bff/portal/estimates/:id/pdf` authed by portal bearer + contact-scope check.

### 16. [S] Estimate approval captures no signature/IP/agreement
- **Evidence:** `/home/msaville/tickethub/app/portal/[token]/estimate/[id]/EstimatePortalView.tsx:54` is a plain `confirm('Are you sure…')`. Respond handler writes `status: 'APPROVED', approvedAt: now` with no signature data.
- **Impact:** No legally durable evidence that the client approved. Contested approvals are hard to defend.
- **Fix:** New approve flow captures: typed full name, IP address, user-agent, timestamp, "I agree" checkbox with terms link. Stored on `TH_Estimate.approvalSignatureName`, `approvalSignatureIp`, `approvalSignatureUserAgent`, `approvalAgreedAt`.

### 17. [?] Client-scope vs contact-scope on estimate visibility
- **Evidence:** `/home/msaville/tickethub/app/portal/[token]/estimate/[id]/page.tsx:61` and `api/estimates/[id]/respond/route.ts:37-38,96-97` authorize by `clientId`, not contact.
- **Impact:** Any contact at a shared client can view or approve any other contact's estimate at the same company.
- **Decision needed:** is that intentional? Covers co-approvers if yes. Leaks sensitive quotes if no.
- **Recommendation (§12 in PLAN.md):** keep client-scope default, add optional `TH_Estimate.restrictedToContactId` for restrictions.

### 18. [C] Tailwind classes silently broken
- **Evidence:** `/home/msaville/tickethub/app/portal/[token]/PortalView.tsx` uses `bg-th-bg`, `text-th-text-secondary`, `text-th-text-muted`, `bg-th-surface-raised`. None resolve against `/home/msaville/tickethub/tailwind.config.ts:12-23` which only defines `th.base`, `th.surface`, `th.elevated`, `th.border`, `accent.*`.
- **Impact:** Portal visually incomplete — those classes drop silently. Some elements render with no background or muted color they were supposed to have.
- **Fix:** Portal repo defines the Tailwind theme from scratch with a complete token set. Port the actually-working classes.

### 19. [C] Hardcoded `tickethub.pcc2k.com` URLs in 3 places
- **Evidence:**
  1. `/home/msaville/tickethub/app/api/cron/reminder-notify/route.ts:72` — `NEXTAUTH_URL ?? 'https://tickethub.pcc2k.com'`, used to build `/portal/${token}`.
  2. `/home/msaville/tickethub/app/lib/actions/estimates.ts:26,39` — literal `'https://tickethub.pcc2k.com/estimate/${id}?token=${token.token}'`.
  3. `/home/msaville/tickethub/app/api/estimates/[id]/send/route.ts:48` — literal `'https://tickethub.pcc2k.com/estimates/${id}'` (note: `/estimates/` not `/portal/` — that one goes to the admin page by default; already mildly broken as a customer link).
- **Fix:** All three switch to `process.env.PORTAL_BASE_URL ?? 'https://portal.pcc2k.com'`.

### 20. [C] `TH_Invoice.firstViewedAt` / `viewCount` exist but no portal route writes them
- **Evidence:** `/home/msaville/tickethub/prisma/schema.prisma:492-493` has the fields. Only reference in code is a tracking pixel URL at `/home/msaville/tickethub/app/lib/actions/email.tsx:92`.
- **Impact:** View tracking data is stuck at zero; the field is dead weight.
- **Fix:** Portal invoice page hits `POST /api/bff/portal/invoices/:id/viewed` when rendering (once per session).

### 21. [F] **Reminder cron may not actually be running — URGENT VERIFICATION**
- **Evidence:** Recon report notes that `/api/cron/reminder-notify` is not in the user's crontab (only `sla-check` and `m365-subscription-renew` are present).
- **Impact:** If true, **no client has received a reminder email since the cron was last scheduled** — which could be a month or more. Pending items accumulate in the DB but never notify.
- **What to check tomorrow:**
  ```bash
  crontab -l | grep -i reminder
  tail -200 ~/tickethub/cron.log | grep -i reminder
  ```
- **If it really isn't running:** add the cron line immediately. Don't wait for the portal migration.
  ```cron
  */15 * * * * curl -s -H "Authorization: Bearer ${CRON_SECRET}" https://tickethub.pcc2k.com/api/cron/reminder-notify >> ~/tickethub/cron.log 2>&1
  ```

---

## Migration-phase alignment

Here's which phase each fix lands in (from PLAN.md §10):

| # | Fix | Phase |
|---|---|---|
| 1, 2 | Note / share viewers | Phase 5 (polish) |
| 3 | `/api/portal/apps` → ship or delete | Phase 5 |
| 4 | Person FK instead of email join | Phase 1 (identity foundation) |
| 5 | Session revocation | Phase 2 |
| 6 | Admin role check | Phase 1 |
| 7 | Dead `CLIENT` branch | Phase 2 (as part of DocHub tear-down) |
| 8 | Portal MFA | Phase 1 (magic-link) + Phase 2 (passkey) |
| 9 | Token format | Phase 1 |
| 10 | Non-null `expiresAt` | Phase 1 |
| 11 | Revocation | Phase 1 |
| 12 | Token dedup | Phase 1 |
| 13 | Last-used tracking | Phase 1 |
| 14 | Respond middleware bug | Phase 3 (moved to portal — old route deleted) |
| 15 | PDF fix | Phase 3 |
| 16 | Signature capture | Phase 4 |
| 17 | Client-scope decision | Phase 3 (ship current behavior, add restrictedToContactId as optional) |
| 18 | Tailwind theme | Phase 1 (from scratch in new repo) |
| 19 | Hardcoded URLs | Phase 3 |
| 20 | Invoice view tracking | Phase 4 |
| 21 | Reminder cron running? | **TOMORROW — before anything else** |
