import { supabase } from '../../lib/supabase'
import { getQueryData, queryKey, setQueryData, useMutation } from '../../lib/query'
import { useSession } from '../../contexts/session'
import { toast } from '../../lib/toast'
import { track } from '../../lib/analytics'
import { ANALYTICS_EVENTS } from '../../constants/analytics'
import { clubDetailKey } from '../useClub'
import { myProfileKey } from '../useMyProfile'
import { withGameAlerts, withListMembership, withMembership } from '../../utils/clubForm'
import type { ClubDetailData, ClubListItem, ClubMemberProfile, ClubMembershipAction, ClubMembershipOptions, Profile } from '../../types'

/** Write the viewer's own membership row. Throws on a Supabase error. */
export async function writeMembership(clubId: string, userId: string, action: ClubMembershipAction): Promise<void> {
  const { error } =
    action === 'join'
      ? await supabase.from('club_members').insert({ club_id: clubId, user_id: userId, role: 'member' })
      : await supabase.from('club_members').delete().eq('club_id', clubId).eq('user_id', userId)
  if (error) throw error
}

function myMemberProfile(userId: string): ClubMemberProfile | null {
  const me = getQueryData<Profile>(myProfileKey(userId))
  return me ? { id: me.id, username: me.username, first_name: me.first_name, last_name: me.last_name, avatar_url: me.avatar_url } : null
}

/**
 * Join or leave a club (#305): the one path for the club page and the Clubs list. Flips the
 * club page's cached members and, when given, the list row at once, rolls both back if the
 * write fails, and refetches the club and the Clubs lists after.
 */
export function useClubMembership(clubId: string, { listKey, listClub }: ClubMembershipOptions = {}) {
  const { userId } = useSession()
  return useMutation<ClubMembershipAction, void>(
    async action => {
      if (!userId) throw new Error('Not signed in')
      await writeMembership(clubId, userId, action)
    },
    {
      onMutate: action => {
        if (!userId) return
        const now = new Date().toISOString()
        const undo: (() => void)[] = []
        const key = clubDetailKey(clubId, userId)
        const detail = getQueryData<ClubDetailData>(key)
        if (detail?.club) {
          setQueryData<ClubDetailData>(key, withMembership(detail, userId, action, myMemberProfile(userId), now))
          undo.push(() => setQueryData<ClubDetailData>(key, detail))
        }
        if (listKey && listClub) {
          const replace = (row: ClubListItem) => setQueryData<ClubListItem[]>(listKey, prev => (prev ?? []).map(c => (c.id === row.id ? row : c)))
          replace(withListMembership(listClub, userId, action, now))
          undo.push(() => replace(listClub))
        }
        return () => undo.forEach(fn => fn())
      },
      onError: (error, action) => { toast.error(action === 'join' ? "Couldn't join the club" : "Couldn't leave the club", error) },
      // Membership gates the updates feed and the Clubs tab's "Joined" list.
      invalidates: [queryKey('club', clubId), 'clubs'],
    },
  )
}

/** New game alerts for one club (#170): the viewer's own membership row, through the RPC. */
export function useClubGameAlerts(clubId: string, clubName: string | undefined) {
  const { userId } = useSession()
  const name = clubName ?? 'this club'
  return useMutation<boolean, void>(
    async on => {
      const { error } = await supabase.rpc('set_club_game_alerts', { p_club_id: clubId, p_on: on })
      if (error) throw error
    },
    {
      onMutate: on => {
        const key = clubDetailKey(clubId, userId)
        const before = getQueryData<ClubDetailData>(key)
        if (!before?.club || !userId) return
        setQueryData<ClubDetailData>(key, withGameAlerts(before, userId, on))
        return () => setQueryData<ClubDetailData>(key, before)
      },
      onSuccess: (_, on) => {
        track(ANALYTICS_EVENTS.gameAlertsChanged, { field: 'club' })
        toast.show({ message: on ? `You'll hear about new games from ${name}` : `New game alerts from ${name} are off`, variant: 'success' })
      },
      onError: error => { toast.error("Couldn't change game alerts", error) },
    },
  )
}
