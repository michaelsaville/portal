import Link from 'next/link'
import { ResetForm } from './ResetForm'

export const dynamic = 'force-dynamic'

export default async function ResetPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params

  return (
    <main className="min-h-screen flex items-center justify-center p-8 bg-gradient-to-br from-stone-50 to-stone-100">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-sm font-mono tracking-widest uppercase text-stone-500">
            PCC2K
          </div>
          <h1 className="mt-2 font-serif text-3xl font-bold text-stone-800">
            Set a new password
          </h1>
        </div>
        <div className="bg-white rounded-lg border border-stone-200 p-6 shadow-sm">
          <p className="text-sm text-stone-600 mb-4">
            Pick something at least 10 characters long. We&apos;ll sign you in
            as soon as you save.
          </p>
          <ResetForm token={token} />
        </div>
        <p className="mt-6 text-center text-xs text-stone-500">
          Changed your mind?{' '}
          <Link href="/login" className="underline hover:text-stone-700">
            back to sign in
          </Link>
        </p>
      </div>
    </main>
  )
}
