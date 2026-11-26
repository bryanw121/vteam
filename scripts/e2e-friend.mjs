#!/usr/bin/env node
/**
 * Makes sure the integration suite's second account ("e2efriend") exists on beta and
 * can sign in. Its password is derived from E2E_PASSWORD (same as
 * e2e/integration/friend.ts) and is never printed.
 *   E2E_PASSWORD=… EXPO_PUBLIC_SUPABASE_URL=… EXPO_PUBLIC_SUPABASE_ANON_KEY=… node scripts/e2e-friend.mjs
 * Refuses to run against anything but the beta project.
 */
import { createHmac } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const BETA = 'https://uifolvbwtrbcmfrvelnl.supabase.co'
const url = process.env.EXPO_PUBLIC_SUPABASE_URL
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
const secret = process.env.E2E_PASSWORD
if (url !== BETA) { console.error(`Refusing: this only creates test accounts on beta (${BETA}).`); process.exit(1) }
if (!key || !secret) { console.error('Missing EXPO_PUBLIC_SUPABASE_ANON_KEY or E2E_PASSWORD.'); process.exit(1) }

const email = process.env.E2E_FRIEND_EMAIL || 'e2efriend@vteamvolleyball.com'
const password = `${createHmac('sha256', secret).update('vteam-e2e-friend-v1').digest('base64url').slice(0, 28)}Aa1!`
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

const first = await db.auth.signInWithPassword({ email, password })
if (!first.error) { console.log(`e2efriend: signs in (user ${first.data.user.id}).`); process.exit(0) }

const made = await db.auth.signUp({
  email, password,
  options: { data: { username: 'e2efriend', first_name: 'E2E', last_name: 'Friend', terms_version: '2026-10-27' } },
})
if (made.error) { console.error(`e2efriend: sign-up failed: ${made.error.message}`); process.exit(1) }
const again = await db.auth.signInWithPassword({ email, password })
if (again.error) {
  console.log(`e2efriend: created (user ${made.data.user?.id}), but it can't sign in yet: ${again.error.message}. If that says the email isn't confirmed, confirm it on beta.`)
  process.exit(0)
}
console.log(`e2efriend: created and signs in (user ${again.data.user.id}).`)
