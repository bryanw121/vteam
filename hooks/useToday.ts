import { useEffect, useState } from 'react'
import { AppState } from 'react-native'
import { localDateKey } from '../utils'

/** ms from `now` until the next local midnight (plus a second, so the date has changed). */
export function msUntilNextLocalMidnight(now: Date): number {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1)
  return Math.max(1000, next.getTime() - now.getTime())
}

/**
 * Today's local date key ("2026-11-07"), kept current: it changes at local
 * midnight and whenever the app comes back to the foreground (a phone that
 * slept through midnight doesn't fire timers). A screen that computed "today"
 * once at load kept showing yesterday in a home-screen web app left open
 * overnight (#195).
 */
export function useToday(): string {
  const [today, setToday] = useState(() => localDateKey(new Date()))

  useEffect(() => {
    const check = () => setToday(prev => {
      const now = localDateKey(new Date())
      return now === prev ? prev : now
    })
    let timer: ReturnType<typeof setTimeout>
    const arm = () => {
      timer = setTimeout(() => { check(); arm() }, msUntilNextLocalMidnight(new Date()))
    }
    arm()
    const sub = AppState.addEventListener('change', status => {
      if (status !== 'active') return
      check()
      clearTimeout(timer)
      arm()
    })
    return () => {
      clearTimeout(timer)
      sub.remove()
    }
  }, [])

  return today
}
