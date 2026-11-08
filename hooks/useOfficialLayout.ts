import { useMemo } from 'react'
import { officialLayout } from '../lib/scoresheet/officialLayout'
import { helveticaMeasure } from '../lib/scoresheet/fitText'
import type { MatchDoc, MatchState, OfficialSheetLayout } from '../types'

/** Where every mark goes on the official form, for drawing it on screen (OfficialSheetView). */
export function useOfficialLayout(doc: MatchDoc | null | undefined, state: MatchState | null | undefined): OfficialSheetLayout | null {
  return useMemo(() => (doc && state ? officialLayout(doc, state, { measure: helveticaMeasure }) : null), [doc, state])
}
