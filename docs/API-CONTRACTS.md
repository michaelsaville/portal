# BFF API Contracts

Endpoints that DocHub and TicketHub will expose for the portal to consume. These are service-to-service only — never called by a browser directly.

## Service authentication

Every BFF request carries:

```
Authorization: Bearer <SERVICE_TOKEN>
X-Portal-Timestamp: <unix-seconds>
X-Portal-Nonce: <16 random bytes base64>
X-Portal-Signature: <hmac-sha256 of "{timestamp}.{nonce}.{method}.{path}.{sha256(body)}">
```

- `SERVICE_TOKEN`: opaque shared secret, provisioned in both portal and downstream env. Grants BFF access only — not a user session.
- `X-Portal-Signature`: HMAC-SHA256 over a canonical string using the secret as key. Timestamp window: ±5 minutes. Nonce replay-cached for 10 minutes.
- Rotate `SERVICE_TOKEN` quarterly. Downstream apps must support two tokens concurrently during rotation.

### Error responses

All BFF endpoints return errors as:

```json
{ "error": { "code": "NOT_FOUND", "message": "...", "details": {} } }
```

Codes: `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `BAD_REQUEST`, `RATE_LIMITED`, `CONFLICT`, `INTERNAL`.

## Portal-side identity on every request

When the portal calls a BFF endpoint on behalf of a specific user, it includes:

```
X-Portal-User-Email: <email>
X-Portal-Active-Client: <client-id>
```

The downstream BFF uses these for logging and (optionally) cross-checking. It must NOT trust them for authorization — authorization is enforced by the portal before the call, because only the portal knows the user's session.

**Rationale:** the portal is the trusted front door. DocHub/TicketHub BFFs accept any authenticated service-token request. This simplifies the mental model: don't double-check authorization; check it once in the portal.

---

## DocHub BFF (`dochub.pcc2k.com/api/bff/portal/*`)

### Persons

#### `GET /persons/by-email`

Query: `email=<string>&clientId=<string>`

Response 200:
```json
{
  "id": "cmaf...",
  "name": "Jane Smith",
  "email": "jane@acmecorp.com",
  "phone": "+1-555-0100",
  "mobile": "+1-555-0101",
  "jobTitle": "IT Manager",
  "role": "PRIMARY_CONTACT",
  "isPrimary": true,
  "isBilling": false,
  "isEscalation": false,
  "isActive": true
}
```

Response 404: `{ "error": { "code": "NOT_FOUND", "message": "No person found" } }`

#### `GET /persons/:id`

Same shape as `by-email` response.

---

### Client-scoped resources

All require `clientId` path param. Portal verifies user has access to this client before calling.

#### `GET /clients/:clientId/assets`

Response 200:
```json
[
  {
    "id": "...",
    "name": "Jane's Laptop",
    "friendlyName": "DESKTOP-ABC123",
    "category": "LAPTOP",
    "status": "ACTIVE",
    "make": "Dell",
    "model": "Latitude 7420",
    "serial": "SN...",
    "assetTag": "PCC-00123",
    "ipAddress": "10.0.0.42",
    "room": "IT Closet",
    "purchaseDate": "2023-04-01",
    "warrantyExpiry": "2026-04-01",
    "location": { "id": "...", "name": "HQ", "city": "Cumberland" },
    "assetType": { "id": "...", "name": "Laptop" }
  }
]
```

Excludes: credentials, IP assignments, internal notes, RETIRED assets.

#### `GET /clients/:clientId/documents`

```json
[
  {
    "id": "...",
    "title": "Wi-Fi Setup Guide",
    "content": "## Wi-Fi...\n\n...",
    "category": "GUIDE",
    "isPinned": true,
    "updatedAt": "2026-04-15T...",
    "folder": { "id": "...", "name": "Getting Started" }
  }
]
```

Returns full markdown content (portal renders). Future: add `isInternal` flag on `ClientDocument` to hide MSP-only notes; for now all client docs are visible.

#### `GET /clients/:clientId/contacts`

```json
[
  {
    "id": "...",
    "name": "Jane Smith",
    "role": "PRIMARY_CONTACT",
    "email": "jane@acmecorp.com",
    "phone": "+1-555-0100",
    "mobile": "+1-555-0101",
    "isPrimary": true,
    "isBilling": false
  }
]
```

(Post-Person-merge — these are `Person` rows, not the old `Contact`.)

#### `GET /clients/:clientId/locations`

```json
[
  {
    "id": "...",
    "name": "HQ",
    "address": "100 Main St",
    "city": "Cumberland",
    "state": "MD",
    "zip": "21502",
    "ispName": "Verizon",
    "wanIp": "1.2.3.4",
    "notes": "..."
  }
]
```

Excludes `tailscaleIp`.

#### `GET /clients/:clientId/licenses`

```json
[
  {
    "id": "...",
    "name": "Microsoft 365 Business Standard",
    "vendor": "Microsoft",
    "seats": 25,
    "assignedSeats": 23,
    "expiryDate": "2026-10-15",
    "renewalDate": "2026-09-15"
  }
]
```

Excludes `licenseKey`.

#### `GET /clients/:clientId/domains`

```json
[
  {
    "id": "...",
    "domain": "acmecorp.com",
    "registrar": "GoDaddy",
    "autoRenew": true,
    "expiresAt": "2027-01-10",
    "sslExpiresAt": "2026-06-20",
    "sslIssuer": "Let's Encrypt"
  }
]
```

Backed by the `Website` table.

#### `GET /clients/:clientId/apps`

```json
[
  {
    "seatId": "...",
    "appName": "QuickBooks Enterprise",
    "url": "https://...",
    "launcherType": "RDP",
    "iconUrl": "..."
  }
]
```

Returns seats assigned to the calling user (portal sends `X-Portal-User-Email`).

#### `POST /clients/:clientId/apps/:seatId/rdp`

Response 200: `Content-Type: application/x-rdp`, body is the generated RDP file bytes.

Requires `X-Portal-User-Email` to match the seat's assigned person (prevents cross-user seat theft).

---

### Shared artifacts (notes, shares)

#### `POST /notes`

Body:
```json
{
  "content": "The Wi-Fi password is ...",
  "passphrase": "optional",
  "expiresInHours": 72
}
```

Response 201:
```json
{ "noteId": "...", "viewUrl": "https://portal.pcc2k.com/note/..." }
```

#### `GET /notes/:id`

Response 200:
```json
{ "exists": true, "hasPassphrase": true, "burnedAt": null }
```

Response 410 if burned.

#### `POST /notes/:id/view`

Body: `{ "passphrase": "optional" }`

Response 200:
```json
{ "content": "..." }
```

Side effect: sets `burnedAt = now()`. Next GET returns 410.

(Same shape for `/share/*` but for `SecureShareLink` rows with max-views semantics.)

---

### Admin (staff-only, called from DocHub's staff UI via proxy)

#### `GET /admin/clients/:clientId/portal-users`

Used by DocHub's `PortalUsersPanel` staff widget. Returns:

```json
[
  {
    "id": "...",
    "email": "jane@acmecorp.com",
    "name": "Jane Smith",
    "role": "MEMBER",
    "isActive": true,
    "lastLoginAt": "2026-04-20T...",
    "permissions": { "assets": true, "documents": true, ... }
  }
]
```

#### `POST /admin/clients/:clientId/portal-users`

Body: `{ "email", "name", "role", "permissions" }`

Response 201: full user object. Side effect: sends magic-link invite email.

#### `PATCH /admin/clients/:clientId/portal-users/:id`

Body: any subset of `{ name, role, permissions, isActive }`.

#### `DELETE /admin/clients/:clientId/portal-users/:id`

Revokes all sessions; soft-deletes user (`deletedAt` set).

---

## TicketHub BFF (`tickethub.pcc2k.com/api/bff/portal/*`)

### Contacts

#### `GET /contacts/by-email`

Query: `email=<string>&clientId=<string>`

Response 200:
```json
{
  "id": "...",
  "firstName": "Jane",
  "lastName": "Smith",
  "email": "jane@acmecorp.com",
  "phone": "+1-555-0100",
  "clientId": "...",
  "syncroId": "123456"
}
```

---

### Tickets

#### `GET /clients/:clientId/tickets`

Query: `status=OPEN|CLOSED|ALL&contactId?=&limit?=&cursor?=`

Response 200:
```json
{
  "items": [
    {
      "id": "...",
      "number": 1234,
      "subject": "Printer offline",
      "status": "OPEN",
      "priority": "NORMAL",
      "createdAt": "...",
      "updatedAt": "...",
      "lastReplyAt": "...",
      "contactId": "...",
      "contactName": "Jane Smith"
    }
  ],
  "nextCursor": null
}
```

#### `GET /tickets/:id`

Response 200: full ticket + replies array (`[{ id, authorId, authorName, body, createdAt, isPublic }]`). Replies with `isPublic=false` are excluded.

#### `POST /tickets`

Body:
```json
{
  "clientId": "...",
  "contactId": "...",
  "template": "NEW_USER|USER_LEFT|PRINTER|PASSWORD_RESET|OTHER",
  "subject": "...",
  "body": "...",
  "fields": { "userFullName": "John Doe", "hireDate": "2026-05-01" }
}
```

Response 201: `{ "id": "...", "number": 1235 }`

Side effect: internal ticket-creation pipeline (Syncro push, notification fan-out, etc.) runs as usual.

#### `POST /tickets/:id/replies`

Body: `{ "contactId": "...", "body": "...", "attachments": [...] }`

Response 201: `{ "id": "..." }`. Sends notification to assigned tech.

---

### Estimates

#### `GET /clients/:clientId/estimates`

Response 200:
```json
[
  {
    "id": "...",
    "number": "EST-0042",
    "title": "Q2 Workstation Refresh",
    "status": "SENT|APPROVED|DECLINED|EXPIRED|CONVERTED",
    "totalCents": 1545000,
    "sentAt": "...",
    "validUntil": "..."
  }
]
```

#### `GET /estimates/:id`

Response 200: full estimate with line items, taxes, notes, status-history.

#### `POST /estimates/:id/respond`

Body:
```json
{
  "action": "approve|decline",
  "contactId": "...",
  "reason": "optional free text on decline",
  "signatureName": "Jane Smith",
  "signatureIp": "1.2.3.4",
  "signatureUserAgent": "Mozilla/5.0...",
  "agreedAt": "2026-04-22T14:30:00Z"
}
```

Response 200: `{ "status": "APPROVED" }`

Side effect: auto-acknowledges matching `TICKETHUB_ESTIMATE` reminder, emails the assigned tech.

Validation:
- Contact must belong to the estimate's client (or to the specific contact if `restrictedToContactId` is set).
- Only `SENT` estimates can be responded to.
- `signatureName` required and non-empty.

#### `GET /estimates/:id/pdf`

Response 200: PDF bytes. Replaces the broken staff-auth-only endpoint.

---

### Invoices

#### `GET /clients/:clientId/invoices`

Query: `status=OPEN|PAID|OVERDUE|ALL`

Response 200:
```json
[
  {
    "id": "...",
    "number": "INV-0123",
    "amountCents": 125000,
    "status": "OPEN",
    "issueDate": "2026-04-01",
    "dueDate": "2026-04-30",
    "paidAt": null,
    "firstViewedAt": null,
    "viewCount": 0
  }
]
```

#### `GET /invoices/:id`

Full invoice with line items.

#### `POST /invoices/:id/viewed`

No body. Idempotently sets `firstViewedAt` if null; increments `viewCount` regardless.

#### `POST /invoices/:id/pay`

Body:
```json
{
  "provider": "SQUARE",
  "returnUrl": "https://portal.pcc2k.com/invoices/.../paid",
  "cancelUrl": "https://portal.pcc2k.com/invoices/..."
}
```

Response 200: `{ "checkoutUrl": "https://connect.squareup.com/..." }`

Portal redirects user to `checkoutUrl`. Square webhook hits `POST tickethub.pcc2k.com/api/webhooks/square` which updates `paidAt`.

---

### Reminders

#### `GET /contacts/:contactId/reminders`

Query: `status=ACTIVE|SNOOZED|ALL`

Response 200:
```json
[
  {
    "id": "...",
    "title": "Approve Estimate EST-0042",
    "body": "...",
    "actionUrl": "https://...",
    "source": "SYNCRO_ESTIMATE|TICKETHUB_ESTIMATE|MANUAL",
    "status": "ACTIVE",
    "recurrence": "EVERY_3_DAYS",
    "dueDate": null,
    "nextNotifyAt": "...",
    "notifyCount": 2,
    "lastNotifiedAt": "..."
  }
]
```

#### `POST /reminders/:id/acknowledge`

Body: `{ "contactId": "..." }`

Response 200: `{}`

Validation: reminder's contactId must match provided contactId.

#### `POST /reminders/:id/snooze`

Body: `{ "contactId": "...", "days": 3 }`

Response 200: `{ "snoozedUntil": "..." }`

---

### Email sending (internal, called FROM portal)

#### `POST /internal/send-email`

Body:
```json
{
  "to": "jane@acmecorp.com",
  "subject": "...",
  "html": "...",
  "text": "...",
  "from": "optional override",
  "tags": ["magic-link", "login"]
}
```

Response 200: `{ "messageId": "..." }`

Auth: service token as always.

This endpoint wraps TicketHub's existing `sendMail()` M365 Graph helper. Portal uses it instead of talking to M365 directly, so the Graph app registration stays in one place.

#### `POST /internal/magic-link-url`

Called BY TicketHub when composing reminder emails — gets a portal-signed magic link for the email button.

Request (TicketHub → portal):
```json
{
  "email": "jane@acmecorp.com",
  "purpose": "ACTION_ACK_REMINDER",
  "payload": { "reminderId": "..." },
  "expiresInDays": 30
}
```

Response:
```json
{
  "url": "https://portal.pcc2k.com/a/<token>",
  "expiresAt": "..."
}
```

This is the ONE exception to the rule that BFF calls go one direction (portal → downstream). The reminder cron fires on TicketHub, so TicketHub needs to request magic links from portal while assembling email bodies. Auth: same HMAC service token, but the shared secret is the *reverse* direction (separate token `PORTAL_INTERNAL_TOKEN` that TicketHub sends to portal).

---

## Rate limits (recommended starting values)

Downstream BFFs should enforce:

- 100 req/min per `SERVICE_TOKEN` per endpoint.
- Burst up to 200 with leaky bucket.

Portal-side enforcement before calling BFF:
- `POST /tickets` — 10/minute per user
- `POST /tickets/:id/replies` — 30/minute per user
- `POST /estimates/:id/respond` — 5/minute per user (meaningful actions are rare)
- `POST /invoices/:id/pay` — 3/minute per user

---

## Deployment / rollout notes

1. **Ship BFFs first, portal consumes them second.** In Phase 2, DocHub's BFF endpoints deploy in advance; portal calls them once they're live. Rolling back portal doesn't break DocHub.
2. **Feature flags on BFF endpoints.** Each new BFF endpoint is gated by an env var `BFF_PORTAL_ENABLED=true`. Turn off per-endpoint if it misbehaves.
3. **Metrics.** Every BFF call logs `{ endpoint, duration_ms, status, service_token_id, client_id, user_email_hash }`. Portal logs the corresponding outbound call. Cross-reference for diagnosis.
4. **Tracing.** Portal passes `X-Request-Id` header; BFF includes it in all log lines. Diagnosing a slow request is a single grep.
