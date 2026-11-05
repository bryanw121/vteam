import React from 'react'
import { fireEvent, render } from '@testing-library/react-native'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { EventCard, RowEventCard } from '../components/EventCard'
import { EventDetailSkeleton } from '../components/event/EventDetailSkeleton'
import { eventCardSeed, rememberEventCard } from '../hooks/event/seed'
import type { EventWithDetails } from '../types'

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
  usePathname: () => '/',
}))
jest.mock('expo-image', () => ({ Image: () => null }))

function row(id: string, title = 'Open Play'): EventWithDetails {
  return {
    id, created_by: 'host', club_id: null, title, description: null, location: 'Roots',
    event_date: '2030-01-15T19:00:00', duration_minutes: 120, max_attendees: 12, created_at: 'x', price: 0,
    cancelled_at: null, profiles: { id: 'host', username: 'host' } as EventWithDetails['profiles'], event_tags: [],
    clubs: null, event_attendees_attending: [{ count: 3 }], event_guests_attending: [{ count: 0 }],
    my_attendance: [],
  } as unknown as EventWithDetails
}

describe('feed card seed', () => {
  it.each([
    ['EventCard', EventCard],
    ['RowEventCard', RowEventCard],
  ])('tapping a %s remembers its row for the detail page', (_name, Card) => {
    const view = render(<Card event={row(`tap-${_name}`, `Tapped ${_name}`)} currentUserId="me" onRsvp={jest.fn()} />)
    fireEvent.press(view.getByText(`Tapped ${_name}`))
    expect(eventCardSeed(`tap-${_name}`)?.title).toBe(`Tapped ${_name}`)
  })

  it('keeps the newest 50 and refreshes a re-tapped row', () => {
    for (let i = 0; i < 51; i++) rememberEventCard(row(`lru-${i}`))
    expect(eventCardSeed('lru-0')).toBeUndefined()
    expect(eventCardSeed('lru-50')).toBeDefined()
    rememberEventCard(row('lru-1', 'Renamed'))
    expect(eventCardSeed('lru-1')?.title).toBe('Renamed')
  })
})

describe('EventDetailSkeleton', () => {
  it('paints the real banner from the seed, so the title shows before the detail fetch', () => {
    const view = render(<EventDetailSkeleton seed={row('s1', 'Sunday Sand')} topInset={0} />)
    expect(view.getByTestId('event-hero-title').props.children).toBe('Sunday Sand')
  })

  it('shows a banner-shaped placeholder on a cold deep link', () => {
    const view = render(<EventDetailSkeleton topInset={0} />)
    expect(view.getByTestId('event-detail-skeleton')).toBeTruthy()
    expect(view.queryByTestId('event-hero-title')).toBeNull()
  })
})

describe('wiring', () => {
  const page = readFileSync(resolve(__dirname, '../app/(app)/event/[id].tsx'), 'utf8')

  it('the event page shows the skeleton, seeded from the tapped card, while loading', () => {
    expect(page).toMatch(/<EventDetailSkeleton seed=\{event \?\? eventCardSeed\(id\)\}/)
  })

  it('the seed never reaches the join footer or the roster', () => {
    expect(page).not.toMatch(/eventCardSeed\(id\)[^\n]*(JoinFooter|roster|attendance)/)
    expect(page.match(/eventCardSeed\(/g)).toHaveLength(1)
  })
})
