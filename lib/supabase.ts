import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient, type Session } from '@supabase/supabase-js'
import type { AppDatabase } from '../types'
import { AppState, Platform } from 'react-native'
import 'react-native-url-polyfill/auto'

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!

// During static export (SSR), window doesn't exist — AsyncStorage would throw.
// Fall back to a no-op storage so the build can complete; sessions are
// only needed on the client where window is available.
const isSSR = typeof window === 'undefined'
const storage = isSSR
  ? { getItem: () => null, setItem: () => {}, removeItem: () => {} }
  : AsyncStorage

/** Where supabase-js keeps the session (its default: `sb-<project ref>-auth-token`). */
const AUTH_STORAGE_KEY = `sb-${(() => { try { return new URL(supabaseUrl).hostname.split('.')[0] } catch { return '' } })()}-auth-token`

/**
 * The session saved on this device, read straight from storage (web only: synchronous).
 * `getSession()` waits for a token refresh when the saved access token has expired,
 * which on a cold server can take seconds; the saved session already says who is
 * signed in, so the UI can draw for them meanwhile. A display hint only: requests
 * still go through supabase-js, which waits for the refreshed token.
 */
export function readStoredSession(): Session | null {
  if (Platform.OS !== 'web' || isSSR) return null
  try {
    const raw = window.localStorage.getItem(AUTH_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<Session> | null
    if (!parsed?.user?.id || typeof parsed.refresh_token !== 'string' || !parsed.refresh_token) return null
    return parsed as Session
  } catch {
    return null
  }
}

export const supabase = createClient<AppDatabase>(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage,
    autoRefreshToken: !isSSR,
    persistSession: !isSSR,
    // On web, Supabase must parse the #access_token hash from the redirect URL.
    // On native, deep-link handling is done by Expo Router — no URL to detect.
    detectSessionInUrl: Platform.OS === 'web',
  },
})

// Native: the token refresh timer only runs while the app is in the
// foreground (Supabase's React Native guidance). A backgrounded app otherwise
// wakes with an expired access token, and the first requests / realtime joins
// after resume fail until the next tick. Web keeps the default visibility-based
// handling; SSR has no session to refresh.
if (Platform.OS !== 'web' && !isSSR) {
  AppState.addEventListener('change', state => {
    if (state === 'active') void supabase.auth.startAutoRefresh()
    else void supabase.auth.stopAutoRefresh()
  })
}
