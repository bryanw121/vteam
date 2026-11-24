import React from 'react'
import { JoinFooter } from './JoinFooter'
import { RecapFooter } from './RecapFooter'
import type { AttendanceStatus, EventAttendanceApi, EventRecapApi, EventWithDetails } from '../../types'

type Props = {
  event: EventWithDetails
  over: boolean
  status: AttendanceStatus
  attendance: EventAttendanceApi
  recap: EventRecapApi
  onLeave: () => void
  onAddGuest: () => void
  onGiveCheers: () => void
  docScrollActive: boolean
  bottomInset: number
  onHeightChange: (height: number) => void
}

/** The Details tab's bottom bar: Join / Leave while a game is ahead (or cancelled), the recap once it has been played (#227). */
export function EventFooter(p: Props) {
  const played = p.over && !p.event.cancelled_at
  return played ? (
    <RecapFooter
      attended={p.recap.attended}
      onShare={() => { void p.recap.share() }}
      onGiveCheers={p.onGiveCheers}
      sharing={p.recap.sharing}
      docScrollActive={p.docScrollActive}
      bottomInset={p.bottomInset}
      onHeightChange={p.onHeightChange}
    />
  ) : (
    <JoinFooter
      eventDate={p.event.event_date}
      eventStatus={p.status}
      // An explicit host setting; never inferred from price.
      requiresApproval={p.event.requires_approval === true}
      attendance={p.attendance}
      onLeave={p.onLeave}
      onAddGuest={p.onAddGuest}
      docScrollActive={p.docScrollActive}
      bottomInset={p.bottomInset}
      onHeightChange={p.onHeightChange}
    />
  )
}
