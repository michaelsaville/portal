import 'server-only'
import { createHmac } from 'node:crypto'
import { prisma } from '@/app/lib/prisma'
import {
  getTemplate,
  type PortalTemplateKey,
  type AnyPortalTemplate,
  PORTAL_TEMPLATES,
} from './templates'

export interface SendMessageInput {
  toEmail: string
  toName?: string | null
  /** Associated portal user, when one exists. Recorded for audit. */
  portalUserId?: string | null
  /** Arbitrary context stored on the outbound row, e.g. { clientId }. */
  metadata?: Record<string, unknown>
}

export interface SendResult {
  id: string
  status: 'SENT' | 'FAILED'
  errorMessage?: string
}

const PREVIEW_CAP = 2000

/**
 * Render a template and log the delivery attempt. Phase 1 does NOT
 * actually deliver email — it logs `[portal-mail]` to stdout. Phase 2
 * swaps the stub for a BFF call to TicketHub's M365 Graph sender,
 * without callers changing.
 *
 * Never throws. On delivery failure, returns { status: 'FAILED' } and
 * still records the row so the admin log shows the attempt.
 */
export async function sendMessage<K extends PortalTemplateKey>(
  templateKey: K,
  vars: Parameters<(typeof PORTAL_TEMPLATES)[K]['subject']>[0],
  input: SendMessageInput,
): Promise<SendResult> {
  const template = getTemplate(templateKey) as AnyPortalTemplate | null
  if (!template) {
    const row = await prisma.portalOutboundMessage.create({
      data: {
        templateKey,
        portalUserId: input.portalUserId ?? null,
        toEmail: input.toEmail,
        toName: input.toName ?? null,
        subject: '(unknown template)',
        bodyPreview: '',
        status: 'FAILED',
        errorMessage: `Template "${templateKey}" not registered`,
        metadata: input.metadata as object | undefined,
      },
    })
    return {
      id: row.id,
      status: 'FAILED',
      errorMessage: row.errorMessage ?? undefined,
    }
  }

  let subject = '(render failed)'
  let body = ''
  let renderError: string | null = null
  try {
    subject = template.subject(vars)
    body = template.body(vars)
  } catch (err) {
    renderError = err instanceof Error ? err.message : String(err)
  }

  if (renderError) {
    const row = await prisma.portalOutboundMessage.create({
      data: {
        templateKey,
        portalUserId: input.portalUserId ?? null,
        toEmail: input.toEmail,
        toName: input.toName ?? null,
        subject,
        bodyPreview: '',
        status: 'FAILED',
        errorMessage: `render failed: ${renderError}`,
        metadata: input.metadata as object | undefined,
      },
    })
    return {
      id: row.id,
      status: 'FAILED',
      errorMessage: row.errorMessage ?? undefined,
    }
  }

  let deliveryError: string | null = null
  try {
    await deliver({ to: input.toEmail, subject, html: body })
  } catch (err) {
    deliveryError = err instanceof Error ? err.message : String(err)
    console.error('[portal-mail] delivery failed', err)
  }

  const row = await prisma.portalOutboundMessage.create({
    data: {
      templateKey,
      portalUserId: input.portalUserId ?? null,
      toEmail: input.toEmail,
      toName: input.toName ?? null,
      subject,
      bodyPreview: body.slice(0, PREVIEW_CAP),
      status: deliveryError ? 'FAILED' : 'SENT',
      errorMessage: deliveryError,
      metadata: input.metadata as object | undefined,
    },
  })

  return {
    id: row.id,
    status: deliveryError ? 'FAILED' : 'SENT',
    errorMessage: deliveryError ?? undefined,
  }
}

/**
 * Delivery via the TicketHub BFF.
 *
 * Target: POST ${TICKETHUB_BFF_URL}/api/bff/portal/send-email
 * Auth: HMAC-SHA256 of `${timestampMs}.${rawBody}` signed with
 * PORTAL_BFF_SECRET, delivered in X-Portal-Signature + X-Portal-Timestamp.
 * Replay window ±5min on the receiving end.
 *
 * Throws on non-2xx so sendMessage() records a FAILED row with the
 * TH-side error message captured from the JSON response body.
 */
async function deliver(msg: {
  to: string
  subject: string
  html: string
}): Promise<void> {
  const base = process.env.TICKETHUB_BFF_URL
  const secret = process.env.PORTAL_BFF_SECRET
  if (!base) throw new Error('TICKETHUB_BFF_URL not configured')
  if (!secret) throw new Error('PORTAL_BFF_SECRET not configured')

  const body = JSON.stringify({ to: msg.to, subject: msg.subject, html: msg.html })
  const ts = Date.now().toString()
  const sig = createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex')

  const res = await fetch(`${base.replace(/\/+$/, '')}/api/bff/portal/send-email`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Portal-Timestamp': ts,
      'X-Portal-Signature': `sha256=${sig}`,
    },
    body,
  })

  if (!res.ok) {
    let detail = ''
    try {
      const json = (await res.json()) as { error?: string }
      detail = json.error ?? ''
    } catch {
      detail = (await res.text().catch(() => '')).slice(0, 200)
    }
    throw new Error(`BFF HTTP ${res.status}${detail ? ': ' + detail : ''}`)
  }
}
