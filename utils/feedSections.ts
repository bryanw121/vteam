/**
 * What a player sees in the Events feed (#217 part 2): the loaded rows,
 * filtered by type, surface and region, grouped into local days, with hidden
 * items counted per day and kept out unless that day (or its month) is
 * revealed. Pure, so the rules run without mounting the screen.
 */
import { eventLocalDateKey, surfaceOf } from './index'
import type { EventWithDetails, FeedDaySection, FeedFilter, FeedSectionOptions } from '../types'

export function matchesFeedType(event: EventWithDetails, filter: FeedFilter): boolean {
  if (filter === 'all') return true
  const tags = event.event_tags?.map(et => et.tags.name.toLowerCase()) ?? []
  if (filter === 'open_play') return tags.some(t => t.includes('open play') || t.includes('open-play'))
  if (filter === 'tournament') return tags.some(t => t.includes('tournament'))
  return true
}

export function buildFeedSections(
  events: readonly EventWithDetails[],
  { filter, surface, region, isHidden, revealed }: FeedSectionOptions,
): { sections: FeedDaySection[]; hiddenItemIds: Set<string> } {
  const filtered = events.filter(event => {
    // Outside sessions (Schelagg) only for the viewer's region: home city, else the pilot default.
    if (event._external && event._external.region !== region) return false
    if (surface !== 'any' && surfaceOf(event) !== surface) return false
    return matchesFeedType(event, filter)
  })
  const grouped: Record<string, FeedDaySection> = {}
  const hiddenItemIds = new Set<string>()
  for (const event of [...filtered].sort((a, b) => a.event_date.localeCompare(b.event_date))) {
    // Local date, so the section header matches the time shown on the event
    // card, and the calendar dot, which uses the same helper.
    const date = eventLocalDateKey(event.event_date)
    const section = grouped[date] ??= {
      date, data: [], hiddenCount: 0, revealed: revealed.has(date) || revealed.has(date.substring(0, 7)),
    }
    if (isHidden(event)) {
      section.hiddenCount += 1
      hiddenItemIds.add(event.id)
      if (!section.revealed) continue
    }
    section.data.push(event)
  }
  const sections = Object.values(grouped).sort((a, b) => a.date.localeCompare(b.date))
  return { sections, hiddenItemIds }
}
