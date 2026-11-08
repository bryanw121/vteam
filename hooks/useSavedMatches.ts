import { useCallback, useState } from 'react'
import { useFocusEffect } from 'expo-router'
import { deleteMatch, listMatches } from '../lib/scoresheet/storage'
import { EXAMPLE_MATCH_ID } from '../lib/scoresheet/exampleMatch'
import type { MatchSummary } from '../types'

/** Scorekeeper matches saved on this device, newest first (not the built-in example); re-read whenever the screen is focused. */
export function useSavedMatches() {
  const [matches, setMatches] = useState<MatchSummary[] | null>(null)
  const reload = useCallback(() => {
    void listMatches().then(list => setMatches(list.filter(m => m.id !== EXAMPLE_MATCH_ID)))
  }, [])
  useFocusEffect(reload)
  const remove = useCallback(async (id: string) => {
    await deleteMatch(id)
    reload()
  }, [reload])
  return { matches, live: (matches ?? []).filter(m => m.status === 'live'), reload, remove }
}
