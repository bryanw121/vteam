import { useCallback, useEffect, useRef } from 'react'
import { useRouter } from 'expo-router'
import { useUrlParam } from './useUrlParam'
import { useExternalProgram } from './useExternalPrograms'
import { ProgramSheet } from '../components/programs/ProgramSheet'
import { VIEW } from '../utils/urlViews'
import { routes } from '../utils/routes'
import { track } from '../lib/analytics'
import { toast } from '../lib/toast'
import { ANALYTICS_EVENTS } from '../constants/analytics'
import { PROGRAM_SHEET_COPY } from '../constants/copy'
import type { ExternalProgram } from '../types'

/**
 * The outside tournament / league sheet for a screen (#395): `openProgram` for the cards, and the
 * sheet to render once. The open one is in the address (`?program=<id>`), so a shared link opens
 * it; it is looked up in the whole programs read (not only the viewer's region), and one that is
 * gone shows the list and a toast.
 */
export function useProgramSheet(screen: 'feed' | 'tournaments' | 'leagues') {
  const router = useRouter()
  const [id, setId] = useUrlParam('program', VIEW[screen].program, screen === 'feed' ? { tab: 'events' } : {})
  const { program, isLoading, error } = useExternalProgram(id)
  const missing = !!id && !program && !isLoading && !error

  const counted = useRef<string | null>(null)
  const openedHere = useRef(false)
  useEffect(() => {
    if (!program || counted.current === program.id) return
    counted.current = program.id
    track(ANALYTICS_EVENTS.outsideProgramOpened, { kind: program.kind, org: program.org, source: openedHere.current ? 'card' : 'link' })
    openedHere.current = false
  }, [program])

  useEffect(() => {
    if (!missing) return
    toast.show({ message: PROGRAM_SHEET_COPY.gone, variant: 'info' })
    setId('')
  }, [missing, setId])

  const openProgram = useCallback((p: ExternalProgram) => {
    openedHere.current = true
    setId(p.id)
  }, [setId])

  // Find a team / Scores leave the screen: close the sheet first, go once it has closed
  // (a sheet left open would sit over the next screen on native).
  const pendingRoute = useRef<string | null>(null)
  const leaveTo = useCallback((path: string) => { pendingRoute.current = path; setId('') }, [setId])
  const onClosed = useCallback(() => {
    const path = pendingRoute.current
    pendingRoute.current = null
    if (path) router.push(path as Parameters<typeof router.push>[0])
  }, [router])

  const sheet = (
    <ProgramSheet
      program={id ? program : null}
      onDismiss={() => setId('')}
      onClosed={onClosed}
      onFindTeam={p => leaveTo(routes.findATeam(p.id))}
      onScores={p => leaveTo(routes.programScores(p.id))}
    />
  )
  return { openProgram, sheet }
}
