/**
 * Ephemeral event fixtures for events e2e.
 * Created in beforeAll / removed in afterAll so the shared DB doesn't need
 * permanent pilot-visible seed events.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { e2eCredentials, E2E_TITLE_PREFIX, STALE_FIXTURE_HOURS, SUPABASE_ANON_KEY, SUPABASE_URL } from './env'
import { withNetworkRetry } from './retry'

/** This run's title prefix, e.g. `[e2e r123-1]`; see E2E_RUN_TAG in ./env. */
export const TITLE_PREFIX = E2E_TITLE_PREFIX
export const OPEN_PLAY_EVENT = `${TITLE_PREFIX} Open Play`
export const TOURNAMENT_EVENT = `${TITLE_PREFIX} Tournament`

const OPEN_PLAY_TAG = 'Open Play'
const TOURNAMENT_TAG = 'Tournament'

function daysFromNow(days: number, hour = 19): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  d.setHours(hour, 0, 0, 0)
  d.setSeconds(0, 0)
  return d.toISOString()
}

/**
 * A Node-side Supabase client signed in as the e2e account (retries network flakes).
 *
 * login-with-username allows 30 attempts per username per 15 minutes (#102),
 * and several PRs' CI runs share the account, so this signs in as rarely as it
 * can, reusing a session in this order:
 *  1. The browser session auth.setup.ts saved for this shard.
 *  2. A session this process signed in for itself (one sign-in per process).
 *  3. Else a new sign-in.
 *
 * Sessions are shared, so the clients handed out never touch them on the
 * server: they never refresh a token (a session is reused only while its
 * access token has TOKEN_MIN_LIFE_S left), and their signOut() only drops the
 * client's in-memory session. supabase-js's own signOut, even with
 * scope 'local', ends the session on the server, which would sign out the
 * browser specs and every other client sharing it.
 */
export async function signInE2eClient(): Promise<{ supabase: SupabaseClient; userId: string }> {
  for (const tokens of [readSavedBrowserSession(), cachedTokens ? await cachedTokens.catch(() => null) : null]) {
    if (!tokens || !hasLifeLeft(tokens)) continue
    const reused = await clientFromTokens(tokens).catch(() => null)
    if (reused) return reused
  }
  cachedTokens = withNetworkRetry(fetchTokens, { label: 'e2e sign-in' })
  cachedTokens.catch(() => { cachedTokens = null })
  return clientFromTokens(await cachedTokens)
}

type E2eTokens = { access_token: string; refresh_token: string; expires_at: number }
let cachedTokens: Promise<E2eTokens> | null = null

/** auth.setup.ts writes the signed-in browser storage here (playwright.config.ts reads the same path). */
const SAVED_BROWSER_SESSION = path.join(process.cwd(), 'playwright/.auth/user.json')
/** Reuse a session only while its access token has at least this long left, so no spec outlives it. */
const TOKEN_MIN_LIFE_S = 15 * 60

const hasLifeLeft = (t: E2eTokens) => t.expires_at - Date.now() / 1000 > TOKEN_MIN_LIFE_S

/** The session auth.setup.ts saved for this shard, or null (guest project, or setup did not run). */
function readSavedBrowserSession(): E2eTokens | null {
  try {
    const state = JSON.parse(readFileSync(SAVED_BROWSER_SESSION, 'utf8')) as {
      origins?: { localStorage?: { name: string; value: string }[] }[]
    }
    for (const origin of state.origins ?? []) {
      for (const entry of origin.localStorage ?? []) {
        if (!/^sb-.*-auth-token$/.test(entry.name)) continue
        const s = JSON.parse(entry.value) as Partial<E2eTokens>
        if (s.access_token && s.refresh_token && typeof s.expires_at === 'number') {
          return { access_token: s.access_token, refresh_token: s.refresh_token, expires_at: s.expires_at }
        }
      }
    }
  } catch { /* no saved session */ }
  return null
}

