/**
 * Fixtures for the tournament flow e2e (e2e/tournament-flow.spec.ts).
 *
 * Hosting a tournament needs a club, and beta has none, so beforeAll creates a
 * run-tagged club owned by the e2e account and afterAll deletes it. Deleting
 * the club cascades to its tournaments (and their teams, matches and chat), so
 * nothing the run created survives. Only this club is deleted by name, plus
 * stale e2e clubs from crashed runs (older than STALE_FIXTURE_HOURS), so other
 * specs' and other runs' clubs are left alone.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { e2eCredentials, E2E_RUN_TAG, E2E_TITLE_PREFIX, STALE_FIXTURE_HOURS, SUPABASE_ANON_KEY, SUPABASE_URL } from './env'

/**
 * Not under E2E_TITLE_PREFIX on purpose: surfaceFixtures (another shard of the
 * same run, possibly at the same time) deletes every club named with that
 * prefix. "[e2e-flow <tag>]" still starts with "[e2e", so the stale sweep
 * below (and theirs) removes it after a crashed run.
 */
export const CLUB_NAME = `[e2e-flow ${E2E_RUN_TAG}] Tournament Club`
export const TOURNAMENT_TITLE = `${E2E_TITLE_PREFIX} Cup`
export const MY_TEAM = `${E2E_TITLE_PREFIX} Diggers`
export const RIVAL_TEAM = `${E2E_TITLE_PREFIX} Rivals`

async function signIn(): Promise<{ supabase: SupabaseClient; userId: string }> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  const { username, password } = e2eCredentials()
  const { data: email, error: rpcError } = await supabase.rpc('get_email_by_username', { p_username: username })
  if (rpcError || !email) throw new Error(`Could not resolve email for ${username}: ${rpcError?.message ?? 'not found'}`)
  const { data, error } = await supabase.auth.signInWithPassword({ email: email as string, password })
  if (error || !data.user) throw new Error(`E2E sign-in failed: ${error?.message ?? 'no user'}`)
  return { supabase, userId: data.user.id }
}

/** Local sign-out only: the default global scope would revoke the browser's stored session too. */
const signOut = (supabase: SupabaseClient) => supabase.auth.signOut({ scope: 'local' })

async function deleteClubs(supabase: SupabaseClient, userId: string): Promise<void> {
  const own = await supabase.from('clubs').delete().eq('created_by', userId).eq('name', CLUB_NAME)
  if (own.error) throw new Error(`Failed to clean e2e clubs: ${own.error.message}`)
  const staleBefore = new Date(Date.now() - STALE_FIXTURE_HOURS * 3600_000).toISOString()
  const stale = await supabase.from('clubs').delete().eq('created_by', userId).like('name', '[e2e%').lt('created_at', staleBefore)
  if (stale.error) throw new Error(`Failed to clean stale e2e clubs: ${stale.error.message}`)
}

export async function seedTournamentClub(): Promise<void> {
  const { supabase, userId } = await signIn()
  await deleteClubs(supabase, userId)
  const { data: city, error: cityError } = await supabase.from('major_cities').select('id').limit(1).single()
  if (cityError || !city) throw new Error(`No major city to attach the e2e club to: ${cityError?.message ?? 'none'}`)
  // The owner membership row comes from the on_club_created trigger.
  const { error } = await supabase.from('clubs').insert({
    name: CLUB_NAME, created_by: userId, major_city_id: city.id, membership_type: 'open',
    description: 'Ephemeral e2e fixture: safe to ignore.',
  })
  if (error) throw new Error(`Failed to create the e2e club: ${error.message}`)
  await signOut(supabase)
}

/**
 * A second registered team, created by the organizer (RLS lets the organizer
 * manage every team in their tournament). One account can only captain one
 * team, and a bracket needs two.
 */
export async function addRivalTeam(tournamentId: string): Promise<void> {
  const { supabase } = await signIn()
  // Idempotent: a retried test must not add a third team.
  const { data: existing, error: readError } = await supabase.from('tournament_teams').select('id')
    .eq('tournament_id', tournamentId).eq('name', RIVAL_TEAM)
  if (readError) throw new Error(`Could not read teams: ${readError.message}`)
  if (!existing || existing.length === 0) {
    const { error } = await supabase.from('tournament_teams').insert({
      tournament_id: tournamentId, name: RIVAL_TEAM, status: 'registered', is_approved: true,
    })
    if (error) throw new Error(`Failed to add the rival team: ${error.message}`)
  }
  await signOut(supabase)
}

export async function cleanupTournamentClub(): Promise<void> {
  const { supabase, userId } = await signIn()
  await deleteClubs(supabase, userId)
  await signOut(supabase)
}
