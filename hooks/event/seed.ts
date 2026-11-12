import type { EventWithDetails } from '../../types'

/**
 * The feed row of an event the viewer just tapped, so the detail page can paint
 * its banner (title, time, place, tags) before EVENT_DETAIL_SELECT lands.
 *
 * Banner fields only: a list row carries attendee *counts*, not rows, so never
 * derive attendance or the join button from it. That is also why this is not
 * written into `eventKeys.root` (see keys.ts).
 */
const seeds = new Map<string, EventWithDetails>()
const MAX_SEEDS = 50

export function rememberEventCard(event: EventWithDetails): void {
  seeds.delete(event.id)
  seeds.set(event.id, event)
  if (seeds.size > MAX_SEEDS) seeds.delete(seeds.keys().next().value as string)
}

export function eventCardSeed(id: string): EventWithDetails | undefined {
  return seeds.get(id)
}
