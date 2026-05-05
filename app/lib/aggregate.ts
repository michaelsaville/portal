/**
 * Sentinel value the CompanySwitcher posts as `clientId` when the
 * user picks the "All companies" pseudo-row. switchClientAction
 * branches on this string to flip aggregateMode instead of changing
 * activeClientId.
 *
 * Lives in its own file because Next.js server-action files
 * (`'use server'`) can only export async functions — a plain const
 * export breaks the build.
 */
export const AGGREGATE_SENTINEL = '__ALL__'
