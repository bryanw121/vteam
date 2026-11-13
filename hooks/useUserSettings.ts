import { useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { getQueryData, queryKey, setQueryData, useMutation, useQuery } from '../lib/query'
import { DEFAULT_FEED_REGION, STALE } from '../constants'
import { useSession } from '../contexts/session'
import { notifyError } from '../utils/notify'
import { DEFAULT_REMINDER_LEAD_MINUTES } from '../constants/notifications'
import { parseHiddenFeed } from '../utils/hiddenFeed'
import { parseGameAlerts } from '../utils/gameAlerts'
import { DEFAULT_GAME_ALERTS } from '../constants/gameAlerts'
import type { GameAlertPrefs, MajorCity, ReminderLeadMinutes, UserSettings } from '../types'

/**
 * The signed-in user's private settings (`user_settings`, owner-only RLS):
 * home city (which region's outside sessions the feed shows), the one-time
 * banners already seen, how long before an event reminders arrive, and what
 * they hid from the Events feed (`useHiddenFeed`), and the notification
 * switches `useMyProfile` reads from this same query (#224: one read, not two).
 * Guests have none; a missing row reads as defaults.
 */
const SETTINGS_SELECT = 'user_id, home_city_id, seen_banners, reminder_lead_minutes, hidden_feed, game_alerts, notification_prefs, home_city:major_cities(id, display_name, city_name, admin_region, country_code)'

export const userSettingsKey = (userId: string) => queryKey('settings', userId)

export async function fetchSettings(userId: string): Promise<UserSettings | null> {
  const { data, error } = await supabase.from('user_settings').select(SETTINGS_SELECT).eq('user_id', userId).maybeSingle()
  if (error) throw error
  if (!data) return null
  const row = data as unknown as Omit<UserSettings, 'hidden_feed' | 'game_alerts'> & { hidden_feed: unknown; game_alerts?: unknown }
  return { ...row, hidden_feed: parseHiddenFeed(row.hidden_feed), game_alerts: parseGameAlerts(row.game_alerts) }
}

export function useUserSettings() {
  const { userId } = useSession()
  const query = useQuery(
    userId ? userSettingsKey(userId) : null,
    () => fetchSettings(userId as string),
    { staleMs: STALE.profile },
  )

  const homeCity = useMutation(
    async (city: MajorCity | null) => {
      if (!userId) throw new Error('Sign in to set a home city')
      const { error } = await supabase
        .from('user_settings')
        .upsert({ user_id: userId, home_city_id: city?.id ?? null, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
      if (error) throw error
      return true
    },
    {
      onMutate: city => {
        if (!userId) return
        const key = userSettingsKey(userId)
        const before = getQueryData<UserSettings | null>(key)
        setQueryData<UserSettings | null>(key, prev => ({
          user_id: userId,
          seen_banners: prev?.seen_banners ?? [],
          reminder_lead_minutes: prev?.reminder_lead_minutes ?? DEFAULT_REMINDER_LEAD_MINUTES,
          home_city_id: city?.id ?? null,
          home_city: city ?? null,
          hidden_feed: prev?.hidden_feed ?? [],
          notification_prefs: prev?.notification_prefs ?? null,
          game_alerts: prev?.game_alerts,
        }))
        return () => setQueryData(key, before ?? null)
      },
      onError: () => notifyError("Couldn't save your home city", 'Check your connection and try again.'),
    },
  )
  const homeCityMutate = homeCity.mutate
  const setHomeCity = useCallback((city: MajorCity | null) => homeCityMutate(city), [homeCityMutate])

  const reminderLead = useMutation(
    async (minutes: ReminderLeadMinutes) => {
      if (!userId) throw new Error('Sign in to set reminders')
      const { error } = await supabase
        .from('user_settings')
        .upsert({ user_id: userId, reminder_lead_minutes: minutes, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
      if (error) throw error
      return true
    },
    {
      onMutate: minutes => {
        if (!userId) return
        const key = userSettingsKey(userId)
        const before = getQueryData<UserSettings | null>(key)
        setQueryData<UserSettings | null>(key, prev => ({
          user_id: userId,
          seen_banners: prev?.seen_banners ?? [],
          home_city_id: prev?.home_city_id ?? null,
          home_city: prev?.home_city ?? null,
          reminder_lead_minutes: minutes,
          hidden_feed: prev?.hidden_feed ?? [],
          notification_prefs: prev?.notification_prefs ?? null,
          game_alerts: prev?.game_alerts,
        }))
        return () => setQueryData(key, before ?? null)
      },
      onError: () => notifyError("Couldn't save your reminder time", 'Check your connection and try again.'),
    },
  )
  const reminderLeadMutate = reminderLead.mutate
  const setReminderLead = useCallback((minutes: ReminderLeadMinutes) => reminderLeadMutate(minutes), [reminderLeadMutate])

  // New game alerts (#170): the whole object is written; the card debounces taps.
  const gameAlerts = useMutation(
    async (prefs: GameAlertPrefs) => {
      if (!userId) throw new Error('Sign in to set game alerts')
      const { error } = await supabase
        .from('user_settings')
        .upsert({ user_id: userId, game_alerts: prefs, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
      if (error) throw error
      return true
    },
    {
      onMutate: prefs => {
        if (!userId) return
        const key = userSettingsKey(userId)
        const before = getQueryData<UserSettings | null>(key)
        setQueryData<UserSettings | null>(key, prev => ({
          user_id: userId,
          seen_banners: prev?.seen_banners ?? [],
          home_city_id: prev?.home_city_id ?? null,
          home_city: prev?.home_city ?? null,
          reminder_lead_minutes: prev?.reminder_lead_minutes ?? DEFAULT_REMINDER_LEAD_MINUTES,
          hidden_feed: prev?.hidden_feed ?? [],
          notification_prefs: prev?.notification_prefs ?? null,
          game_alerts: prefs,
        }))
        return () => setQueryData(key, before ?? null)
      },
      onError: () => notifyError("Couldn't save your game alerts", 'Check your connection and try again.'),
    },
  )
  const gameAlertsMutate = gameAlerts.mutate
  const setGameAlerts = useCallback((prefs: GameAlertPrefs) => gameAlertsMutate(prefs), [gameAlertsMutate])

  return {
    settings: query.data,
    gameAlerts: query.data?.game_alerts ?? DEFAULT_GAME_ALERTS,
    setGameAlerts,
    isLoading: query.isLoading,
    error: query.error,
    setHomeCity,
    savingHomeCity: homeCity.isPending,
    setReminderLead,
  }
}

/** Schelagg region slug for a city name: "Austin" -> "austin", "San Antonio" -> "san-antonio". */
export function regionSlug(cityName: string): string {
  return cityName.trim().toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

/** Which region's outside sessions the feed shows: the home city, else the pilot default. */
export function useFeedRegion(): string {
  const { settings } = useUserSettings()
  const city = settings?.home_city?.city_name
  return city ? regionSlug(city) : DEFAULT_FEED_REGION
}

/** Record a one-time banner as seen on the account (best effort; the device copy is the fallback). */
export async function markBannerSeenOnAccount(userId: string, bannerId: string): Promise<void> {
  const key = userSettingsKey(userId)
  const current = getQueryData<UserSettings | null>(key)
  const seen = current?.seen_banners ?? []
  if (seen.includes(bannerId)) return
  const next = [...seen, bannerId]
  if (current !== undefined) setQueryData<UserSettings | null>(key, prev => (prev ? { ...prev, seen_banners: next } : prev ?? null))
  const { error } = await supabase
    .from('user_settings')
    .upsert({ user_id: userId, seen_banners: next, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
  if (error) console.warn('[banners] could not save seen banner on account:', error.message)
}
