import { ANALYTICS_EVENTS } from '../../constants/analytics'
import { LEAVE_COPY, LEAVE_REASONS } from '../../constants'
import { track } from '../../lib/analytics'
import { toast } from '../../lib/toast'
import type { AttendanceStatus, EventAttendanceApi, EventWithDetails, LeaveReason } from '../../types'
import { leaveSheetContent, leaveSheetMetric } from '../../utils/eventDetail'
import { leaveDmText } from '../../utils/leaveConsequences'
import type { EventDialogApi } from './useEventDialog'

/**
 * Leaving a game (#171): the sheet's lines are frozen when it opens; on confirm the
 * leave happens first, then the optional note to the host (the leave stands whatever
 * happens to the message).
 */
export function useLeaveFlow(args: {
  event: EventWithDetails | null | undefined
  status: Pick<AttendanceStatus, 'count' | 'isFull' | 'spotsLeft' | 'waitlistCount'>
  userId: string | null
  isHostOrCohost: boolean
  paid: boolean
  hostName: string
  attendance: Pick<EventAttendanceApi, 'leave'>
  sendDm: (userId: string, text: string) => Promise<boolean>
  openDm: (userId: string) => Promise<unknown>
  dialog: EventDialogApi
}) {
  const { event, status, userId, isHostOrCohost, paid, hostName, attendance, sendDm, openDm, dialog } = args
  const sheet = dialog.dialog?.kind === 'leave' ? dialog.dialog : null

  function open() {
    if (!event) return
    const now = Date.now()
    track(ANALYTICS_EVENTS.leaveSheetShown, leaveSheetMetric(event, status, paid, now))
    dialog.open({ kind: 'leave', ...leaveSheetContent(event, status, { userId, isHostOrCohost, paid, hostName }, now) })
  }

  function cancel() {
    track(ANALYTICS_EVENTS.leaveCancelled)
    dialog.close()
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
    dialog.close()
    // undefined: the leave failed (useEventAttendance already alerted). The note waits for a real leave.
    if (left === undefined || !text) return
    if (!(await sendDm(event.created_by, text))) {
      const hostId = event.created_by
      toast.show({ message: LEAVE_COPY.dmFailed, variant: 'error', duration: 8000, action: { label: LEAVE_COPY.messageHost, onPress: () => { void openDm(hostId) } } })
    }
  }

  return { sheet, open, cancel, confirm }
}
