import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession } from '@/app/lib/portal-auth'
import { VendorLoginForm } from './VendorLoginForm'

export const dynamic = 'force-dynamic'

interface Props {
  searchParams: Promise<{
    error?: string
    next?: string
    'wrong-portal'?: string
  }>
}

export default async function VendorLoginPage({ searchParams }: Props) {
  const session = await getSession()
  if (session?.user.persona === 'VENDOR') redirect('/vendor')
  const params = await searchParams

  return (
    <main className="min-h-screen flex items-center justify-center p-8 bg-gradient-to-br from-stone-50 to-stone-100">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-sm font-mono tracking-widest uppercase text-stone-500">
            PCC2K
          </div>
          <h1 className="mt-2 font-serif text-3xl font-bold text-stone-800">
            Vendor Portal
          </h1>
        </div>

        <div className="bg-white rounded-lg border border-stone-200 p-6 shadow-sm">
          {params['wrong-portal'] === '1' && (
            <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              You're signed in to the customer portal. Use a vendor account
              to sign in here.
            </div>
          )}
          <VendorLoginForm next={params.next ?? '/vendor'} initialError={params.error ?? null} />
        </div>

        <p className="mt-4 text-center text-xs text-stone-500">
          Customer of PCC2K?{' '}
          <Link href="https://portal.pcc2k.com/login" className="underline hover:text-stone-700">
            Use the customer portal
          </Link>
          .
        </p>
      </div>
    </main>
  )
}
