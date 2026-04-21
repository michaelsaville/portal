import 'server-only'
import crypto from 'crypto'

/**
 * Password hash format: `{hexSalt}:{hexHash}` using scrypt(password,
 * salt, 64). Matches DocHub's existing scheme exactly so migrated
 * password hashes verify without a reset.
 */

const SALT_BYTES = 16
const HASH_BYTES = 64

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(SALT_BYTES).toString('hex')
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, HASH_BYTES, (err, hash) => {
      if (err) reject(err)
      else resolve(`${salt}:${hash.toString('hex')}`)
    })
  })
}

export async function verifyPassword(
  password: string,
  stored: string | null | undefined,
): Promise<boolean> {
  if (!stored) return false
  const [salt, hash] = stored.split(':')
  if (!salt || !hash) return false
  return new Promise((resolve) => {
    crypto.scrypt(password, salt, HASH_BYTES, (err, derived) => {
      if (err) return resolve(false)
      const a = Buffer.from(derived.toString('hex'))
      const b = Buffer.from(hash)
      if (a.length !== b.length) return resolve(false)
      resolve(crypto.timingSafeEqual(a, b))
    })
  })
}

/**
 * Minimum password policy. Intentionally light — we prefer magic
 * links and passkeys. Password exists as fallback for migrated users
 * + technophobes.
 */
export function validatePassword(password: string): string | null {
  if (typeof password !== 'string') return 'Password required'
  if (password.length < 10) return 'Password must be at least 10 characters'
  if (password.length > 256) return 'Password too long'
  return null
}
