// Creates (or deletes) the one vteam event the Android app flows open, on the beta
// project, as the e2e account. Same naming as the Playwright fixtures
// (`[e2e <tag>] ...`, e2e/env.ts), so e2e/sweep.mjs cleans anything a crashed run leaves.
//
//   node e2e/android/fixture.mjs create   # prints EVENT_ID=<uuid> and EVENT_TITLE=<title>
//   node e2e/android/fixture.mjs delete
//
// Env: EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY, E2E_USERNAME, E2E_PASSWORD,
// E2E_RUN_TAG (CI: r<run id>-<attempt>).
import { createClient } from '@supabase/supabase-js'

const url = need('EXPO_PUBLIC_SUPABASE_URL')
const anon = need('EXPO_PUBLIC_SUPABASE_ANON_KEY')
const tag = process.env.E2E_RUN_TAG || `local${process.pid}`
const TITLE = `[e2e ${tag}] Android open play`
const STALE_HOURS = 3

function need(name) {
  const v = process.env[name]
  if (!v) { console.error(`Missing ${name}`); process.exit(1) }
  return v
}

async function signIn() {
  // The app's own username sign-in (clients can't resolve a username to an email).
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(`${url}/functions/v1/login-with-username`, {
        method: 'POST',
        headers: { apikey: anon, Authorization: `Bearer ${anon}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: need('E2E_USERNAME'), password: need('E2E_PASSWORD') }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok || !body?.access_token) throw new Error(`sign-in failed: ${res.status} ${body?.error ?? ''}`)
      const supabase = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
      const { data, error } = await supabase.auth.setSession({ access_token: body.access_token, refresh_token: body.refresh_token })
      if (error || !data.user) throw new Error(error?.message ?? 'no user')
      return { supabase, userId: data.user.id }
    } catch (e) {
      if (attempt >= 3) throw e
      await new Promise(r => setTimeout(r, 3000 * attempt))
    }
  }
}

async function cleanup(supabase, userId) {
  const own = await supabase.from('events').delete().eq('created_by', userId).eq('title', TITLE)
  if (own.error) throw new Error(own.error.message)
  const staleBefore = new Date(Date.now() - STALE_HOURS * 3600_000).toISOString()
  const stale = await supabase.from('events').delete().eq('created_by', userId)
    .like('title', '[e2e%Android%').lt('created_at', staleBefore)
  if (stale.error) throw new Error(stale.error.message)
}

const mode = process.argv[2]
const { supabase, userId } = await signIn()
await cleanup(supabase, userId)
if (mode === 'create') {
  const start = new Date()
  start.setDate(start.getDate() + 2)
  start.setHours(19, 0, 0, 0)
  const { data, error } = await supabase.from('events').insert({
    title: TITLE,
    description: 'Ephemeral Android e2e fixture: safe to ignore.',
    location: 'E2E Gym',
    event_date: start.toISOString(),
    duration_minutes: 120,
    max_attendees: null,
    created_by: userId,
  }).select('id').single()
  if (error || !data) throw new Error(`create failed: ${error?.message}`)
  console.log(`EVENT_ID=${data.id}`)
  console.log(`EVENT_TITLE=${TITLE}`)
} else if (mode !== 'delete') {
  console.error('usage: fixture.mjs create|delete')
  process.exit(1)
}
