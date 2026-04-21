# Portal Planning — read order

This folder holds the planning docs for the unified `portal.pcc2k.com` client portal. Written 2026-04-21 evening; repo + DNS to be created 2026-04-22.

## Read in this order

1. **`PLAN.md`** — the master plan. Architecture, identity decisions, phased migration, open questions. Start here.
2. **`AUTH.md`** — deep dive on auth flows (magic-link, Entra SSO, passkey, email-action tokens). Load-bearing — read before implementing anything identity-related.
3. **`DB.md`** — draft Prisma schema for the portal repo. Copy-paste starting point.
4. **`API-CONTRACTS.md`** — BFF endpoint specs that DocHub and TicketHub need to expose.
5. **`FIXES.md`** — bugs and cleanup items found during recon, mapped to migration phases.

## Two things to do tomorrow morning before Claude starts coding

1. **Verify reminder cron is running on TicketHub.** Recon flagged that `/api/cron/reminder-notify` may not be in the crontab (only `sla-check` and `m365-subscription-renew` were seen). If it isn't, no client has been getting reminder emails — that's a live incident, fix before anything else.
   ```
   crontab -l | grep -i reminder
   tail -200 ~/tickethub/cron.log | grep -i reminder
   ```

2. **Decide the five open questions in PLAN.md §12** — especially D1 (which Postgres), D3 (payment provider: Square/Stripe/ConnectBooster), D4 (white-label scope).

## Source of facts

The plan is built on two deep recon reports of the existing portals — summarized in PLAN.md and FIXES.md with file:line citations. If anything in the plan looks wrong, the underlying code facts are all cited; don't take the plan on faith.
