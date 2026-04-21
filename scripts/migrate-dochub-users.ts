/**
 * One-shot migration: seed portal.portal_users and
 * portal.portal_user_client_links from DocHub's existing
 * public."PortalUser" rows.
 *
 * Idempotent — re-running won't create duplicates. Skips rows that
 * already exist by email (portal side); if the link for (user, client)
 * exists it leaves it untouched.
 *
 * Usage (from inside a docker container on dochub_default):
 *   node_modules/.bin/tsx scripts/migrate-dochub-users.ts
 *
 * Safety:
 * - Never drops or updates DocHub's PortalUser rows. Read-only on
 *   that side.
 * - Populates dochubPersonId on the link when the buyer's email also
 *   matches a Person row on the dochub side — makes the future FK
 *   upgrade safe.
 */

import { prisma } from '../app/lib/prisma'
import { PORTAL_ROLE_KEYS, isPortalRole } from '../app/lib/portal-roles'

interface DochubPortalUser {
  id: string
  clientId: string
  name: string
  email: string
  passwordHash: string | null
  isActive: boolean
  permissions: unknown
  lastLoginAt: Date | null
  createdAt: Date
  isPortalOwner: boolean
}

interface DochubPerson {
  id: string
  email: string | null
}

async function main() {
  const args = new Set(process.argv.slice(2))
  const dryRun = args.has('--dry-run')
  const verbose = args.has('--verbose')

  console.log(
    `[migrate] starting${dryRun ? ' (DRY RUN — no writes)' : ''}...`,
  )

  const dochubUsers = await prisma.$queryRaw<DochubPortalUser[]>`
    SELECT id, "clientId", name, email, "passwordHash", "isActive",
           permissions, "lastLoginAt", "createdAt", "isPortalOwner"
    FROM public."PortalUser"
    ORDER BY "createdAt" ASC
  `

  console.log(`[migrate] DocHub source: ${dochubUsers.length} portal user(s)`)

  if (dochubUsers.length === 0) {
    console.log('[migrate] nothing to do — source table is empty.')
    await prisma.$disconnect()
    return
  }

  // Fetch Person rows once, build a lowercased-email → id map so we can
  // populate dochubPersonId without N+1 queries.
  const persons = await prisma.$queryRaw<DochubPerson[]>`
    SELECT id, email FROM public."Person" WHERE email IS NOT NULL
  `
  const personByEmail = new Map<string, string>()
  for (const p of persons) {
    if (p.email) personByEmail.set(p.email.toLowerCase().trim(), p.id)
  }
  if (verbose) {
    console.log(`[migrate] DocHub Person rows with email: ${persons.length}`)
  }

  let createdUsers = 0
  let skippedUsers = 0
  let createdLinks = 0
  let skippedLinks = 0

  for (const src of dochubUsers) {
    const email = src.email.toLowerCase().trim()
    const role = src.isPortalOwner ? 'OWNER' : 'USER'
    if (!isPortalRole(role)) {
      console.warn(
        `[migrate] unknown role "${role}" for ${email}, defaulting to USER`,
      )
    }

    // ── Portal user row ────────────────────────────────────────────
    let existing = await prisma.portalUser.findUnique({ where: { email } })
    if (!existing) {
      if (dryRun) {
        console.log(
          `[migrate] would create PortalUser email=${email} isActive=${src.isActive}`,
        )
      } else {
        existing = await prisma.portalUser.create({
          data: {
            email,
            name: src.name,
            passwordHash: src.passwordHash,
            isActive: src.isActive,
            lastLoginAt: src.lastLoginAt,
            // Keep DocHub's createdAt so audit trails line up. Prisma
            // will overwrite updatedAt.
            createdAt: src.createdAt,
          },
        })
      }
      createdUsers++
    } else {
      if (verbose) console.log(`[migrate] user exists: ${email}`)
      skippedUsers++
    }

    const portalUserId = existing?.id
    if (!portalUserId) continue

    // ── Client link ────────────────────────────────────────────────
    const dupe = await prisma.portalUserClientLink.findUnique({
      where: {
        portalUserId_clientId: {
          portalUserId,
          clientId: src.clientId,
        },
      },
    })
    if (dupe) {
      if (verbose) {
        console.log(
          `[migrate] link exists: ${email} ↔ ${src.clientId} (role=${dupe.role})`,
        )
      }
      skippedLinks++
      continue
    }

    const dochubPersonId = personByEmail.get(email) ?? null
    const permissions =
      src.permissions && typeof src.permissions === 'object'
        ? (src.permissions as object)
        : {}

    if (dryRun) {
      console.log(
        `[migrate] would link ${email} ↔ client=${src.clientId} role=${role} personId=${dochubPersonId ?? '—'}`,
      )
    } else {
      await prisma.portalUserClientLink.create({
        data: {
          portalUserId,
          clientId: src.clientId,
          dochubPersonId,
          role,
          permissions: permissions as object,
        },
      })
    }
    createdLinks++
  }

  console.log('[migrate] done.')
  console.log(
    `[migrate]   users  : created=${createdUsers} skipped=${skippedUsers}`,
  )
  console.log(
    `[migrate]   links  : created=${createdLinks} skipped=${skippedLinks}`,
  )
  console.log(`[migrate]   roles in registry: ${PORTAL_ROLE_KEYS.join(', ')}`)

  await prisma.$disconnect()
}

main().catch((err) => {
  console.error('[migrate] FAILED:', err)
  process.exit(1)
})
