import React from 'react'
import { render } from '@testing-library/react-native'
import { EventCard, RowEventCard } from '../components/EventCard'
import { friendsGoingFromAttendees } from '../utils/friends'
import { idsHash } from '../hooks/useFriendsGoing'
import type { EventAttendeeWithProfile, EventWithDetails, Friend, FriendGoing } from '../types'

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
  usePathname: () => '/',
}))
jest.mock('expo-image', () => ({ Image: () => null }))

const event = {
  id: 'e1', created_by: 'host', club_id: null, title: 'Open Play', description: null, location: 'Roots',
  event_date: '2030-01-15T19:00:00', duration_minutes: 120, max_attendees: 12, created_at: 'x', price: 0,
  cancelled_at: null, profiles: { id: 'host', username: 'host' } as EventWithDetails['profiles'], event_tags: [],
  clubs: null, event_attendees_attending: [{ count: 3 }], event_guests_attending: [{ count: 0 }], my_attendance: [],
} as unknown as EventWithDetails

const going = (id: string, first: string, best = false): FriendGoing => ({
  event_id: 'e1', user_id: id, username: `u_${id}`, first_name: first, avatar_url: '', is_best_friend: best,
})

describe.each([
  ['EventCard', EventCard],
  ['RowEventCard', RowEventCard],
])('%s friends going line', (_name, Card) => {
  it('shows "Ana and 2 friends going" with the best friend named first', () => {
    const view = render(<Card event={event} friendsGoing={[going('b', 'Ben'), going('c', 'Cy'), going('a', 'Ana', true)]} />)
    expect(view.getByText('Ana and 2 friends going')).toBeTruthy()
  })

  it('shows nothing without friends going (and for guests, who never get the prop)', () => {
    expect(render(<Card event={event} />).queryByTestId('friends-going')).toBeNull()
    expect(render(<Card event={event} friendsGoing={[]} />).queryByTestId('friends-going')).toBeNull()
  })
})

describe('friendsGoingFromAttendees', () => {
  const row = (user_id: string, status: string, joined_at: string, first: string): EventAttendeeWithProfile => ({
    event_id: 'e1', user_id, status, joined_at, team_number: null, team_pinned: false,
    profiles: { id: user_id, username: `u_${user_id}`, first_name: first, avatar_url: null } as EventAttendeeWithProfile['profiles'],
  }) as EventAttendeeWithProfile
  const friend = (id: string, best = false): Friend => ({ friend_id: id, is_best_friend: best, created_at: 'x', profile: null })

  it('keeps attending friends only, best first, then RSVP order', () => {
    const rows = [
      row('a', 'attending', '2026-01-01', 'Ana'),
      row('b', 'attending', '2026-01-02', 'Ben'),
      row('w', 'waitlisted', '2026-01-03', 'Wes'),
      row('s', 'attending', '2026-01-04', 'Stranger'),
      row('c', 'attending', '2026-01-05', 'Cy'),
    ]
    const result = friendsGoingFromAttendees('e1', rows, [friend('a'), friend('b'), friend('w'), friend('c', true)])
    expect(result.map(r => r.user_id)).toEqual(['c', 'a', 'b'])
    expect(result[0]).toMatchObject({ first_name: 'Cy', is_best_friend: true, event_id: 'e1' })
    expect(friendsGoingFromAttendees('e1', rows, [])).toEqual([])
  })
})

describe('idsHash', () => {
  it('is stable for the same ids and differs for different ones', () => {
    expect(idsHash(['a', 'b'])).toBe(idsHash(['a', 'b']))
    expect(idsHash(['a', 'b'])).not.toBe(idsHash(['a', 'c']))
    expect(idsHash([])).toBe('0-45h')
  })
})
