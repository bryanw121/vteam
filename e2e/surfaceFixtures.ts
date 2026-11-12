/**
 * Ephemeral club + tournament for the surfaces e2e (#12). Beta has no clubs or
 * tournaments of its own, so beforeAll creates one club (the e2e account owns
 * it) with one published tournament, and afterAll deletes the club: the
 * tournament, the club chat and the owner membership cascade with it. Names
 * carry this run's `[e2e <tag>]` prefix, so parallel runs never touch each other.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { E2E_TITLE_PREFIX, STALE_FIXTURE_HOURS } from './env'
import { signInE2eClient } from './eventsFixtures'
import { withNetworkRetry } from './retry'

export const CLUB_NAME = `${E2E_TITLE_PREFIX} Club`
export const TOURNAMENT_TITLE = `${E2E_TITLE_PREFIX} Cup`

export type SurfaceFixtures = { clubId: string; tournamentId: string }

async function deleteClubs(supabase: SupabaseClient, userId: string) {
  const own = await supabase.from('clubs').delete().eq('created_by', userId).like('name', `${E2E_TITLE_PREFIX}%`)
  if (own.error) throw new Error(`Failed to clean e2e clubs: ${own.error.message}`)
  const staleBefore = new Date(Date.now() - STALE_FIXTURE_HOURS * 3600_000).toISOString()
  const stale = await supabase.from('clubs').delete().eq('created_by', userId).like('name', '[e2e%').lt('created_at', staleBefore)
  if (stale.error) throw new Error(`Failed to clean stale e2e clubs: ${stale.error.message}`)
}

export async function seedSurfaceFixtures(): Promise<SurfaceFixtures> {
  const { supabase, userId } = await signInE2eClient()
  try {
    return await withNetworkRetry(async () => {
      await deleteClubs(supabase, userId)
      const city = await supabase.from('major_cities').select('id').eq('city_name', 'Austin').limit(1).single()
      if (city.error) throw new Error(`Failed to load Austin: ${city.error.message}`)

      const club = await supabase
        .from('clubs')
        .insert({ name: CLUB_NAME, description: 'Ephemeral e2e fixture — safe to ignore.', created_by: userId, major_city_id: city.data.id, membership_type: 'open' })
        .select('id')
        .single()
      if (club.error) throw new Error(`Failed to insert e2e club: ${club.error.message}`)

      const start = new Date(Date.now() + 7 * 86400_000)
      start.setHours(10, 0, 0, 0)
      const tournament = await supabase
        .from('tournaments')
        .insert({
          club_id: club.data.id, created_by: userId, title: TOURNAMENT_TITLE, location: 'E2E Gym',
          start_date: start.toISOString(), status: 'published', published_at: new Date().toISOString(),
          format: 'pool_play', max_teams: 8,
        })
        .select('id')
        .single()
      if (tournament.error) throw new Error(`Failed to insert e2e tournament: ${tournament.error.message}`)
      return { clubId: club.data.id, tournamentId: tournament.data.id }
    }, { label: 'seed club + tournament' })
  } finally {
    await supabase.auth.signOut({ scope: 'local' })
  }
}

export async function cleanupSurfaceFixtures(): Promise<void> {
  const { supabase, userId } = await signInE2eClient()
  try {
    await withNetworkRetry(() => deleteClubs(supabase, userId), { label: 'clean club fixtures' })
  } finally {
    await supabase.auth.signOut({ scope: 'local' })
  }
}
