import { useEffect, useRef, useState } from 'react'
import { usePlayerSetupNeeded } from '../usePlayerSetupGate'
import { takePendingAction } from '../../utils/pendingAction'
import { joinIntentOnReturn, joinIntentWhen } from '../../utils/eventDetail'
import { eventDateMs } from './derive'
import { ANALYTICS_EVENTS } from '../../constants/analytics'
import { track } from '../../lib/analytics'
import type { AttendanceStatus, EventAttendanceApi, EventWithDetails, JoinIntentOutcome, JoinOffer } from '../../types'

/**
 * Finishing a guest's Join (#229): a guest who tapped Join signed up or in and
 * is back on the game. Offer the spot once, with one tap, using the same join as
 * the footer button; a new player is then offered setup (#354: out of the screen).
 */
export function useJoinIntent(opts: {
  eventId: string
  userId: string | null
  event: EventWithDetails | undefined
  loading: boolean
  status: AttendanceStatus
  over: boolean
  requiresApproval: boolean
  attendance: EventAttendanceApi
}) {
  const { eventId, userId, event, loading, status, over, requiresApproval, attendance } = opts
  const setupNeeded = usePlayerSetupNeeded()
  const [joinIntent, setJoinIntent] = useState<{ stage: 'offer' | 'setup'; offer: JoinOffer } | null>(null)
  const checkedRef = useRef(false)
  useEffect(() => {
    if (checkedRef.current || !userId || !event || loading) return
    checkedRef.current = true
    const next = joinIntentOnReturn(takePendingAction(eventId), status, { cancelled: !!event.cancelled_at, over, requiresApproval })
    if (!next) return
    if ('outcome' in next) {
      track(ANALYTICS_EVENTS.joinIntentResumed, { outcome: next.outcome satisfies JoinIntentOutcome })
      return
    }
    setJoinIntent({ stage: 'offer', offer: next.offer })
  }, [userId, event, loading]) // eslint-disable-line react-hooks/exhaustive-deps -- once, when the signed-in view is ready

  async function confirm() {
    if (!joinIntent) return
    const run = joinIntent.offer === 'waitlist' ? attendance.joinWaitlist : joinIntent.offer === 'request' ? attendance.requestToJoin : attendance.join
    const row = await run()
    if (!row) { setJoinIntent(null); return } // failed: useEventAttendance already said so
    track(ANALYTICS_EVENTS.joinIntentResumed, { outcome: 'joined' satisfies JoinIntentOutcome, offer: joinIntent.offer })
    setJoinIntent(setupNeeded ? { ...joinIntent, stage: 'setup' } : null)
  }
  function dismiss() {
    if (joinIntent?.stage === 'offer') track(ANALYTICS_EVENTS.joinIntentResumed, { outcome: 'not_now' satisfies JoinIntentOutcome, offer: joinIntent.offer })
    setJoinIntent(null)
  }

  return {
    joinIntent,
    when: event ? joinIntentWhen(eventDateMs(event.event_date)) : '',
    confirm,
    dismiss,
    clear: () => setJoinIntent(null),
  }
}
