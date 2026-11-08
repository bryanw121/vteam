import { supabase } from '../lib/supabase'
import { prefetchQuery, queryKey, useQuery } from '../lib/query'
import { intentPrefetchProps } from '../lib/prefetchIntent'
import { STALE } from '../constants/cache'
import { USER_BADGE_SELECT } from '../constants/selects'
import { normalizeProfileRow, PROFILE_BRIEF_SELECT } from './useMyProfile'
import { resolveProfileAvatarUriWithError } from '../utils'
import type { Profile, UserBadge, UserProfileData } from '../types'

export const userProfileKey = (id: string | null | undefined) => queryKey('user', id)

/**
 * Another player's public profile (#185): the row, cheers received and the
 * badges they show, in parallel. Resolves to `null` when there is no such
 * profile; any other failure throws, so the screen can tell "not found" from
 * "couldn't load" and offer Retry.
 */
export async function fetchUserProfile(id: string): Promise<UserProfileData | null> {
  const [profileRes, cheersRes, badgesRes] = await Promise.all([
    supabase.from('profiles').select(PROFILE_BRIEF_SELECT).eq('id', id).maybeSingle(),
    supabase.from('cheers').select('id', { count: 'exact', head: true }).eq('receiver_id', id),
    supabase.from('user_badges')
      .select(USER_BADGE_SELECT)
      .eq('user_id', id)
      .not('display_order', 'is', null)
      .order('display_order', { ascending: true }),
  ])
  if (profileRes.error) throw profileRes.error
  if (!profileRes.data) return null
  if (cheersRes.error) throw cheersRes.error
  if (badgesRes.error) throw badgesRes.error
  const profile = normalizeProfileRow(profileRes.data as Partial<Profile>)
  const { uri } = await resolveProfileAvatarUriWithError(profile.avatar_url)
  return {
    profile,
    avatarUri: uri,
    totalCheers: cheersRes.count ?? 0,
    displayBadges: (badgesRes.data ?? []) as UserBadge[],
  }
}

/** Cached per player: going back to a profile, or opening it twice, paints at once. */
export function useUserProfile(id: string | null | undefined) {
  return useQuery(userProfileKey(id), () => fetchUserProfile(id as string), {
    staleMs: STALE.profile,
    enabled: !!id,
  })
}

/** Start loading a profile before navigating to it (no-op when fresh). */
export function prefetchUserProfile(id: string): void {
  void prefetchQuery(userProfileKey(id), () => fetchUserProfile(id), { staleMs: STALE.profile })
}

/** Props for a touchable that opens a profile: prefetch on press intent / hover (lib/prefetchIntent). */
export function profilePrefetchProps(id: string): object {
  return intentPrefetchProps(() => prefetchUserProfile(id))
}
