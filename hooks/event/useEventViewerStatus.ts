import { computeEventStatus, paymentVisibility } from './derive'
import { useMyDenialReason } from './useMyDenialReason'
import { useEventPayments } from './useEventPayments'
import type { EventData } from '../../types'

/**
 * Where the viewer stands on this event (#354: out of the screen): attending,
 * waitlisted, requested or denied (with the host's reason, which is private and
 * read separately), and the "I've paid" state for paid events (#6), loaded only
 * for the attendee and the hosts.
 */
export function useEventViewerStatus(data: EventData, isHostOrCohost: boolean) {
  const { event, userId, roster } = data
  const derived = computeEventStatus({ event, rows: roster.rows, attendingGuestCount: roster.attendingGuests.length, userId, isHostOrCohost })
  const myDenialReason = useMyDenialReason(data.id, userId, derived.isDenied)
  const status = derived.isDenied && !derived.denialReason ? { ...derived, denialReason: myDenialReason } : derived
  const paymentAccess = paymentVisibility({ event, userId, status, isHostOrCohost })
  const payments = useEventPayments(data.id, userId, {
    enabled: paymentAccess.canToggle || paymentAccess.canSeeAll,
    onRoster: status.isAttending || status.isWaitlisted,
  })
  return { status, paymentAccess, payments }
}
