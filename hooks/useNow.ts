import { useEffect, useState } from 'react'

/** The current time in ms, refreshed every `everyMs` (so a poll's close time is noticed while the screen is open). */
export function useNow(everyMs: number): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), everyMs)
    return () => clearInterval(t)
  }, [everyMs])
  return now
}
