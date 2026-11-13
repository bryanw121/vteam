import { useCallback, useEffect, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useSession } from '../contexts/session'
import { addRecentSearch, parseRecentSearches } from '../utils/search'

/** Per account (guests share one list), so a signed-out device never shows someone's searches. */
const storageKey = (userId: string | null) => `vteam.recentSearches.${userId ?? 'guest'}`

/** Forget an account's recent searches (on sign-out: the next person on this device never sees them). */
export function clearRecentSearches(userId: string): void {
  void AsyncStorage.removeItem(storageKey(userId)).catch(() => {})
}

/** The last 8 searches on this device (#176). Storage failures just mean no history. */
export function useRecentSearches() {
  const { userId } = useSession()
  const [recent, setRecent] = useState<string[]>([])

  useEffect(() => {
    let alive = true
    setRecent([])
    AsyncStorage.getItem(storageKey(userId))
      .then(raw => { if (alive) setRecent(parseRecentSearches(raw)) })
      .catch(() => {})
    return () => { alive = false }
  }, [userId])

  const save = useCallback((next: string[]) => {
    setRecent(next)
    void AsyncStorage.setItem(storageKey(userId), JSON.stringify(next)).catch(() => {})
  }, [userId])

  const remember = useCallback((q: string) => setRecent(prev => {
    const next = addRecentSearch(prev, q)
    void AsyncStorage.setItem(storageKey(userId), JSON.stringify(next)).catch(() => {})
    return next
  }), [userId])

  const clear = useCallback(() => save([]), [save])

  return { recent, remember, clear }
}
