import { redirect } from 'next/navigation'
import { getSession } from '@/app/lib/portal-auth'
import { LoginForm } from './LoginForm'

export const dynamic = 'force-dynamic'

interface Props {
  searchParams: Promise<{ error?: string; next?: string; sent?: string }>
}

export default async function LoginPage({ searchParams }: Props) {
  const session = await getSession()
  if (session) redirect('/')

  const params = await searchParams
  return (
    <main className="min-h-screen flex items-center justify-center p-8 bg-gradient-to-br from-stone-50 to-stone-100">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-sm font-mono tracking-widest uppercase text-stone-500">
            PCC2K
          </div>
          <h1 className="mt-2 font-serif text-3xl font-bold text-stone-800">
            Client Portal
          </h1>
        </div>

        <div className="bg-white rounded-lg border border-stone-200 p-6 shadow-sm">
          {params.sent === '1' ? (
            <div className="text-center space-y-3">
              <div className="text-3xl">📬</div>
              <h2 className="font-semibold text-stone-800">Check your email</h2>
              <p className="text-sm text-stone-600 leading-relaxed">
                If there&apos;s a portal account for that email, we just sent
                a sign-in link. It&apos;s good for 15 minutes.
              </p>
              <a
                href="/login"
                className="inline-block text-xs text-stone-500 hover:text-stone-700 underline"
              >
                back
              </a>
            </div>
          ) : (
            <>
              <h2 className="font-semibold text-stone-800 mb-1">Sign in</h2>
              <p className="text-sm text-stone-600 mb-4">
                We&apos;ll email you a one-time link. No password needed.
              </p>
              {params.error === 'link-expired' && (
                <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  That link was expired or already used. Request a fresh one.
                </div>
              )}
              <LoginForm next={params.next} />
            </>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-stone-500">
          Trouble signing in?{' '}
          <a
            href="mailto:hello@pcc2k.com"
            className="underline hover:text-stone-700"
          >
            hello@pcc2k.com
          </a>
        </p>
      </div>
    </main>
  )
}
