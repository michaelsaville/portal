import 'server-only'
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
 * Delivery stub. Phase 1: log to stdout with a parseable prefix so
 * dev can grep it. Phase 2 replaces this with a BFF POST to
 * tickethub.pcc2k.com/api/bff/portal/send-email (HMAC-signed).
 */
async function deliver(msg: {
  to: string
  subject: string
  html: string
}): Promise<void> {
  const line = [
    '[portal-mail]',
    `to=${msg.to}`,
    `subject=${JSON.stringify(msg.subject)}`,
    `bytes=${msg.html.length}`,
  ].join(' ')
  console.log(line)
}
