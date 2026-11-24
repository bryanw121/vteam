import { useState } from 'react'
import type { EventDialogState } from '../../types'

/**
 * The one dialog or sheet open over the event screen (#354): deny a request, add a +1,
 * delete, leave, or the join offer after sign-up. One value, so two can't open at once.
 */
export function useEventDialog() {
  const [dialog, setDialog] = useState<EventDialogState>(null)
  return { dialog, open: setDialog, close: () => setDialog(null) }
}

export type EventDialogApi = ReturnType<typeof useEventDialog>
