/**
 * Deterministic per-client tint for the company chip in the sidebar.
 * Hash a clientId into one of four accessible palette entries so the
 * same client always gets the same color across sessions and devices.
 *
 * Restricted to stone/sky/violet/teal so contrast against the chip
 * label stays readable; brand colors are deferred to a later phase
 * (Client.portalAccentHex when added).
 */
const TINTS = [
  { bg: 'bg-stone-200', text: 'text-stone-800', ring: 'ring-stone-300' },
  { bg: 'bg-sky-100', text: 'text-sky-800', ring: 'ring-sky-200' },
  { bg: 'bg-violet-100', text: 'text-violet-800', ring: 'ring-violet-200' },
  { bg: 'bg-teal-100', text: 'text-teal-800', ring: 'ring-teal-200' },
  { bg: 'bg-amber-100', text: 'text-amber-800', ring: 'ring-amber-200' },
  { bg: 'bg-rose-100', text: 'text-rose-800', ring: 'ring-rose-200' },
] as const

export type ClientTint = (typeof TINTS)[number]

export function clientTint(clientId: string): ClientTint {
  let hash = 0
  for (let i = 0; i < clientId.length; i++) {
    hash = (hash * 31 + clientId.charCodeAt(i)) | 0
  }
  return TINTS[Math.abs(hash) % TINTS.length]
}

/**
 * Up-to-3-letter abbreviation for the company chip. Falls back to the
 * first 3 alphanumeric chars of the name when no shortCode is set.
 */
export function clientAbbrev(name: string): string {
  const words = name
    .replace(/[^a-zA-Z0-9 ]/g, '')
    .split(/\s+/)
    .filter(Boolean)
  if (words.length >= 2) {
    return words
      .slice(0, 3)
      .map((w) => w[0]!.toUpperCase())
      .join('')
  }
  return (words[0] ?? name).slice(0, 3).toUpperCase()
}
