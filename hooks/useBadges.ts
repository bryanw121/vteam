import { useCallback, useEffect } from 'react'
import { Platform } from 'react-native'
import { supabase } from '../lib/supabase'
import { getQueryData, invalidate, prefetchQuery, queryKey, setQueryData, useQuery } from '../lib/query'
import { STALE } from '../constants/cache'
import { USER_BADGE_SELECT } from '../constants/selects'
import { useSession } from '../contexts/session'
import { collectBadgeStats, checkAndAwardBadges, mergeAwardedBadges } from '../utils/badges'
import { fetchCheersReceived, myCheersCountKey } from './useMyProfile'
import type { CheersReceived, UserBadge, Profile } from '../types'

const BADGE_SELECT = USER_BADGE_SELECT

// Awarding scans the user's attendance/cheer history, so it runs far less often
// than the badge list is read. Explicit profile edits bypass this (see checkBadges).
const CHECK_STALE_MS = STALE.badges
const CACHE_KEY = 'useBadges:cache'

/** Cache key of a user's earned badges. */
export function badgesKey(userId: string): string {
  return queryKey('badges', userId)
}

/** When each user's badge-award scan last ran (module scope: survives the profile tab remounting). */
const lastCheckedAt = new Map<string, number>()

type CacheEntry = { userId: string; badges: UserBadge[]; fetchedAt: number }

// AsyncStorage is only available on native; on web we skip persistence.
async function readCache(): Promise<CacheEntry | null> {
  if (Platform.OS === 'web') return null
  try {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default
    const raw = await AsyncStorage.getItem(CACHE_KEY)
    return raw ? (JSON.parse(raw) as CacheEntry) : null
  } catch {
    return null
  }
}

async function writeCache(entry: CacheEntry): Promise<void> {
  if (Platform.OS === 'web') return
  try {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(entry))
  } catch {
    // Non-critical — ignore write failures
  }
}

async function fetchBadgeRows(userId: string): Promise<UserBadge[]> {
  const { data, error } = await supabase
    .from('user_badges')
    .select(BADGE_SELECT)
    .eq('user_id', userId)
    .order('display_order', { ascending: true, nullsFirst: false })
  if (error) throw error
  const rows = (data ?? []) as UserBadge[]
  void writeCache({ userId, badges: rows, fetchedAt: Date.now() })
  return rows
}

/**
 * The signed-in user's earned badges, on `lib/query` (cache survives unmount,
 * shared by every reader). On native the rows are also persisted to
 * AsyncStorage so a cold start paints them without waiting for the network.
 */
export function useBadges(opts?: { enabled?: boolean }) {
  const { userId } = useSession()
  const key = userId ? badgesKey(userId) : null
  const enabled = (opts?.enabled ?? true) && userId !== null

  const query = useQuery<UserBadge[]>(key, () => fetchBadgeRows(userId as string), {
    staleMs: STALE.badges,
    enabled,
  })
  const { refetch } = query

  // Cold start on native: seed from AsyncStorage when the persisted rows are still fresh.
  useEffect(() => {
    if (!enabled || !userId) return
    let cancelled = false
    void readCache().then(cached => {
      if (cancelled || !cached || cached.userId !== userId) return
      if (Date.now() - cached.fetchedAt >= STALE.badges) return
      if (getQueryData(badgesKey(userId)) === undefined) setQueryData(badgesKey(userId), cached.badges)
    })
    return () => { cancelled = true }
  }, [enabled, userId])

  /**
   * Returns the user's current badges, hitting the network only when stale (or
   * `force`). Returning the rows (not just updating the cache) lets callers use
   * them immediately — React state isn't readable until the next render.
   */
  const fetchBadges = useCallback(
    async (force = false): Promise<UserBadge[]> => {
      const rows = await refetch({ force })
      return rows ?? (key ? getQueryData<UserBadge[]>(key) : undefined) ?? []
    },
    [refetch, key],
  )

  /**
   * Collect stats, compare against thresholds, award anything new.
   *
   * This is the expensive path — it scans the user's attendance and cheer
   * history — so it is throttled to `CHECK_STALE_MS`. Screen focus passes no
   * `force`, since nothing that awards a badge can happen while the profile
   * screen is already open. An explicit profile edit (saving details, uploading
   * an avatar) *can* newly qualify for `profile_complete`, so those call sites
   * pass `force` to bypass the throttle and keep the badge immediate.
   */
  const checkBadges = useCallback(
    async (profile: Profile, force = false) => {
      if (!userId) return
      if (!force && Date.now() - (lastCheckedAt.get(userId) ?? 0) < CHECK_STALE_MS) return
      lastCheckedAt.set(userId, Date.now())

      // Compare against the cached rows. Awaiting fetchBadges (cache-respecting,
      // usually a no-op) guarantees the list is populated — comparing against an
      // empty list would re-award every badge.
      // Received cheers come from the entry Profile's total reads (#224), joined
      // or reused rather than read a second time.
      const cheersKey = myCheersCountKey(userId)
      const received = prefetchQuery(cheersKey, () => fetchCheersReceived(userId), { staleMs: STALE.profile })
        .then(() => getQueryData<CheersReceived>(cheersKey))
      const [existing, stats] = await Promise.all([
        fetchBadges(),
        received.then(r => collectBadgeStats(userId, profile, r)),
      ])
      const newlyAwarded = await checkAndAwardBadges(userId, stats, existing)
      if (newlyAwarded.length > 0) {
        const k = badgesKey(userId)
        setQueryData<UserBadge[]>(k, prev => mergeAwardedBadges(prev ?? existing, newlyAwarded))
        void writeCache({ userId, badges: getQueryData<UserBadge[]>(k) ?? [], fetchedAt: Date.now() })
      }
    },
    [userId, fetchBadges],
  )

  /**
   * Assign a badge to a display slot (1–3) or clear it (null). Evicts whatever
   * was in that slot. Optimistic; rolls back and refetches if a write fails.
   */
  const setDisplaySlot = useCallback(
    async (badgeType: string, slot: number | null, displayTier?: number | null) => {
      if (!userId) return
      const k = badgesKey(userId)
      const previous = getQueryData<UserBadge[]>(k) ?? []
      const next = previous.map(b => {
        if (b.badge_type === badgeType) return { ...b, display_order: slot, display_tier: displayTier ?? null }
        if (slot !== null && b.display_order === slot) return { ...b, display_order: null }
        return b
      })
      setQueryData<UserBadge[]>(k, next)
      void writeCache({ userId, badges: next, fetchedAt: Date.now() })

      try {
        // Persist: clear the slot first, then assign.
        if (slot !== null) {
          const { error } = await supabase
            .from('user_badges')
            .update({ display_order: null })
            .eq('user_id', userId)
            .eq('display_order', slot)
            .neq('badge_type', badgeType)
          if (error) throw error
        }
        const { error } = await supabase
          .from('user_badges')
          .update({ display_order: slot, display_tier: displayTier ?? null })
          .eq('user_id', userId)
          .eq('badge_type', badgeType)
        if (error) throw error
      } catch {
        setQueryData<UserBadge[]>(k, previous)
        invalidate(k)
      }
    },
    [userId],
  )

  return { badges: query.data ?? EMPTY_BADGES, loading: query.isLoading, fetchBadges, checkBadges, setDisplaySlot }
}

const EMPTY_BADGES: UserBadge[] = []
