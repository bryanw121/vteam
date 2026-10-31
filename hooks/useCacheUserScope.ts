import { useEffect, useRef } from 'react'
import { invalidate, removeQueries } from '../lib/query'
import { useSession } from '../contexts/session'
import { clearScrollMemory } from '../utils/scrollMemory'

/**
 * Cache prefixes whose rows depend on who is signed in (RSVP state, unread
 * counts, the viewer's own profile...). 'feed' is not here: `useMonthEvents`
 * resets it on a user change itself. 'tags' is the same for everyone.
 */
export const USER_SCOPED_PREFIXES = ['event', 'tournament', 'club', 'conversations', 'conversation', 'profile', 'settings'] as const

/**
 * Drop user-scoped cache entries whenever the signed-in user changes (sign in,
 * sign out, switch account), so the next user never sees the previous one's
 * copy. Screens still mounted (e.g. an event page under the login screen)
 * refetch for the new user. Mount once, at the root.
 */
export function useCacheUserScope(): void {
  const { userId, loading } = useSession()
  /** `undefined` until the session has been restored once. */
  const ownerRef = useRef<string | null | undefined>(undefined)
  useEffect(() => {
    // userId is null while the session restores; that is not "signed out".
    if (loading) return
    const previous = ownerRef.current
    ownerRef.current = userId
    if (previous === undefined || previous === userId) return
    USER_SCOPED_PREFIXES.forEach(p => removeQueries(p))
    USER_SCOPED_PREFIXES.forEach(p => invalidate(p))
    // Remembered scroll offsets belong to the previous user's screens too.
    clearScrollMemory()
  }, [userId, loading])
}
