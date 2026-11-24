import { useState } from 'react'
import { ANALYTICS_EVENTS } from '../../constants/analytics'
import { LEAVE_COPY, LEAVE_REASONS } from '../../constants'
import { track } from '../../lib/analytics'
import { toast } from '../../lib/toast'
import { hostWillBeTold, leaveConsequences, leaveDmText, leaveSubtitle } from '../../utils/leaveConsequences'
import type { AttendanceStatus, EventAttendanceApi, EventWithDetails, LeaveConsequence, LeaveReason } from '../../types'

/**
 * The leave sheet (#171, #354: out of the screen). Its lines are frozen when it
 * opens, so the optimistic leave doesn't reshuffle them under the spinner; an
 * optional note goes to the host as a DM after a real leave.
 */
export function useLeaveFlow(opts: {
  event: EventWithDetails | undefined
  userId: string | null
  status: AttendanceStatus
  isHostOrCohost: boolean
  iPaid: boolean
  hostName: string
  attendance: EventAttendanceApi
  sendDm: (otherUserId: string, text: string) => Promise<boolean>
  openDm: (otherUserId: string) => Promise<unknown> | void
}) {
  const { event, userId, status, isHostOrCohost, iPaid, hostName, attendance, sendDm, openDm } = opts
  const [sheet, setSheet] = useState<{ subtitle: string; lines: LeaveConsequence[]; showReason: boolean } | null>(null)

  function open() {
    if (!event) return
    const now = Date.now()
    const lines = leaveConsequences({ ...event, hostName }, status, { isHostOrCohost, paid: iPaid }, now)
    const within24h = hostWillBeTold(event.event_date, now)
    track(ANALYTICS_EVENTS.leaveSheetShown, { full: status.isFull, within24h, paid: iPaid })
    setSheet({
      subtitle: leaveSubtitle(event.event_date, now),
      lines,
      // Only when the host is told anyway; then a reason gives it context.
      showReason: lines.some(l => l.kind === 'hostNotified') && !!event.created_by && event.created_by !== userId,
    })
  }

  function cancel() {
    track(ANALYTICS_EVENTS.leaveCancelled)
    setSheet(null)
  }

  async function confirm(reason: LeaveReason | null, note: string) {
    if (!event) return
    track(ANALYTICS_EVENTS.leaveConfirmed, { reason: reason ?? 'none' })
    const text = leaveDmText({
      title: event.title,
      eventDate: event.event_date,
      reasonLabel: LEAVE_REASONS.find(r => r.id === reason)?.label ?? null,
      note,
    })
    const left = await attendance.leave()
    setSheet(null)
    // undefined: the leave failed (useEventAttendance already alerted). The note waits for a real leave.
    if (left === undefined || !text) return
    // The leave stands whatever happens to the message.
    if (!(await sendDm(event.created_by, text))) {
      const hostId = event.created_by
      toast.show({ message: LEAVE_COPY.dmFailed, variant: 'error', duration: 8000, action: { label: LEAVE_COPY.messageHost, onPress: () => { void openDm(hostId) } } })
    }
  }

  return { sheet, open, cancel, confirm }
}
