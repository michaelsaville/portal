'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/app/components/ui/Button'
import { Card } from '@/app/components/ui/Card'
import { TextInput, Textarea } from '@/app/components/ui/Input'

const TITLE_MAX = 200
const BODY_MAX = 8000

export function NewTicketForm() {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) {
      setError('Please add a title.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/portal/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description: body }),
      })
      const data = (await res.json()) as { ticketId?: string; error?: string }
      if (!res.ok || !data.ticketId) {
        setError(data.error ?? 'Could not open ticket')
        setSubmitting(false)
        return
      }
      router.push(`/tickets/${data.ticketId}`)
    } catch {
      setError('Network error — try again.')
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <Card tone="danger" padding="sm">
          <p className="text-sm text-rose-800">{error}</p>
        </Card>
      )}

      <Card>
        <div className="space-y-3">
          <TextInput
            label="Title"
            placeholder="Short summary of what's wrong"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={TITLE_MAX}
            autoFocus
            required
            hint={`${title.length}/${TITLE_MAX}`}
          />
          <Textarea
            label="Description"
            placeholder="What happened? Include the affected user, when it started, anything you've already tried, and a screenshot description if relevant."
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={8}
            maxLength={BODY_MAX}
            hint={`${body.length}/${BODY_MAX} — optional but helpful`}
          />
        </div>
      </Card>

      <Card tone="muted" padding="sm">
        <p className="text-xs text-stone-600">
          We'll triage and prioritize on our end. If something is urgent or
          time-sensitive, mention it in the description and call us at{' '}
          <a className="underline" href="tel:+18143226908">
            (814) 322-6908
          </a>
          .
        </p>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={submitting || !title.trim()}>
          {submitting ? 'Opening…' : 'Open ticket'}
        </Button>
        <Button variant="secondary" href="/tickets">
          Cancel
        </Button>
      </div>
    </form>
  )
}
