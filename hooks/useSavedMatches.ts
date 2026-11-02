import { useCallback, useState } from 'react'
import { useFocusEffect } from 'expo-router'
import { deleteMatch, listMatches } from '../lib/scoresheet/storage'
import type { MatchSummary } from '../types'

/** Scorekeeper matches saved on this device, newest first; re-read whenever the screen is focused. */
export function useSavedMatches() {
  const [matches, setMatches] = useState<MatchSummary[] | null>(null)
  const reload = useCallback(() => {
    void listMatches().then(setMatches)
  }, [])
  useFocusEffect(reload)
  const remove = useCallback(async (id: string) => {
    await deleteMatch(id)
    reload()
  }, [reload])
  return { matches, live: (matches ?? []).filter(m => m.status === 'live'), reload, remove }
}
