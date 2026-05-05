import { redirect } from 'next/navigation'
import { prisma } from '@/app/lib/prisma'
import { hashToken } from '@/app/lib/tokens'
import { getSession } from '@/app/lib/portal-auth'
import { VendorSetupForm } from './VendorSetupForm'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ token: string }>
}

export default async function VendorInvitePage({ params }: Props) {
  const session = await getSession()
  if (session?.user.persona === 'VENDOR') redirect('/vendor')

  const { token } = await params

  const link = await prisma.portalMagicLink.findUnique({
    where: { token: hashToken(token) },
    select: {
      purpose: true,
      consumedAt: true,
      usesLeft: true,
      expiresAt: true,
      portalUser: { select: { email: true, name: true, persona: true } },
    },
  })

  const status =
    !link
      ? 'invalid'
      : link.purpose !== 'VENDOR_INVITE' || link.portalUser.persona !== 'VENDOR'
        ? 'invalid'
        : link.consumedAt || link.usesLeft <= 0
          ? 'used'
          : link.expiresAt < new Date()
            ? 'expired'
            : 'ok'

  return (
    <main className="min-h-screen flex items-center justify-center p-8 bg-gradient-to-br from-stone-50 to-stone-100">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="text-sm font-mono tracking-widest uppercase text-stone-500">
            PCC2K
          </div>
          <h1 className="mt-2 font-serif text-3xl font-bold text-stone-800">
            Vendor Portal — set up your account
          </h1>
        </div>

        <div className="bg-white rounded-lg border border-stone-200 p-6 shadow-sm">
          {status === 'ok' && link && (
            <>
              <p className="mb-4 text-sm text-stone-700">
                You've been invited as <strong>{link.portalUser.email}</strong>.
                Choose a name and password to finish creating your account.
              </p>
              <VendorSetupForm token={token} defaultName={link.portalUser.name} />
            </>
          )}
          {status === 'invalid' && (
            <p className="text-sm text-rose-700">
              This invite link is invalid. Check the email or ask PCC2K to
              resend it.
            </p>
          )}
          {status === 'used' && (
            <p className="text-sm text-stone-700">
              This invite link has already been used. If you've already set up
              your password,{' '}
              <a href="/vendor/login" className="underline">
                sign in
              </a>{' '}
              instead.
            </p>
          )}
          {status === 'expired' && (
            <p className="text-sm text-rose-700">
              This invite link has expired. Ask PCC2K to send a fresh one.
            </p>
          )}
        </div>
      </div>
    </main>
  )
}
