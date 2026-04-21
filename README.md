# PCC2K Client Portal

Unified client-facing portal for PCC2K — merges the portions of
DocHub and TicketHub that customers actually interact with into one
login, one URL, one navigation.

Live at **https://portal.pcc2k.com** (once Phase 1 ships).

## Shape

This is the **third** app in the stack:

```
  dochub.pcc2k.com     →  staff docs / CMDB / vault / passwords
  tickethub.pcc2k.com  →  staff PSA / tickets / time / invoicing
  portal.pcc2k.com     →  clients (magic link or SSO, no password preferred)
```

The portal owns identity — `PortalUser`, sessions, magic links, passkeys
— in its own `portal` schema on the same Postgres instance as DocHub
and TicketHub. It reaches into the other two via BFF endpoints
(`/api/bff/portal/*`) protected with HMAC shared secrets. No direct
cross-app imports; no coupling that would break a migration later.

## Planning docs

Everything in `docs/` is the pre-implementation plan and recon work.
Read order:

1. `docs/README.md` — orientation
2. `docs/PLAN.md` — architecture, phased migration, open decisions
3. `docs/AUTH.md` — magic link / Entra / passkey flows
4. `docs/DB.md` — draft Prisma schema + design rationale
5. `docs/API-CONTRACTS.md` — BFF endpoint specs
6. `docs/FIXES.md` — bugs caught in recon (numbered 1–21)

## Role model

Five fixed roles — `OWNER`, `BILLING`, `TECHNICAL`, `USER`, `VIEWER` —
defined in `app/lib/portal-roles.ts`. Each ships a permission preset;
per-link JSON overrides handle one-offs ("Jen is BILLING everywhere
except ClientZ where she's also TECHNICAL"). Stored as string (not
Prisma enum) so a future upgrade to a first-class `PortalRole` table
is a non-breaking migration rather than an enum drop. See
`docs/PLAN.md` D-Roles for the full rationale.

## Running locally

```bash
cp .env.example .env.local   # fill in DATABASE_URL, PORTAL_SESSION_SECRET, etc.
npm install
npm run db:push              # pushes the `portal` schema into the shared Postgres
npm run dev                  # → http://localhost:3006
```

Docker deploy mirrors DocHub/TicketHub:

```bash
docker compose build app
docker compose up -d app
```

## Status

- [x] Planning done (see `docs/`)
- [x] DNS + GitHub repo + scaffold
- [ ] Phase 1 — identity foundation + DocHub user migration
- [ ] Phase 2 — DocHub sections (assets/docs/contacts/locations/…)
- [ ] Phase 3 — TicketHub portal ports (estimates/tickets/invoices)
- [ ] Phase 4 — email-first actionable buttons + Stripe pay
- [ ] Phase 5 — polish, passkeys mainstream, multi-MSP scope
