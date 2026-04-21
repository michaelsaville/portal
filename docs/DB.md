# Portal Database Schema

Draft Prisma schema for the `portal` repo. Target DB: Postgres (same instance as DocHub, new schema `portal`).

```prisma
// schema.prisma — portal repo

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
  schemas  = ["portal"]
}

// ============================================================
// Identity
// ============================================================

model PortalUser {
  id            String   @id @default(cuid())
  email         String   @unique  // lowercased on write
  name          String
  phone         String?
  passwordHash  String?              // scrypt; null for magic-link/SSO-only users
  isActive      Boolean  @default(true)
  lastLoginAt   DateTime?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  sessions      PortalSession[]
  magicLinks    PortalMagicLink[]
  passkeys      PortalPasskey[]
  clientLinks   PortalUserClientLink[]
  vaultSession  PortalVaultSession?
  credentials   PortalCredential[]
  preferences   PortalPreference?
  auditEvents   PortalAuditEvent[]

  @@schema("portal")
  @@index([isActive])
}

model PortalUserClientLink {
  id              String     @id @default(cuid())
  portalUserId    String
  portalUser      PortalUser @relation(fields: [portalUserId], references: [id], onDelete: Cascade)
  clientId        String                    // DocHub Client.id — authoritative source of clients
  dochubPersonId  String?                   // optional FK replacement for email-join
  tickethubContactId String?                // optional FK replacement for email-join
  /// One of: OWNER | BILLING | TECHNICAL | USER | VIEWER. Stored as string
  /// (not Prisma enum) so the set can later graduate to a `PortalRole`
  /// table + FK without an enum drop. Validated at the app layer against
  /// PORTAL_ROLES in app/lib/portal-roles.ts.
  role            String     @default("USER")
  /// Per-link permission override. When empty, the role's preset applies.
  /// Shape: { assets, documents, licenses, contacts, locations, domains,
  /// vault, tickets, invoices, estimates, payments: boolean }. Only
  /// explicit `false`/`true` entries override — missing keys fall back
  /// to the preset.
  permissions     Json       @default("{}")
  createdAt       DateTime   @default(now())
  updatedAt       DateTime   @updatedAt

  @@unique([portalUserId, clientId])
  @@index([clientId])
  @@schema("portal")
}

// ------------------------------------------------------------
// Role presets (application layer, not schema)
// ------------------------------------------------------------
//
// Defined in `app/lib/portal-roles.ts`. Code is the source of truth; the
// DB just stores the role string. `PORTAL_ROLES` is a frozen record:
//
// OWNER     → full access (all section keys true) + can invite/manage
//             other portal users at this client. Automatically granted
//             to the first PortalUser linked to a client.
// BILLING   → invoices, estimates, payments, contacts. Typical AP person.
// TECHNICAL → tickets, assets, documents, licenses, domains, locations.
//             Typical IT contact.
// USER      → tickets (their own), contacts read-only, documents read.
//             Regular employee who submits tickets.
// VIEWER    → read-only everything the client has shared. No create, no
//             approve.
//
// Add a new role by extending `PORTAL_ROLES`. An admin UI to edit the
// preset map is deferred until real demand appears (see PLAN.md D-Roles).

model PortalSession {
  id              String     @id @default(cuid())
  token           String     @unique  // 32-byte hex cookie
  portalUserId    String
  portalUser      PortalUser @relation(fields: [portalUserId], references: [id], onDelete: Cascade)
  activeClientId  String?
  userAgent       String?
  ipAddress       String?
  lastSeenAt      DateTime   @default(now())
  expiresAt       DateTime                  // sliding 30d, absolute cap 90d
  createdAt       DateTime   @default(now())

  @@index([portalUserId])
  @@index([expiresAt])
  @@schema("portal")
}

model PortalMagicLink {
  id            String     @id @default(cuid())
  token         String     @unique  // 32-byte base64url
  portalUserId  String
  portalUser    PortalUser @relation(fields: [portalUserId], references: [id], onDelete: Cascade)
  purpose       MagicLinkPurpose
  payload       Json?                         // { estimateId, reminderId, invoiceId, ... }
  usesLeft      Int        @default(1)
  consumedAt    DateTime?
  lastUsedAt    DateTime?
  lastUsedIp    String?
  expiresAt     DateTime
  createdAt     DateTime   @default(now())

  @@index([portalUserId, purpose, consumedAt])
  @@index([expiresAt])
  @@schema("portal")
}

enum MagicLinkPurpose {
  LOGIN
  PASSWORD_RESET
  ACTION_APPROVE_ESTIMATE
  ACTION_DECLINE_ESTIMATE
  ACTION_ACK_REMINDER
  ACTION_SNOOZE_REMINDER
  ACTION_CONFIRM_APPT
  ACTION_RESCHEDULE_APPT
  ACTION_PAY_INVOICE
  ACTION_VIEW_NOTE       // one-time ephemeral-note share
  ACTION_VIEW_DOCUMENT   // one-time document share

  @@schema("portal")
}

model PortalPasskey {
  id            String     @id @default(cuid())
  portalUserId  String
  portalUser    PortalUser @relation(fields: [portalUserId], references: [id], onDelete: Cascade)
  credentialId  Bytes      @unique
  publicKey     Bytes
  counter       BigInt
  deviceLabel   String?
  lastUsedAt    DateTime?
  createdAt     DateTime   @default(now())

  @@index([portalUserId])
  @@schema("portal")
}

// ============================================================
// Vault (moved from DocHub)
// ============================================================

model PortalVaultSession {
  portalUserId    String     @id
  portalUser      PortalUser @relation(fields: [portalUserId], references: [id], onDelete: Cascade)
  unlockedUntil   DateTime                   // 15m TTL

  @@schema("portal")
}

model PortalCredential {
  id              String     @id @default(cuid())
  clientId        String                     // DocHub Client.id
  createdByUserId String?                    // PortalUser who created; null for MSP-pushed
  visibility      PortalCredentialVisibility @default(PRIVATE)
  title           String
  username        String?
  encPassword     Bytes?                     // AES-256-GCM
  totpSecret      Bytes?                     // AES-256-GCM
  url             String?
  notes           String?
  createdAt       DateTime   @default(now())
  updatedAt       DateTime   @updatedAt

  createdBy       PortalUser? @relation(fields: [createdByUserId], references: [id], onDelete: SetNull)

  @@index([clientId, visibility])
  @@index([createdByUserId])
  @@schema("portal")
}

enum PortalCredentialVisibility {
  PRIVATE      // only createdByUserId
  TEAM         // all portal users at clientId
  MSP_SHARED   // portal users at clientId AND MSP staff

  @@schema("portal")
}

// ============================================================
// Preferences / audit / misc
// ============================================================

model PortalPreference {
  portalUserId        String     @id
  portalUser          PortalUser @relation(fields: [portalUserId], references: [id], onDelete: Cascade)
  emailNotifications  Boolean    @default(true)
  remindersEnabled    Boolean    @default(true)
  invoiceAlerts       Boolean    @default(true)
  theme               PortalTheme @default(SYSTEM)
  locale              String     @default("en-US")
  updatedAt           DateTime   @updatedAt

  @@schema("portal")
}

enum PortalTheme {
  SYSTEM
  LIGHT
  DARK

  @@schema("portal")
}

model PortalAuditEvent {
  id            String     @id @default(cuid())
  portalUserId  String?
  portalUser    PortalUser? @relation(fields: [portalUserId], references: [id], onDelete: SetNull)
  actorIp       String?
  actorUserAgent String?
  eventType     String                       // see AUTH.md audit catalog
  targetType    String?
  targetId      String?
  metadata      Json?
  createdAt     DateTime   @default(now())

  @@index([portalUserId, createdAt])
  @@index([eventType, createdAt])
  @@schema("portal")
}

// ============================================================
// Rate-limit backing store (optional; Redis would be simpler if available)
// ============================================================

model PortalRateLimitBucket {
  key           String     @id                // "magic:jane@acme.com:h-4732" or "ip:1.2.3.4:h-4732"
  count         Int        @default(0)
  windowEnd     DateTime

  @@index([windowEnd])
  @@schema("portal")
}
```

