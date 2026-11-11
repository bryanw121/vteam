import { useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { getQueryData, setQueryData, useMutation } from '../lib/query'
import { useSession } from '../contexts/session'
import { notifyError } from '../utils/notify'
import { withHidden, withoutHidden } from '../utils/hiddenFeed'
import { DEFAULT_REMINDER_LEAD_MINUTES } from '../constants/notifications'
import { useUserSettings, userSettingsKey } from './useUserSettings'
import type { HiddenFeedControls, HiddenFeedEntry, UserSettings } from '../types'

const NONE: HiddenFeedEntry[] = []

/**
 * What the signed-in player hid from their Events feed, and how to change it.
 * Stored in `user_settings.hidden_feed` (owner-only), so it follows them to
 * every device; each change writes the whole list, optimistically. Guests have
 * nothing hidden (hiding asks them to sign in first).
 */
export function useHiddenFeed(): HiddenFeedControls {
  const { userId } = useSession()
  const { settings } = useUserSettings()
  const entries = settings?.hidden_feed ?? NONE

  const save = useMutation(
    async (next: HiddenFeedEntry[]) => {
      if (!userId) throw new Error('Sign in to hide things from your feed')
      const { error } = await supabase
        .from('user_settings')
        .upsert({ user_id: userId, hidden_feed: next, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
      if (error) throw error
      return true
    },
    {
      onMutate: next => {
        if (!userId) return
        const key = userSettingsKey(userId)
        const before = getQueryData<UserSettings | null>(key)
        setQueryData<UserSettings | null>(key, prev => ({
          user_id: userId,
          seen_banners: prev?.seen_banners ?? [],
          reminder_lead_minutes: prev?.reminder_lead_minutes ?? DEFAULT_REMINDER_LEAD_MINUTES,
          home_city_id: prev?.home_city_id ?? null,
          home_city: prev?.home_city ?? null,
          hidden_feed: next,
          notification_prefs: prev?.notification_prefs ?? null,
        }))
        return () => setQueryData(key, before ?? null)
      },
      onError: () => notifyError("Couldn't update what's hidden", 'Check your connection and try again.'),
    },
  )
  const mutate = save.mutate

  // Read the latest list from the cache, not this render's copy, so two quick
  // hides in a row both land.
  const current = useCallback(
    () => (userId ? getQueryData<UserSettings | null>(userSettingsKey(userId))?.hidden_feed : undefined) ?? NONE,
    [userId],
  )
  const hide = useCallback((entry: HiddenFeedEntry) => mutate(withHidden(current(), entry)), [mutate, current])
  const unhide = useCallback((entry: Pick<HiddenFeedEntry, 'kind' | 'key'>) => mutate(withoutHidden(current(), entry)), [mutate, current])
  const restore = useCallback((list: HiddenFeedEntry[]) => mutate(list), [mutate])

  return useMemo(() => ({ entries, hide, unhide, restore }), [entries, hide, unhide, restore])
}
