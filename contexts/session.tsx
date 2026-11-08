import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { readStoredSession, supabase } from '../lib/supabase'
import type { SessionState } from '../types'

const SessionContext = createContext<SessionState>({
  session: null,
  userId: null,
  isGuest: true,
  loading: true,
})

/**
 * One auth listener for the whole app. Screens read the signed-in user from here
 * instead of calling `supabase.auth.getUser()` (a network round trip to the Auth
 * server every time) or subscribing to auth changes themselves.
 *
 * `isGuest` is true once loading finishes with no session: guests can browse
 * events and clubs, and anything that needs an account shows a sign-in prompt.
 */
export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    // Web: draw for the saved viewer at once. getSession() can wait seconds on a
    // token refresh; it replaces this (or signs out) when it resolves. Read after
    // mount, so the static HTML and the first client render still match.
    const stored = readStoredSession()
    if (stored) {
      setSession(stored)
      setLoading(false)
    }
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setSession(data.session)
      setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
      setLoading(false)
    })
    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  const userId = session?.user?.id ?? null
  const value = useMemo<SessionState>(
    () => ({ session, userId, isGuest: !loading && !userId, loading }),
    [session, userId, loading],
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession(): SessionState {
  return useContext(SessionContext)
}
