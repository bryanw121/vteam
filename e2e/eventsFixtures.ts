/**
 * Ephemeral event fixtures for events e2e.
 * Created in beforeAll / removed in afterAll so the shared DB doesn't need
 * permanent pilot-visible seed events.
 */
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

/** A Node-side Supabase client signed in as the e2e account (retries network flakes). */
export function signInE2eClient(): Promise<{ supabase: SupabaseClient; userId: string }> {
  return withNetworkRetry(signInOnce, { label: 'e2e sign-in' })
}

async function signInOnce(): Promise<{ supabase: SupabaseClient; userId: string }> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  const { username, password } = e2eCredentials()
  const { data: email, error: rpcError } = await supabase.rpc('get_email_by_username', {
    p_username: username,
  })
  if (rpcError || !email) {
    throw new Error(`Could not resolve email for ${username}: ${rpcError?.message ?? 'not found'}`)
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: email as string,
    password,
  })
  if (error || !data.user) {
    throw new Error(`E2E sign-in failed: ${error?.message ?? 'no user'}`)
  }

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
