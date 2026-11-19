import { supabase } from '../../lib/supabase'
import { queryKey, useQuery } from '../../lib/query'
import { STALE } from '../../constants/cache'
import { profileDisplayName } from '../../utils'
import type { MentionUser } from '../../types'

const EMPTY: MentionUser[] = []

/** Cache key of a club's @mention candidates for one viewer (under `club`, so club changes invalidate it). */
export function clubMentionablesKey(clubId: string, viewerId: string | null): string {
  return queryKey('club', clubId, 'mentionables', viewerId)
}

/**
 * Who can be @mentioned in a club chat (#318): the club's members but the viewer.
 * Cached, so reopening a club chat shows suggestions at once (it used to read
 * `club_members` in an effect on every open). `null` club = not a club chat.
 */
export function useClubMentionables(clubId: string | null | undefined, viewerId: string | null): MentionUser[] {
  const { data } = useQuery<MentionUser[]>(
    clubId ? clubMentionablesKey(clubId, viewerId) : null,
    async () => {
      const { data: rows, error } = await supabase
        .from('club_members')
        .select('profiles!club_members_user_id_fkey(id, username, first_name, last_name)')
        .eq('club_id', clubId as string)
        .neq('user_id', viewerId ?? '')
      if (error) throw error
      type Row = { profiles: { id: string; username: string; first_name: string | null; last_name: string | null } | null }
      return ((rows ?? []) as unknown as Row[]).flatMap(row => {
        const p = row.profiles
        return p ? [{ id: p.id, username: p.username, displayName: profileDisplayName(p) }] : []
      })
    },
    { staleMs: STALE.detail, enabled: !!clubId },
  )
  return data ?? EMPTY
}
