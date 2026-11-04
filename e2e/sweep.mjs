/**
 * Delete leftover e2e events.
 *
 * The events suite creates `[e2e] ...` events in beforeAll and deletes them in
 * afterAll, but a crashed or cancelled run skips afterAll. CI runs this as a
 * final `if: always()` step; run it locally with `npm run e2e:sweep`.
 *
 * Signs in as the e2e account (E2E_USERNAME / E2E_PASSWORD) and deletes events
 * THAT ACCOUNT hosts that belong to this run (title starts with "[e2e <tag>]",
 * tag from E2E_RUN_TAG) or are stale e2e fixtures (title starts with "[e2e" and
 * older than STALE_HOURS). Other in-flight runs' fixtures are left alone, so
 * parallel CI runs can't sweep each other. RLS means it cannot touch anyone
 * else's events. Without E2E_RUN_TAG (local) it removes every "[e2e" event.
 * Keep the tag shape in sync with e2e/env.ts. Exits non-zero on failure.
 *
 * Plain Node (no TypeScript) so it runs on Node 20 in CI without a loader.
 */
import { createClient } from '@supabase/supabase-js'

try {
  // Node >= 20.12. Does not override variables already set (CI sets them).
  process.loadEnvFile('.env')
} catch {
  // No .env file: rely on the process environment.
}

const RUN_TAG = process.env.E2E_RUN_TAG
const STALE_HOURS = 3

function required(name) {
  const value = process.env[name]
  if (!value) {
    console.error(`e2e:sweep: missing ${name} (set it in .env or the environment; see .env.example)`)
    process.exit(1)
  }
  return value
}

const url = required('EXPO_PUBLIC_SUPABASE_URL')
const anonKey = required('EXPO_PUBLIC_SUPABASE_ANON_KEY')
const username = required('E2E_USERNAME')
const password = required('E2E_PASSWORD')

const supabase = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })

async function main() {
  const { data: email, error: rpcError } = await supabase.rpc('get_email_by_username', { p_username: username })
  if (rpcError || !email) throw new Error(`could not resolve the e2e account email: ${rpcError?.message ?? 'not found'}`)

  const { data: auth, error: signInError } = await supabase.auth.signInWithPassword({ email, password })
  if (signInError || !auth.user) throw new Error(`sign-in failed: ${signInError?.message ?? 'no user'}`)

  try {
    let removed = 0
    const sweep = async (label, build) => {
      const { data, error } = await build(supabase.from('events').delete().eq('created_by', auth.user.id)).select('id')
      if (error) throw new Error(`delete (${label}) failed: ${error.message}`)
      removed += data?.length ?? 0
    }
    if (RUN_TAG) {
      await sweep('this run', q => q.like('title', `[e2e ${RUN_TAG}]%`))
      // e2e/weather.spec.ts keeps its own prefix so the events suite's beforeAll scrub can't delete them mid-run.
      await sweep('this run (weather)', q => q.like('title', `[e2e-wx ${RUN_TAG}]%`))
      const staleBefore = new Date(Date.now() - STALE_HOURS * 3600_000).toISOString()
      await sweep('stale', q => q.like('title', '[e2e%').lt('created_at', staleBefore))
    } else {
      await sweep('all', q => q.like('title', '[e2e%'))
    }
    console.log(`e2e:sweep: removed ${removed} leftover e2e event(s)`)
  } finally {
    await supabase.auth.signOut({ scope: 'local' })
  }
}

main().catch((e) => {
  console.error(`e2e:sweep: ${e instanceof Error ? e.message : e}`)
  process.exit(1)
})
