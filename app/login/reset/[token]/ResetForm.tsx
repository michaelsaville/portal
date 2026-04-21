'use client'

import { useState, type FormEvent } from 'react'

export function ResetForm({ token }: { token: string }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/auth/password/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error ?? 'Reset failed')
        setSubmitting(false)
        return
      }
      window.location.href = '/'
    } catch {
      setError('Something went wrong — try again in a moment.')
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-stone-600 mb-1">
          New password
        </label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={10}
          autoComplete="new-password"
          className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm text-stone-800 focus:border-stone-500 focus:outline-none focus:ring-1 focus:ring-stone-500"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-stone-600 mb-1">
          Confirm
        </label>
        <input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          minLength={10}
          autoComplete="new-password"
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
        disabled={submitting || password.length < 10 || password !== confirm}
        className="w-full rounded-md bg-stone-800 text-white text-sm font-medium px-4 py-2 hover:bg-stone-700 disabled:opacity-50 transition-colors"
      >
        {submitting ? 'Saving…' : 'Save new password'}
      </button>
    </form>
  )
}
