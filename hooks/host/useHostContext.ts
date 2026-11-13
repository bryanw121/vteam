/**
 * What the host form reads besides the event itself (#188 part 2): tags, the
 * clubs the host owns, their recent venues, and saved templates (only once the
 * picker is open). Moved as is from `app/(app)/host.tsx`.
 */
import { useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { queryKey, useQuery } from '../../lib/query'
import { STALE } from '../../constants'
import { useTags } from '../useTags'
import { recentVenuesFrom } from '../../utils/hostForm'
import type { LocationValue, OwnedClubOption, Tag, UserEventTemplate } from '../../types'

const EMPTY_TAGS: Tag[] = []
const EMPTY_CLUBS: OwnedClubOption[] = []
const EMPTY_VENUES: LocationValue[] = []
const TEMPLATE_SELECT = 'id, user_id, name, title, description, location, max_attendees, created_at, bring_items'

export function useHostContext(userId: string | null, templatesOpen: boolean) {
  const tagsQuery = useTags()

  // Clubs the host owns can be attached to the event
  const ownedClubsQuery = useQuery<OwnedClubOption[]>(
    userId ? queryKey('clubs', 'owned', userId) : null,
    async () => {
      const { data, error } = await supabase
        .from('club_members')
        .select('club_id, clubs (id, name)')
        .eq('user_id', userId as string)
        .eq('role', 'owner')
      if (error) throw error
      return ((data ?? []) as { clubs: OwnedClubOption | null }[])
        .map(m => m.clubs)
        .filter((c): c is OwnedClubOption => !!c)
    },
    { staleMs: STALE.feed, enabled: !!userId },
  )

  // Venues from the host's past events, offered as quick picks in the location field
  const venuesQuery = useQuery<LocationValue[]>(
    userId ? queryKey('host', 'venues', userId) : null,
    async () => {
      const { data, error } = await supabase
        .from('events')
        .select('location, latitude, longitude')
        .eq('created_by', userId as string)
        .not('location', 'is', null)
        .order('event_date', { ascending: false })
        .limit(20)
      if (error) throw error
      return recentVenuesFrom(data ?? [])
    },
    { staleMs: STALE.feed, enabled: !!userId },
  )

  // Saved templates (only fetched once the picker is opened)
  const templatesQuery = useQuery<UserEventTemplate[]>(
    userId ? queryKey('templates', userId) : null,
    async () => {
      const { data, error } = await supabase
        .from('user_event_templates')
        .select(TEMPLATE_SELECT)
        .eq('user_id', userId as string)
        .order('created_at', { ascending: false })
      if (error) throw error
      // TEMPORARY double cast: bring_items isn't in types/database.ts until it is regenerated from live after merge (#256).
      return (data ?? []) as unknown as UserEventTemplate[]
    },
    { staleMs: STALE.feed, enabled: !!userId && templatesOpen },
  )

  /** Pull to refresh: the server's copy of everything the form reads. */
  const refetchAll = useCallback(() => Promise.all([
    tagsQuery.refetch({ force: true }),
    ownedClubsQuery.refetch({ force: true }),
    venuesQuery.refetch({ force: true }),
    templatesOpen ? templatesQuery.refetch({ force: true }) : undefined,
  ]), [tagsQuery, ownedClubsQuery, venuesQuery, templatesQuery, templatesOpen])

  return {
    tags: tagsQuery.data ?? EMPTY_TAGS,
    tagsLoading: tagsQuery.isLoading,
    ownedClubs: ownedClubsQuery.data ?? EMPTY_CLUBS,
    recentVenues: venuesQuery.data ?? EMPTY_VENUES,
    templatesQuery,
    refetchAll,
  }
}
