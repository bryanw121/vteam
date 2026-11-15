import { useCallback, useEffect, useMemo, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { SIMPLE_FORMATS, addPoint, minusPoint, newSimpleMatch, parseSimpleMatch, replaySimple, undoPoint } from '../lib/simpleScore'
import { track } from '../lib/analytics'
import { ANALYTICS_EVENTS } from '../constants/analytics'
import type { SimpleFormat, SimpleMatch, TeamSide } from '../types/scoresheet'

const KEY = 'vteam.simpleScore.current'
/** Where a new match starts: no names (Team A / Team B), best of 3, team A serving. All changeable on the score screen. */
const DEFAULT_FORMAT = SIMPLE_FORMATS[1].format
const fresh = (format: SimpleFormat = DEFAULT_FORMAT, firstServe: TeamSide = 'A') =>
  newSimpleMatch({ names: { A: '', B: '' }, format, firstServe, now: Date.now() })

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
      // No saved match: open straight on a fresh board (nothing to fill in first).
      .then(raw => { if (live) setMatch(parseSimpleMatch(raw) ?? fresh()) })
      .catch(() => { if (live) setMatch(fresh()) })
      .finally(() => { if (live) setLoaded(true) })
    return () => { live = false }
  }, [])

  const commit = useCallback((next: SimpleMatch | null) => {
    setMatch(next)
    void (next ? AsyncStorage.setItem(KEY, JSON.stringify(next)) : AsyncStorage.removeItem(KEY)).catch(() => {})
  }, [])

  const state = useMemo(() => (match ? replaySimple(match) : null), [match])

  /** Change the format or who serves first at any time; the score is replayed under the new rules. */
  const update = useCallback((patch: { format?: SimpleFormat; firstServe?: TeamSide }) => {
    if (match) commit({ ...match, ...patch, updatedAt: Date.now() })
  }, [match, commit])

  const point = useCallback((team: TeamSide) => {
    if (!match) return
    const next = addPoint(match, team, Date.now())
    if (next === match) return
    commit(next)
    if (!match.rallies.length) track(ANALYTICS_EVENTS.scorekeeperMatch, { stage: 'started', sets: 0, mode: 'simple' })
    const after = replaySimple(next)
    if (after.over) track(ANALYTICS_EVENTS.scorekeeperMatch, { stage: 'finished', sets: after.sets.length, mode: 'simple' })
  }, [match, commit])

  const undo = useCallback(() => { if (match) commit(undoPoint(match, Date.now())) }, [match, commit])
  const minus = useCallback((team: TeamSide) => { if (match) commit(minusPoint(match, team, Date.now())) }, [match, commit])
  /** A new match with the same format and first server. */
  const reset = useCallback(() => commit(fresh(match?.format, match?.firstServe)), [match, commit])

  return { loaded, match, state, update, point, minus, undo, reset }
}