## Migration notes from DocHub

Running in Phase 1:

1. **Export existing DocHub portal users:**
   ```sql
   SELECT id, email, name, password_hash, is_active, is_portal_owner, permissions,
          last_login_at, created_at, client_id
   FROM dochub.portal_users;
   ```
2. **For each row, create:**
   - `PortalUser` — same id (safe to reuse cuids cross-schema), email lowercased, passwordHash verbatim.
   - `PortalUserClientLink` — role = `"OWNER"` if `is_portal_owner=true`, else `"USER"` (catch-all default — admin can reassign to `BILLING`/`TECHNICAL`/`VIEWER` post-migration). Permissions copied verbatim from DocHub's JSON blob; they override the role preset. `dochubPersonId` populated by SELECT on DocHub's `Person` where email matches.
3. **Re-encrypt credentials:**
   - Read all `dochub.portal_credentials`.
   - Decrypt with old `ENCRYPTION_KEY` (DocHub env).
   - Re-encrypt with new `PORTAL_ENCRYPTION_KEY` (portal env — new key).
   - Write into `portal.PortalCredential`.
4. **Skip active sessions:** all 9 users re-login via magic-link on next visit. Sessions aren't worth migrating.
5. **Audit trail:** `PortalAuditEvent` starts empty.

## Migration notes from TicketHub

No data migration needed — TicketHub's `TH_ContactPortalToken` is replaced by portal's `PortalMagicLink`. Existing TicketHub tokens are left in place (still honored by the TicketHub respond endpoint until Phase 3 removes it). After Phase 3:

- TicketHub reminder cron requests magic links from portal via `/internal/magic-link-url`.
- TicketHub no longer issues tokens.
- The `TH_ContactPortalToken` table can be dropped 30 days after Phase 3 ships.

## Idempotency & safety

- All migration scripts are idempotent (upsert by email). Re-running doesn't duplicate.
- Dry-run mode: `--dry-run` flag prints planned operations without writing.
- Backups: `pg_dump` both DocHub and TicketHub before Phase 1.

## Indexes we care about for query perf

- `PortalSession(expiresAt)` — for background session-cleanup job.
- `PortalMagicLink(portalUserId, purpose, consumedAt)` — for "consume prior LOGIN links" during new magic-link issuance.
- `PortalAuditEvent(portalUserId, createdAt DESC)` — for `/account/audit` viewer.
- `PortalUserClientLink(clientId)` — for "list users at client" admin queries.

## What's NOT in this schema (deliberately)

- Ticket/estimate/invoice caches. Portal fetches these from TicketHub BFF on demand. Caching stale PSA data is a footgun.
- Asset/document caches. Same reason.
- Push notification subscriptions (web-push). Phase 5 if users ask for it.
- Two-factor seeds (TOTP). Passkey covers the MFA need; TOTP adds complexity without benefit.
- Org/tenant table. PCC2K is the only tenant; white-label is deferred.
