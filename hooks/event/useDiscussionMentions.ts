import { useMemo } from 'react'
import type { EventCohostWithProfile, EventWithDetails, Profile } from '../../types'
import { mentionableUsers, mentionProfiles, usernameIds } from '../../utils/eventDetail'

/** Who can be @mentioned in the Discussion (attendees, co-hosts, host; never the viewer), and username → id for tappable mentions. */
export function useDiscussionMentions(
  attendees: readonly Profile[],
  cohosts: readonly EventCohostWithProfile[],
  event: EventWithDetails | null | undefined,
  userId: string | null,
) {
  const profiles = useMemo(
    () => mentionProfiles({ attendees, cohostProfiles: cohosts.map(c => c.profiles as Profile), host: (event?.profiles ?? null) as Profile | null }),
    [attendees, cohosts, event],
  )
  const users = useMemo(() => mentionableUsers(profiles, userId), [profiles, userId])
  const usernameToId = useMemo(() => usernameIds(profiles), [profiles])
  return { mentionableUsers: users, usernameToId }
}
