import { useEffect } from 'react'
import { AppState } from 'react-native'
import { queryKey, useQuery } from '../lib/query'
import type { QueryResult } from '../lib/query'
import { STALE } from '../constants/cache'
import { LIVE_SCORES_MIN_REFRESH_MS } from '../constants/liveScores'
import { parseSheetState, sheetScoresUrl } from '../utils/sheetScores'
import type { SheetState } from '../types'

/**
 * Live scores for an outside tournament that runs on the Google Sheet tournament app. Public,
 * read-only JSON (Apps Script answers with CORS open), refetched while the screen is open and the
 * app is in front: every 30 s, or the Sheet's `refresh_seconds` if that's longer.
 * `url` is null when the tournament has no Sheet.
 */
export function useSheetScores(programId: string | null): QueryResult<SheetState> & { url: string | null } {
  const url = sheetScoresUrl(programId)
  const result = useQuery<SheetState>(
    url ? queryKey('sheetScores', programId) : null,
    async () => {
      const res = await fetch(url as string, { headers: { accept: 'application/json' } })
      if (!res.ok) throw new Error(`Scores feed answered ${res.status}`)
      return parseSheetState(await res.json())
    },
    { staleMs: STALE.liveScores },
  )
  const { refetch } = result
  const every = Math.max(LIVE_SCORES_MIN_REFRESH_MS, (result.data?.settings.refresh_seconds ?? 0) * 1000)
  useEffect(() => {
    if (!url) return
    const timer = setInterval(() => {
      if (AppState.currentState === 'active' || AppState.currentState === undefined) void refetch()
    }, every)
    return () => clearInterval(timer)
  }, [url, every, refetch])
  return { ...result, url }
}
