import type { RecoveryLink } from '../types'

/**
 * What a password reset link brought with it (#223). Supabase Auth sends the
 * person back to the app with the outcome in the URL: `#...&type=recovery` for
 * a good link (the client turns the tokens into a session), or
 * `error_code=otp_expired` (or another error) for a link that is expired or
 * already used. Errors can come in the hash or the query string.
 *
 * Read once, before the Supabase client starts, because the client clears the
 * hash as it signs in, and a listener attached later can miss the
 * `PASSWORD_RECOVERY` event (`lib/supabase.ts`).
 */
export function parseRecoveryLink(hash: string, search = ''): RecoveryLink {
  const read = (part: string) => new URLSearchParams(part.replace(/^[#?]/, ''))
  const fromHash = read(hash)
  const fromSearch = read(search)
  const get = (name: string) => fromHash.get(name) ?? fromSearch.get(name)

  // Only an expired or used emailed link counts. Other errors (a cancelled
  // Google sign-in also says error=access_denied) aren't ours to handle.
  if (get('error_code') === 'otp_expired') {
    const type = get('type')
    return type && type !== 'recovery' ? null : 'expired'
  }
  if (get('error') || get('error_code')) return null
  return get('type') === 'recovery' ? 'recovery' : null
}
