/**
 * A second signed-in person for the integration suite ("e2efriend" on beta), for the
 * flows that need two: accepting an invite or a friend request, approving a join
 * request, the waitlist moving up.
 *
 * Nobody types or stores its password: it is derived inside the run from the
 * existing E2E_PASSWORD secret, so it is never in the repository, a log or a chat.
 * `node scripts/e2e-friend.mjs` (a step of every Integration run) signs it in, or
 * creates it on beta the first time.
 */
import { createHmac } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { SUPABASE_ANON_KEY, SUPABASE_URL, e2eCredentials } from '../env'
import type { Me } from './helpers'

export const FRIEND_USERNAME = 'e2efriend'
export const FRIEND_EMAIL = process.env.E2E_FRIEND_EMAIL || 'e2efriend@vteamvolleyball.com'

/** The same derivation as scripts/e2e-friend.mjs: keep the two in step. */
export function friendPassword(): string {
  const mac = createHmac('sha256', e2eCredentials().password).update('vteam-e2e-friend-v1').digest('base64url')
  return `${mac.slice(0, 28)}Aa1!`
}

/** Signed in as e2efriend, or null when the account doesn't exist yet (its tests then skip). */
export async function signInFriend(): Promise<Me | null> {
  const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await db.auth.signInWithPassword({ email: FRIEND_EMAIL, password: friendPassword() })
  if (error || !data.user) return null
  return { db, id: data.user.id }
}
