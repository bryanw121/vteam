import { useCallback, useEffect, useMemo, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { addPoint, newSimpleMatch, parseSimpleMatch, replaySimple, undoPoint } from '../lib/simpleScore'
import { track } from '../lib/analytics'
import { ANALYTICS_EVENTS } from '../constants/analytics'
import type { SimpleFormat, SimpleMatch, TeamSide } from '../types/scoresheet'

const KEY = 'vteam.simpleScore.current'

/**
 * The simple-score match on this device (one at a time): restored on open, saved on every tap,
 * so closing the app or the tab never loses the score. Best effort: a failed write never blocks scoring.
 */
export function useSimpleScore() {
  const [match, setMatch] = useState<SimpleMatch | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let live = true
    AsyncStorage.getItem(KEY)
      .then(raw => { if (live) setMatch(parseSimpleMatch(raw)) })
      .catch(() => {})
      .finally(() => { if (live) setLoaded(true) })
    return () => { live = false }
  }, [])

  const commit = useCallback((next: SimpleMatch | null) => {
    setMatch(next)
    void (next ? AsyncStorage.setItem(KEY, JSON.stringify(next)) : AsyncStorage.removeItem(KEY)).catch(() => {})
  }, [])

  const state = useMemo(() => (match ? replaySimple(match) : null), [match])

  const start = useCallback((opts: { names: Record<TeamSide, string>; format: SimpleFormat; firstServe: TeamSide }) => {
    commit(newSimpleMatch({ ...opts, now: Date.now() }))
    track(ANALYTICS_EVENTS.scorekeeperMatch, { stage: 'started', sets: 0, mode: 'simple' })
  }, [commit])

  const point = useCallback((team: TeamSide) => {
    if (!match) return
    const next = addPoint(match, team, Date.now())
    if (next === match) return
    commit(next)
    const after = replaySimple(next)
    if (after.over) track(ANALYTICS_EVENTS.scorekeeperMatch, { stage: 'finished', sets: after.sets.length, mode: 'simple' })
  }, [match, commit])

  const undo = useCallback(() => { if (match) commit(undoPoint(match, Date.now())) }, [match, commit])
  const reset = useCallback(() => commit(null), [commit])

  return { loaded, match, state, start, point, undo, reset }
}
