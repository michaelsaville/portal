import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/lib/prisma'
import { verifyInboundHmac } from '@/app/lib/bff-verify'
import { issueMagicLink, audit } from '@/app/lib/portal-auth'

export const runtime = 'nodejs'

/**
 * POST /api/bff/vendor/provision  (HMAC-signed, from DocHub staff UI)
 * Body: { email, name?, vendorId, vendorName, clientId, clientName }
 *
 * Provisions / updates a VENDOR-persona portal account for a client's outside
 * vendor and records the (dochubVendorId, clientId) grant. DocHub remains the
 * source of truth for WHAT is shared; this only establishes the login + scope.
 *
 * New account → mint a VENDOR_INVITE link and return its setup URL so the
 * inviting staff member can hand it over (or have it emailed). Returning
 * vendor (already has a password) → just add the grant; no invite needed.
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const verify = verifyInboundHmac(
    rawBody,
    req.headers.get('x-portal-signature'),
    req.headers.get('x-portal-timestamp'),
  )
  if (!verify.ok) return NextResponse.json({ error: verify.reason }, { status: verify.status })

  let body: {
    email?: string; name?: string
    vendorId?: string; vendorName?: string
    clientId?: string; clientName?: string
  }
  try { body = JSON.parse(rawBody) } catch { return NextResponse.json({ error: 'invalid JSON' }, { status: 400 }) }

  const email = body.email?.toLowerCase().trim() ?? ''
  const vendorId = body.vendorId?.trim() ?? ''
  const clientId = body.clientId?.trim() ?? ''
  if (!email || !vendorId || !clientId || !body.vendorName || !body.clientName) {
    return NextResponse.json(
      { error: 'email, vendorId, vendorName, clientId, clientName required' },
      { status: 400 },
    )
  }
  const name = body.name?.trim() || body.vendorName

  // Upsert the vendor-persona identity. A brand-new account has no password
  // (can't log in until the invite is completed); never disturb an existing
  // one's password/name on a re-provision.
  const user = await prisma.portalUser.upsert({
    where: { email_persona: { email, persona: 'VENDOR' } },
    create: { email, persona: 'VENDOR', name },
    update: {},
  })

  // Record / refresh the access grant (idempotent on re-invite).
  await prisma.portalVendorClientGrant.upsert({
    where: {
      portalUserId_dochubVendorId_clientId: {
        portalUserId: user.id, dochubVendorId: vendorId, clientId,
      },
    },
    create: {
      portalUserId: user.id,
      dochubVendorId: vendorId,
      vendorName: body.vendorName,
      clientId,
      clientName: body.clientName,
      isActive: true,
    },
    update: { vendorName: body.vendorName, clientName: body.clientName, isActive: true },
  })

  await audit('ADMIN_INVITE', {
    portalUserId: user.id,
    data: { source: 'dochub-vendor-portal', vendorId, clientId, email },
  }).catch(() => {})

  // Already set up → no invite link, the new grant just appears next login.
  if (user.passwordHash) {
    return NextResponse.json({ ok: true, alreadyActive: true, emailed: false })
  }

  const { token } = await issueMagicLink({
    portalUserId: user.id,
    purpose: 'VENDOR_INVITE',
    ttlMinutes: 60 * 24 * 7, // 7 days
  })
  const base = (process.env.VENDOR_PUBLIC_URL ?? 'https://vendor.pcc2k.com').replace(/\/$/, '')
  const setupUrl = `${base}/vendor/invite/${token}`

  return NextResponse.json({ ok: true, setupUrl, emailed: false })
}
