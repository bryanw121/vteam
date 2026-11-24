import { useEffect, useRef } from 'react'
import { useRouter } from 'expo-router'
import { ANALYTICS_EVENTS } from '../../constants/analytics'
import { track } from '../../lib/analytics'
import type { EventAttendanceApi, EventWithDetails, JoinIntentOutcome, JoinIntentStatus } from '../../types'
import { joinIntentDecision } from '../../utils/eventDetail'
import { takePendingAction } from '../../utils/pendingAction'
import { routes } from '../../utils/routes'
import { usePlayerSetupNeeded } from '../usePlayerSetupGate'
import type { EventDialogApi } from './useEventDialog'

/**
 * Finishing a guest's Join (#229): back on the event signed in, offer the spot once, with
 * one tap, using the same join as the footer; a new player is then offered setup.
 */
export function useJoinIntent(args: {
  eventId: string
  event: EventWithDetails | null | undefined
  userId: string | null
  ready: boolean
  status: JoinIntentStatus
  over: boolean
  requiresApproval: boolean
  attendance: Pick<EventAttendanceApi, 'join' | 'joinWaitlist' | 'requestToJoin'>
  dialog: EventDialogApi
}) {
  const { eventId, event, userId, ready, status, over, requiresApproval, attendance, dialog } = args
  const router = useRouter()
  const setupNeeded = usePlayerSetupNeeded()
  const checked = useRef(false)

  useEffect(() => {
    if (checked.current || !userId || !event || !ready) return
    checked.current = true
    const decision = joinIntentDecision(takePendingAction(eventId), status, { cancelled: !!event.cancelled_at, over, requiresApproval })
    if (decision.outcome === 'none') return
    if (decision.outcome === 'offer') { dialog.open({ kind: 'joinIntent', stage: 'offer', offer: decision.offer }); return }
    track(ANALYTICS_EVENTS.joinIntentResumed, { outcome: decision.outcome satisfies JoinIntentOutcome })
  }, [userId, event, ready]) // eslint-disable-line react-hooks/exhaustive-deps -- once, when the signed-in view is ready

  const state = dialog.dialog?.kind === 'joinIntent' ? dialog.dialog : null

  async function confirm() {
    if (!state) return
    const run = state.offer === 'waitlist' ? attendance.joinWaitlist : state.offer === 'request' ? attendance.requestToJoin : attendance.join
    const row = await run()
    if (!row) { dialog.close(); return } // failed: useEventAttendance already said so
    track(ANALYTICS_EVENTS.joinIntentResumed, { outcome: 'joined' satisfies JoinIntentOutcome, offer: state.offer })
    if (setupNeeded) dialog.open({ ...state, stage: 'setup' })
    else dialog.close()
  }

  function notNow() {
    if (state?.stage === 'offer') track(ANALYTICS_EVENTS.joinIntentResumed, { outcome: 'not_now' satisfies JoinIntentOutcome, offer: state.offer })
    dialog.close()
  }

  function setup() {
    dialog.close()
    router.push(routes.welcome(routes.event(eventId)))
  }

  return { state, confirm, notNow, setup, later: dialog.close }
}
