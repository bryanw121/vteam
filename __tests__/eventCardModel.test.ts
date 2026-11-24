import { theme } from '../constants/theme'
import { awaitingLabel, cardDateParts, eventCardModel, isAttendingRow } from '../utils/eventCardModel'
import { localDate } from './helpers/clock'
import type { EventWithDetails, Tag } from '../types'

function tag(id: string, name: string, category: string, order: number): { tags: Tag } {
  return { tags: { id, name, category, display_order: order } as Tag }
}

function event(over: Partial<EventWithDetails> = {}): EventWithDetails {
  return {
    id: 'e1', created_by: 'host', club_id: null, title: 'Open Play', description: null, location: 'Roots',
    event_date: localDate(2030, 1, 15, 19, 5).toISOString(), duration_minutes: 120, max_attendees: 12, created_at: 'x', price: 0,
    requires_approval: false, cancelled_at: null, profiles: null, event_tags: [], clubs: null,
    event_attendees_attending: [{ count: 3 }], event_guests_attending: [{ count: 0 }],
    ...over,
  } as unknown as EventWithDetails
}

describe('eventCardModel (#360)', () => {
  it('counts players, spots left and the bar', () => {
    const m = eventCardModel(event(), null)
    expect(m.attendeeCount).toBe(3)
    expect(m.spotsLeft).toBe(9)
    expect(m.isFull).toBe(false)
    expect(m.fillRatio).toBeCloseTo(0.25)
  })

  it('counts +1 guests and says Full at capacity', () => {
    const m = eventCardModel(event({ max_attendees: 4, event_guests_attending: [{ count: 1 }] } as Partial<EventWithDetails>), null)
    expect(m.attendeeCount).toBe(4)
    expect(m.spotsLeft).toBe(0)
    expect(m.isFull).toBe(true)
    expect(m.fillRatio).toBe(1)
  })

  it('has no spots or bar fill without a cap', () => {
    const m = eventCardModel(event({ max_attendees: null }), null)
    expect(m.spotsLeft).toBeNull()
    expect(m.isFull).toBe(false)
    expect(m.fillRatio).toBe(0)
  })

  it('sorts type and skill tags and picks the tournament accent', () => {
    const m = eventCardModel(event({ event_tags: [
      tag('b', 'Advanced', 'skill_level', 3), tag('t', 'Tournament', 'event_type', 2), tag('a', 'Intermediate', 'skill_level', 1),
    ] } as Partial<EventWithDetails>), null)
    expect(m.typeTags.map(t => t.name)).toEqual(['Tournament'])
    expect(m.skillTags.map(t => t.name)).toEqual(['Intermediate', 'Advanced'])
    expect(m.isTournament).toBe(true)
    expect(m.accent).toBe(theme.colors.warm)
    const plain = eventCardModel(event({ event_tags: [tag('o', 'Open Play', 'event_type', 1)] } as Partial<EventWithDetails>), null)
    expect(plain.isTournament).toBe(false)
    expect(plain.accent).toBe(theme.colors.primary)
  })

  it('handles an event with no tags at all', () => {
    const m = eventCardModel(event({ event_tags: undefined } as Partial<EventWithDetails>), null)
    expect(m.typeTags).toEqual([])
    expect(m.skillTags).toEqual([])
  })

  it('shows three avatars and the rest as +N', () => {
    const previews = ['a', 'b', 'c', 'd'].map(id => ({ user_id: id, profiles: null }))
    const m = eventCardModel(event({ attendee_previews: previews, event_attendees_attending: [{ count: 7 }] } as Partial<EventWithDetails>), null)
    expect(m.previews.map(p => p.user_id)).toEqual(['a', 'b', 'c'])
    expect(m.overflow).toBe(4)
  })

  it('attending comes from my own row, never from a waitlisted one', () => {
    expect(eventCardModel(event({ my_attendance: [{ user_id: 'me', status: 'attending' }] } as Partial<EventWithDetails>), 'me').isAttending).toBe(true)
    const waiting = eventCardModel(event({ my_attendance: [{ user_id: 'me', status: 'waitlisted' }] } as Partial<EventWithDetails>), 'me')
    expect(waiting.isAttending).toBe(false)
    expect(waiting.awaiting).toBe('Waitlisted')
    // Older rows without a status are attending; without my_attendance, the previews decide.
    expect(isAttendingRow({})).toBe(true)
    expect(eventCardModel(event({ attendee_previews: [{ user_id: 'me', profiles: null }] } as Partial<EventWithDetails>), 'me').isAttending).toBe(true)
    expect(eventCardModel(event(), null).isAttending).toBe(false)
  })

  it('never offers one-tap RSVP on an approval-gated event', () => {
    expect(awaitingLabel(event({ requires_approval: true }), 'me', false)).toBe('Needs approval')
    expect(awaitingLabel(event({ requires_approval: true, my_attendance: [{ user_id: 'me', status: 'denied' }] } as Partial<EventWithDetails>), 'me', false)).toBe('Denied')
    expect(awaitingLabel(event({ requires_approval: true }), 'me', true)).toBeNull()
    expect(awaitingLabel(event({ my_attendance: [{ user_id: 'me', status: 'requested' }] } as Partial<EventWithDetails>), 'me', false)).toBe('Requested')
    expect(awaitingLabel(event({ requires_approval: true }), null, false)).toBeNull()
  })

  it('writes the day, date and time in the device zone, across a DST change', () => {
    expect(cardDateParts(localDate(2030, 1, 15, 19, 5).toISOString())).toEqual({ day: 'TUE', date: 15, time: '7:05 PM' })
    expect(cardDateParts(localDate(2026, 11, 1, 0, 30).toISOString())).toEqual({ day: 'SUN', date: 1, time: '12:30 AM' })
    expect(cardDateParts(localDate(2026, 3, 8, 12, 0).toISOString())).toEqual({ day: 'SUN', date: 8, time: '12:00 PM' })
  })

  it('names the surface', () => {
    expect(eventCardModel(event({ surface: 'sand' } as Partial<EventWithDetails>), null).surfaceLabel).toBe('Sand')
    expect(eventCardModel(event(), null).surfaceLabel).toBeNull()
  })
})
