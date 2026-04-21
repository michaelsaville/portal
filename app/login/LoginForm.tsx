'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'

type Mode = 'magic' | 'password' | 'forgot'

export function LoginForm({ next }: { next?: string }) {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('magic')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      if (mode === 'magic') {
        await fetch('/api/auth/magic-link/request', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, next }),
        })
        router.push('/login?sent=1')
        return
      }
      if (mode === 'forgot') {
        await fetch('/api/auth/password/request-reset', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        })
        router.push('/login?sent=1')
        return
      }
      // password login
      const res = await fetch('/api/auth/password/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? 'Invalid email or password')
        setSubmitting(false)
        return
      }
      const dest =
        next && next.startsWith('/') && !next.startsWith('//') ? next : '/'
      window.location.href = dest
    } catch {
      setError('Something went wrong — try again in a moment.')
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label
          htmlFor="email"
          className="block text-xs font-medium text-stone-600 mb-1"
        >
          Email
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoFocus
          autoComplete="email"
          placeholder="you@company.com"
          className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm text-stone-800 focus:border-stone-500 focus:outline-none focus:ring-1 focus:ring-stone-500"
        />
      </div>

      {mode === 'password' && (
        <div>
          <label
            htmlFor="password"
            className="block text-xs font-medium text-stone-600 mb-1"
          >
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm text-stone-800 focus:border-stone-500 focus:outline-none focus:ring-1 focus:ring-stone-500"
          />
        </div>
      )}

      {error && (
        <div className="rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting || !email || (mode === 'password' && !password)}
        className="w-full rounded-md bg-stone-800 text-white text-sm font-medium px-4 py-2 hover:bg-stone-700 disabled:opacity-50 transition-colors"
      >
        {submitting
          ? 'Working…'
          : mode === 'magic'
            ? 'Email me a sign-in link'
            : mode === 'forgot'
              ? 'Email me a reset link'
              : 'Sign in'}
      </button>

      <div className="flex items-center justify-between pt-2 text-xs text-stone-500">
        {mode === 'magic' && (
          <>
            <button
              type="button"
              onClick={() => setMode('password')}
              className="underline hover:text-stone-700"
            >
              Use password instead
            </button>
            <span />
          </>
        )}
        {mode === 'password' && (
          <>
            <button
              type="button"
              onClick={() => setMode('magic')}
              className="underline hover:text-stone-700"
            >
              Email me a link instead
            </button>
            <button
              type="button"
              onClick={() => setMode('forgot')}
              className="underline hover:text-stone-700"
            >
              Forgot password?
            </button>
          </>
        )}
        {mode === 'forgot' && (
          <>
            <button
              type="button"
              onClick={() => setMode('password')}
              className="underline hover:text-stone-700"
            >
              ← back to sign in
            </button>
            <span />
          </>
        )}
      </div>
    </form>
  )
}
