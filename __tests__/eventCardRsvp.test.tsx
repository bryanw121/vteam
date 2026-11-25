import React from 'react'
import { fireEvent, render } from '@testing-library/react-native'
import { EventCard, RowEventCard } from '../components/EventCard'
import type { EventWithDetails } from '../types'

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
  usePathname: () => '/',
}))
jest.mock('expo-image', () => ({ Image: () => null }))

function event(status: string | undefined, requiresApproval = false): EventWithDetails {
  return {
    requires_approval: requiresApproval,
    id: 'e1', created_by: 'host', club_id: null, title: 'Open Play', description: null, location: 'Roots',
    event_date: '2030-01-15T19:00:00', duration_minutes: 120, max_attendees: 12, created_at: 'x', price: 0,
    cancelled_at: null, profiles: { id: 'host', username: 'host' } as EventWithDetails['profiles'], event_tags: [],
    clubs: null, event_attendees_attending: [{ count: 3 }], event_guests_attending: [{ count: 0 }],
    my_attendance: status ? [{ user_id: 'me', status: status as 'attending' }] : [],
  } as EventWithDetails
}

describe.each([
  ['EventCard', EventCard],
  ['RowEventCard', RowEventCard],
])('%s RSVP button', (_name, Card) => {
  it.each([
    ['waitlisted', 'Waitlisted'],
    ['requested', 'Requested'],
  ])('shows a %s viewer a status, not Join, and never joins', (status, label) => {
    const onRsvp = jest.fn(async () => {})
    const view = render(<Card event={event(status)} currentUserId="me" onRsvp={onRsvp} />)
    expect(view.queryByText('Join')).toBeNull()
    fireEvent.press(view.getByText(label), { stopPropagation: () => {} })
    expect(onRsvp).not.toHaveBeenCalled()
  })

  it('still offers Join to a viewer with no row, and Going (leave) to an attendee', () => {
    const onRsvp = jest.fn(async () => {})
    const none = render(<Card event={event(undefined)} currentUserId="me" onRsvp={onRsvp} />)
    fireEvent.press(none.getByText('Join'), { stopPropagation: () => {} })
    expect(onRsvp).toHaveBeenLastCalledWith('e1', 'join')
    const going = render(<Card event={event('attending')} currentUserId="me" onRsvp={onRsvp} />)
    fireEvent.press(going.getByText('Going ✓'), { stopPropagation: () => {} })
    expect(onRsvp).toHaveBeenLastCalledWith('e1', 'leave')
  })

  it('never one-tap joins an approval-gated event; the pill opens the event instead', () => {
    const onRsvp = jest.fn(async () => {})
    const view = render(<Card event={event(undefined, true)} currentUserId="me" onRsvp={onRsvp} />)
    expect(view.queryByText('Join')).toBeNull()
    fireEvent.press(view.getByText('Needs approval'), { stopPropagation: () => {} })
    expect(onRsvp).not.toHaveBeenCalled()
  })

  it('still lets an attendee of an approval-gated event leave', () => {
    const onRsvp = jest.fn(async () => {})
    const view = render(<Card event={event('attending', true)} currentUserId="me" onRsvp={onRsvp} />)
    fireEvent.press(view.getByText('Going ✓'), { stopPropagation: () => {} })
    expect(onRsvp).toHaveBeenLastCalledWith('e1', 'leave')
  })
})
