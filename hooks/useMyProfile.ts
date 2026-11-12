import { useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { Sentry } from '../lib/sentry'
import { getQueryData, prefetchQuery, queryKey, setQueryData, useMutation, useQuery } from '../lib/query'
import type { QueryResult } from '../lib/query'
import { STALE } from '../constants/cache'
import { useSession } from '../contexts/session'
import { normalizeVolleyballPositions, normalizeVolleyballSkillLevel } from '../utils'
import { fetchSettings, userSettingsKey } from './useUserSettings'
import { countCheers } from '../utils/cheers'
import type { CheersReceived, MyProfile, Profile, ProfileBrief, ProfilePatch, UserSettings } from '../types'

/**
 * The columns every screen needs from a profile (own or someone else's): the
 * public ones. Never includes `is_admin` or `notification_prefs`. Phase C moves
 * this next to the other select fragments in `constants/selects.ts`.
 */
export const PROFILE_BRIEF_SELECT =
  'id, username, first_name, last_name, avatar_url, position, skill_level, created_at, selected_border, selected_card_bg, bio'

/**
 * The viewer's private notification switches live in `user_settings`
 * (owner-only RLS), not on the `profiles` row every visitor can read. They are
 * read through `useUserSettings`' query (#224), so opening Profile doesn't
 * read that row twice: this joins its request or reuses its fresh result.
 */
async function readMyNotificationPrefs(userId: string): Promise<Profile['notification_prefs']> {
  const key = userSettingsKey(userId)
  await prefetchQuery(key, () => fetchSettings(userId), { staleMs: STALE.profile })
  const settings = getQueryData<UserSettings | null>(key)
  // A failed shared read leaves nothing usable: read it here so the error
  // surfaces (showing default switches could save over the real ones).
  if (settings === undefined) return (await fetchSettings(userId))?.notification_prefs ?? null
  return settings?.notification_prefs ?? null
}

/** Cache key of the signed-in user's own profile. */
export function myProfileKey(userId: string): string {
  return queryKey('profile', 'me', userId)
}

/**
 * Cache key of a user's `ProfileBrief` (the `PROFILE_BRIEF` columns): chat
 * sender profiles and the event page's viewer share it.
 */
export function profileBriefKey(userId: string): string {
  return queryKey('profile', userId, 'brief')
}

export function toProfileBrief(p: ProfileBrief): ProfileBrief {
  return {
    id: p.id,
    username: p.username,
    first_name: p.first_name ?? null,
    last_name: p.last_name ?? null,
    avatar_url: p.avatar_url ?? null,
    selected_border: p.selected_border ?? null,
  }
}

/**
 * Cache key of the cheers the signed-in user has received, counted by type.
 * Profile shows the total and the badge check reads the same entry (#224).
 * (Not `cheers:received:<id>`: device snapshots of that key hold a number.)
 */
export function myCheersCountKey(userId: string): string {
  return queryKey('cheers', 'received', userId, 'byType')
}

/** The cheers a player received: how many in all, and how many of each type. */
export async function fetchCheersReceived(userId: string): Promise<CheersReceived> {
  const { data, error } = await supabase.from('cheers').select('cheer_type').eq('receiver_id', userId)
  if (error) throw error
  return countCheers((data ?? []) as { cheer_type: string }[])
}


/** A `profiles` row as PostgREST returns it → the `Profile` the UI works with. */
export function normalizeProfileRow(row: Partial<Profile>): Profile {
  return {
    id: row.id as string,
    username: row.username as string,
    first_name: row.first_name ?? null,
    last_name: row.last_name ?? null,
    avatar_url: row.avatar_url ?? null,
    position: normalizeVolleyballPositions(row.position),
    skill_level: normalizeVolleyballSkillLevel(row.skill_level),
    created_at: row.created_at as string,
    selected_border: row.selected_border ?? null,
    selected_card_bg: row.selected_card_bg ?? null,
    bio: row.bio ?? null,
    notification_prefs: row.notification_prefs ?? null,
  }
}

/**
 * The signed-in user's own profile. Every reader shares one cache entry, so a
 * save in the Profile tab is immediately visible everywhere else.
 *
 * `enabled: false` reads the cache without fetching (a hidden tab that has not
 * been opened yet).
 */
export function useMyProfile(opts?: { enabled?: boolean }): MyProfile {
  const { userId } = useSession()
  const key = userId ? myProfileKey(userId) : null
  const enabled = (opts?.enabled ?? true) && userId !== null

  const query = useQuery<Profile>(
    key,
    async () => {
      const [profileRes, prefs] = await Promise.all([
        supabase.from('profiles').select(PROFILE_BRIEF_SELECT).eq('id', userId as string).single(),
        readMyNotificationPrefs(userId as string),
      ])
      if (profileRes.error) throw profileRes.error
      return normalizeProfileRow({ ...(profileRes.data as Partial<Profile>), notification_prefs: prefs })
    },
    { staleMs: STALE.profile, enabled },
  )

  const mutation = useMutation<ProfilePatch, ProfilePatch>(
    async patch => {
      if (!userId) throw new Error('Not logged in')
      const { notification_prefs, ...publicPatch } = patch
      if (notification_prefs !== undefined) {
        const { error } = await supabase
          .from('user_settings')
          .upsert({ user_id: userId, notification_prefs, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
        if (error) throw error
      }
      if (Object.keys(publicPatch).length > 0) {
        const { error } = await supabase.from('profiles').update(publicPatch).eq('id', userId)
        if (error) throw error
      }
      return patch
    },
    {
      onMutate: patch => {
        if (!key || !userId) return
        const previous = getQueryData<Profile>(key)
        if (!previous) return
        setQueryData<Profile>(key, { ...previous, ...patch })
        // The switches are read from the settings query: keep it in step, or
        // the next profile refetch would bring the old ones back.
        const settingsKey = userSettingsKey(userId)
        const previousSettings = getQueryData<UserSettings | null>(settingsKey)
        if (patch.notification_prefs !== undefined && previousSettings) {
          setQueryData<UserSettings | null>(settingsKey, { ...previousSettings, notification_prefs: patch.notification_prefs })
        }
        return () => {
          setQueryData<Profile>(key, previous)
          if (previousSettings !== undefined) setQueryData<UserSettings | null>(settingsKey, previousSettings)
        }
      },
      onSuccess: () => {
        // Chat bubbles and the event page read the brief copy; keep it in step
        // (the own-profile entry already holds the patch from onMutate).
        const saved = key ? getQueryData<Profile>(key) : undefined
        if (userId && saved) setQueryData<ProfileBrief>(profileBriefKey(userId), toProfileBrief(saved))
      },
      onError: error => Sentry.captureException(error),
      // A first save creates the settings row the cache holds as null: read it
      // again so the switches the profile shows are the saved ones.
      invalidates: patch =>
        patch.notification_prefs !== undefined && userId && getQueryData(userSettingsKey(userId)) === null
          ? [userSettingsKey(userId)]
          : [],
    },
  )

  const { mutate } = mutation
  const keyRef = useRef(key)
  keyRef.current = key
  const busyRef = useRef(false)
  const queuedRef = useRef<{ patch: ProfilePatch; waiters: Array<(saved: boolean) => void> } | null>(null)

  const updateProfile = useCallback((patch: ProfilePatch): Promise<boolean> => {
    if (busyRef.current) {
      // `useMutation` would drop this call (double-submit guard) and the caller
      // would report a failure that never happened. Queue it instead.
      const k = keyRef.current
      const previous = k ? getQueryData<Profile>(k) : undefined
      if (k && previous) setQueryData<Profile>(k, { ...previous, ...patch })
      const queued = queuedRef.current ?? (queuedRef.current = { patch: {}, waiters: [] })
      queued.patch = { ...queued.patch, ...patch }
      return new Promise<boolean>(resolve => { queued.waiters.push(resolve) })
    }
    busyRef.current = true
    const first = mutate(patch).then(r => r !== undefined)
    void (async () => {
      await first
      while (queuedRef.current) {
        const queued = queuedRef.current
        queuedRef.current = null
        const saved = (await mutate(queued.patch)) !== undefined
        queued.waiters.forEach(resolve => resolve(saved))
      }
      busyRef.current = false
    })()
    return first
  }, [mutate])

  return {
    profile: query.data,
    error: query.error,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isStale: query.isStale,
    refetch: query.refetch,
    updateProfile,
    isSaving: mutation.isPending,
    saveError: mutation.error,
  }
}

/**
 * How many cheers the signed-in user has received. Reads the by-type rows the
 * badge check needs anyway, so Profile reads `cheers` once. A failed refetch
 * keeps the last known count instead of dropping it to zero.
 */
export function useMyCheersCount(opts?: { enabled?: boolean }): QueryResult<number> {
  const { userId } = useSession()
  const query = useQuery<CheersReceived>(
    userId ? myCheersCountKey(userId) : null,
    () => fetchCheersReceived(userId as string),
    { staleMs: STALE.profile, enabled: (opts?.enabled ?? true) && userId !== null },
  )
  const { refetch } = query
  const refetchTotal = useCallback(
    async (o?: Parameters<typeof refetch>[0]) => (await refetch(o))?.total,
    [refetch],
  )
  return { ...query, data: query.data?.total, refetch: refetchTotal }
}