async function fetchTokens(): Promise<E2eTokens> {
  const { username, password } = e2eCredentials()
  // Same server-side username sign-in the app uses: clients cannot resolve a
  // username to an email (get_email_by_username is service-role only).
  const res = await fetch(`${SUPABASE_URL}/functions/v1/login-with-username`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  const body = await res.json().catch(() => null) as { access_token?: string; refresh_token?: string; expires_at?: number; expires_in?: number; error?: string } | null
  if (!res.ok || !body?.access_token || !body.refresh_token) {
    throw new Error(`E2E sign-in failed for ${username}: ${res.status} ${body?.error ?? 'no session'}`)
  }
  const expiresAt = body.expires_at ?? Math.floor(Date.now() / 1000) + (body.expires_in ?? 3600)
  return { access_token: body.access_token, refresh_token: body.refresh_token, expires_at: expiresAt }
}

async function clientFromTokens(tokens: E2eTokens): Promise<{ supabase: SupabaseClient; userId: string }> {
  // In memory only, never refreshed: the session belongs to more than this client.
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  // With an access token that has life left, setSession only verifies it (getUser); it does not refresh.
  const { data, error } = await supabase.auth.setSession({ access_token: tokens.access_token, refresh_token: tokens.refresh_token })
  if (error || !data.user) {
    throw new Error(`E2E sign-in failed: ${error?.message ?? 'no user'}`)
  }
  // Specs sign their client out when done; keep that from ending the shared session on the server.
  supabase.auth.signOut = (async () => ({ error: null })) as typeof supabase.auth.signOut
  return { supabase, userId: data.user.id }
}

/**
 * Delete this run's fixtures, plus any e2e fixtures abandoned by a crashed run
 * long enough ago that no live run can still be using them. Never touches
 * another in-flight run's rows (those carry a different tag).
 */
async function deleteE2eEvents(supabase: SupabaseClient, userId: string) {
  const own = await supabase
    .from('events')
    .delete()
    .eq('created_by', userId)
    .like('title', `${TITLE_PREFIX}%`)
  if (own.error) throw new Error(`Failed to clean e2e events: ${own.error.message}`)
  const staleBefore = new Date(Date.now() - STALE_FIXTURE_HOURS * 3600_000).toISOString()
  const stale = await supabase
    .from('events')
    .delete()
    .eq('created_by', userId)
    .like('title', '[e2e%')
    .lt('created_at', staleBefore)
  if (stale.error) throw new Error(`Failed to clean stale e2e events: ${stale.error.message}`)
}

/**
 * Read a fixture's stored venue straight from the DB. The UI renders the venue
 * name but never the coordinates, so this is the only way to prove that the
 * lat/lng returned by a Places `details` lookup actually reached the row.
 */
export async function readEventLocation(title: string): Promise<{
  location: string | null
  latitude: number | null
  longitude: number | null
}> {
  const { supabase, userId } = await signInE2eClient()
  const { data, error } = await supabase
    .from('events')
    .select('location, latitude, longitude')
    .eq('created_by', userId)
    .eq('title', title)
    .single()
  await supabase.auth.signOut({ scope: 'local' })
  if (error || !data) throw new Error(`Could not read location for "${title}": ${error?.message ?? 'not found'}`)
  return {
    location: data.location ?? null,
    latitude: data.latitude ?? null,
    longitude: data.longitude ?? null,
  }
}

export async function seedEventFixtures(): Promise<void> {
  const { supabase, userId } = await signInE2eClient()

  // Scrub leftovers from a prior crashed run, then create a fresh pair.
  await deleteE2eEvents(supabase, userId)

  const { data: tags, error: tagsError } = await supabase
    .from('tags')
    .select('id, name')
    .in('name', [OPEN_PLAY_TAG, TOURNAMENT_TAG])
  if (tagsError) throw new Error(`Failed to load tags: ${tagsError.message}`)

  const openPlayTagId = tags?.find(t => t.name === OPEN_PLAY_TAG)?.id
  const tournamentTagId = tags?.find(t => t.name === TOURNAMENT_TAG)?.id
  if (!openPlayTagId || !tournamentTagId) {
    throw new Error('Missing Open Play / Tournament tags in database')
  }

  const rows = [
    {
      title: OPEN_PLAY_EVENT,
      description: 'Ephemeral e2e fixture — safe to ignore.',
      location: 'E2E Gym',
      event_date: daysFromNow(2),
      duration_minutes: 120,
      max_attendees: null,
      created_by: userId,
    },
    {
      title: TOURNAMENT_EVENT,
      description: 'Ephemeral e2e fixture — safe to ignore.',
      location: 'E2E Gym',
      event_date: daysFromNow(3),
      duration_minutes: 120,
      max_attendees: 24,
      created_by: userId,
    },
  ]

  const { data: inserted, error: insertError } = await supabase.from('events').insert(rows).select('id, title')
  if (insertError || !inserted) {
    throw new Error(`Failed to insert e2e events: ${insertError?.message ?? 'no rows'}`)
  }

  const tagRows = inserted.flatMap(event => {
    const tagId = event.title === OPEN_PLAY_EVENT ? openPlayTagId : tournamentTagId
    return [{ event_id: event.id, tag_id: tagId }]
  })
  const { error: tagInsertError } = await supabase.from('event_tags').insert(tagRows)
  if (tagInsertError) {
    await deleteE2eEvents(supabase, userId)
    throw new Error(`Failed to tag e2e events: ${tagInsertError.message}`)
  }

  // The default global scope revokes every session for this user, including
  // the browser state shared by the Playwright projects.
  await supabase.auth.signOut({ scope: 'local' })
}

export async function cleanupEventFixtures(): Promise<void> {
  const { supabase, userId } = await signInE2eClient()
  await deleteE2eEvents(supabase, userId)
  await supabase.auth.signOut({ scope: 'local' })
}
