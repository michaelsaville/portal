/**
 * Message template registry — one entry per customer-facing template
 * the portal can send. Rendering logic lives in code (not DB) because
 * one typo in an auth template breaks login for everyone. Admin
 * visibility happens via the sampleVars preview on /admin/messages.
 *
 * Adding a new template:
 *   1. Define it below with a stable camel_snake `key`.
 *   2. Call sendMessage('your_key', vars, { toEmail, toName, meta })
 *      from the code path that triggers it.
 *   3. /admin/messages picks it up automatically.
 */

export interface MessageTemplate<V> {
  key: string
  name: string
  description: string
  /** Human category for the admin page grouping. */
  category: 'Authentication' | 'Account' | 'Workflow'
  sampleVars: V
  subject: (vars: V) => string
  body: (vars: V) => string
}

// ── Helpers ─────────────────────────────────────────────────────────

const BRAND_COLOR = '#44403C' // stone-700
const ACCENT_COLOR = '#8B4513' // saddle brown — matches portal aesthetic

function wrap(title: string, html: string, meta: { toName?: string | null } = {}): string {
  const greeting = meta.toName
    ? `<p style="margin:0 0 12px;color:#57534E">Hi ${esc(meta.toName.split(' ')[0])},</p>`
    : ''
  return `<!doctype html><html><body style="margin:0;font-family:ui-serif,Georgia,serif;background:#FAFAF9;color:#1C1917">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#FAFAF9;padding:32px 16px">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border:1px solid #E7E5E4;border-radius:12px;padding:32px">
<tr><td>
<div style="font-family:ui-monospace,monospace;font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:#A8A29E;margin-bottom:8px">PCC2K · Client Portal</div>
<h1 style="margin:0 0 20px;font-size:22px;color:${BRAND_COLOR}">${esc(title)}</h1>
${greeting}
${html}
<hr style="border:none;border-top:1px solid #E7E5E4;margin:28px 0">
<p style="margin:0;font-size:12px;color:#A8A29E">Questions? Reply to this email or reach <a href="mailto:hello@pcc2k.com" style="color:${ACCENT_COLOR}">hello@pcc2k.com</a>.</p>
</td></tr></table></td></tr></table></body></html>`
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function button(href: string, label: string): string {
  return `<p style="margin:24px 0"><a href="${esc(href)}" style="display:inline-block;background:${ACCENT_COLOR};color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:500;font-size:14px">${esc(label)}</a></p>`
}

// ── Templates ───────────────────────────────────────────────────────

interface MagicLinkVars {
  link: string
  expiresInMinutes: number
  userName: string | null
}

export const magicLinkLogin: MessageTemplate<MagicLinkVars> = {
  key: 'magic_link_login',
  name: 'Magic link · sign in',
  description:
    'Sent when a user requests a passwordless sign-in from /login. Single-use, 15-minute TTL.',
  category: 'Authentication',
  sampleVars: {
    link: 'https://portal.pcc2k.com/api/auth/magic-link/exampletoken',
    expiresInMinutes: 15,
    userName: 'Jen Baker',
  },
  subject: () => 'Your PCC2K Portal sign-in link',
  body: (v) =>
    wrap(
      'Click to sign in',
      `<p>We received a sign-in request for your PCC2K Portal account. Click below to finish signing in — the link is good for ${v.expiresInMinutes} minutes and only works once.</p>
${button(v.link, 'Sign in to the portal')}
<p style="margin:16px 0 0;color:#57534E;font-size:13px">If you didn't request this, you can ignore this email — no one can sign in without receiving this link.</p>`,
      { toName: v.userName },
    ),
}

interface PasswordResetVars {
  link: string
  expiresInMinutes: number
  userName: string | null
}

export const passwordReset: MessageTemplate<PasswordResetVars> = {
  key: 'password_reset',
  name: 'Password · reset',
  description:
    'Sent when a user clicks "Forgot password?" on the login page.',
  category: 'Authentication',
  sampleVars: {
    link: 'https://portal.pcc2k.com/login/reset/exampletoken',
    expiresInMinutes: 60,
    userName: 'Jen Baker',
  },
  subject: () => 'Reset your PCC2K Portal password',
  body: (v) =>
    wrap(
      'Reset your password',
      `<p>A password reset was requested for your PCC2K Portal account. Click below to pick a new password — the link expires in ${v.expiresInMinutes} minutes.</p>
${button(v.link, 'Set a new password')}
<p style="margin:16px 0 0;color:#57534E;font-size:13px">If you didn't request this, nothing's changed — you can safely ignore this email.</p>`,
      { toName: v.userName },
    ),
}

interface InviteVars {
  link: string
  expiresInHours: number
  userName: string
  invitedByName: string
  clientName: string
  role: string
}

export const portalInvite: MessageTemplate<InviteVars> = {
  key: 'portal_invite',
  name: 'Portal · invite',
  description:
    'Sent from /admin/users when PCC2K staff invites a new user. Link lets the invitee set a password and lands them on the portal.',
  category: 'Account',
  sampleVars: {
    link: 'https://portal.pcc2k.com/login/reset/exampletoken',
    expiresInHours: 48,
    userName: 'Jen Baker',
    invitedByName: 'Michael Saville',
    clientName: 'Acme Corporation',
    role: 'BILLING',
  },
  subject: (v) => `You've been invited to the ${v.clientName} portal`,
  body: (v) =>
    wrap(
      `Welcome to ${v.clientName}'s portal`,
      `<p>${esc(v.invitedByName)} invited you to the PCC2K Client Portal as the <strong>${esc(v.role)}</strong> contact for <strong>${esc(v.clientName)}</strong>.</p>
<p>The portal is where you'll find your tickets, estimates, invoices, and the documents we maintain for you.</p>
${button(v.link, 'Set your password & sign in')}
<p style="margin:16px 0 0;color:#57534E;font-size:13px">This invite link is good for ${v.expiresInHours} hours. Prefer not to set a password? Once you're signed in you can switch to email sign-in links only.</p>`,
      { toName: v.userName },
    ),
}

// ── Registry ────────────────────────────────────────────────────────

export const PORTAL_TEMPLATES = {
  magic_link_login: magicLinkLogin,
  password_reset: passwordReset,
  portal_invite: portalInvite,
// eslint-disable-next-line @typescript-eslint/no-explicit-any
} as const satisfies Record<string, MessageTemplate<any>>

export type PortalTemplateKey = keyof typeof PORTAL_TEMPLATES

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyPortalTemplate = MessageTemplate<any>

export function listTemplates(): AnyPortalTemplate[] {
  return Object.values(PORTAL_TEMPLATES)
}

export function getTemplate(key: string): AnyPortalTemplate | null {
  return (PORTAL_TEMPLATES as Record<string, AnyPortalTemplate>)[key] ?? null
}
