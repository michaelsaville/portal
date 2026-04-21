import 'server-only'
import { randomBytes, createHash } from 'crypto'

/** 32-byte base64url token for magic links. 256 bits of entropy. */
export function randomMagicToken(): string {
  return randomBytes(32).toString('base64url')
}

/** 32-byte hex token for session cookies. 256 bits of entropy. */
export function randomSessionToken(): string {
  return randomBytes(32).toString('hex')
}

/**
 * Tokens are stored hashed so an SQL injection or backup leak doesn't
 * give an attacker bearer access. We hash with SHA-256 (not bcrypt/
 * scrypt) because these are already 256-bit-entropy randoms — no
 * rainbow-table concern, no speed-bump needed, and we need O(1)
 * lookup on every request.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}
