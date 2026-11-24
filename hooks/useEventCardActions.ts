import { useState } from 'react'
import { usePathname, useRouter } from 'expo-router'
import { routes } from '../utils/routes'
import { rememberEventCard } from './event/seed'
import type { EventCardRsvpHandler, EventWithDetails } from '../types'

/**
 * What tapping an event card does (#360), for both layouts: open the event (or
 * the tournament), seeding the event screen from the card; and the RSVP button's
 * in-flight state (`rsvpPending` from the parent survives a remount, the local
 * tap doesn't).
 */
export function useEventCardActions(
  event: EventWithDetails,
  { from, onRsvp, rsvpPending = false }: { from?: string; onRsvp?: EventCardRsvpHandler; rsvpPending?: boolean },
) {
  const router = useRouter()
  const pathname = usePathname()
  const [tapped, setTapped] = useState(false)
  const rsvpLoading = tapped || rsvpPending

  function open() {
    if (!event._isTournament) rememberEventCard(event)
    router.push(event._isTournament ? routes.tournament(event.id) : routes.eventFrom(event.id, from ?? pathname))
  }

  async function rsvp(isAttending: boolean) {
    if (!onRsvp || rsvpLoading) return
    setTapped(true)
    try { await onRsvp(event.id, isAttending ? 'leave' : 'join') } finally { setTapped(false) }
  }

  return { open, rsvp, rsvpLoading }
}
