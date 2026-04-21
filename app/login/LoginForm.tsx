'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'

export function LoginForm({ next }: { next?: string }) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/auth/magic-link/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, next }),
      })
      if (!res.ok) throw new Error('Request failed')
      const params = new URLSearchParams({ sent: '1' })
      router.push(`/login?${params.toString()}`)
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
      {error && (
        <div className="rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">
          {error}
        </div>
      )}
      <button
        type="submit"
        disabled={submitting || !email}
        className="w-full rounded-md bg-stone-800 text-white text-sm font-medium px-4 py-2 hover:bg-stone-700 disabled:opacity-50 transition-colors"
      >
        {submitting ? 'Sending…' : 'Email me a sign-in link'}
      </button>
    </form>
  )
}
