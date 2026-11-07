import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react-native'
import { MyEventsRail, railTimeLabel } from '../components/MyEventsRail'
import { EventWithDetails, MyEventStatus, MyUpcomingEvent } from '../types'

const NOW = Date.parse('2026-08-20T18:00:00Z')

function item(
  id: string,
  status: MyEventStatus,
  over: Partial<MyUpcomingEvent> & { event_date?: string } = {},
): MyUpcomingEvent {
  const { event_date, ...rest } = over
  return {
    event: {
      id,
      created_by: 'someone',
      title: `Event ${id}`,
      location: 'Roots',
      event_date: event_date ?? '2026-08-20T19:00:00',
      duration_minutes: 120,
      max_attendees: 12,
      price: 0,
      profiles: {} as any,
    } as EventWithDetails,
    status,
    waitlistPosition: null,
    inProgress: false,
    ...rest,
  }
}

describe('MyEventsRail', () => {
  const noop = () => {}

  it('renders nothing at all when the viewer is registered for nothing', () => {
    render(<MyEventsRail items={[]} onPressEvent={noop} onSeeAll={noop} nowMs={NOW} />)
    // No header, no empty-state card, no zero count — the pre-rail screen.
    expect(screen.queryByTestId('my-events-rail')).toBeNull()
  })

  it('renders a card per registered event', () => {
    render(
      <MyEventsRail
        items={[item('a', 'attending'), item('b', 'waitlisted')]}
        onPressEvent={noop}
        onSeeAll={noop}
        nowMs={NOW}
      />,
    )
    expect(screen.getByTestId('my-event-card-a')).toBeTruthy()
    expect(screen.getByTestId('my-event-card-b')).toBeTruthy()
  })

  it('caps the rail at 3 cards but counts them all in the header', () => {
    const items = ['a', 'b', 'c', 'd', 'e'].map(id => item(id, 'attending'))
    render(<MyEventsRail items={items} onPressEvent={noop} onSeeAll={noop} nowMs={NOW} />)
    expect(screen.getByTestId('my-event-card-c')).toBeTruthy()
    expect(screen.queryByTestId('my-event-card-d')).toBeNull()
    expect(screen.getByText("YOU'RE GOING · 5")).toBeTruthy()
  })

  it('hides "See all" when everything already fits', () => {
    render(
      <MyEventsRail items={[item('a', 'attending')]} onPressEvent={noop} onSeeAll={noop} nowMs={NOW} />,
    )
    expect(screen.queryByTestId('my-events-see-all')).toBeNull()
  })

  it('shows "See all" once there are more than 3 and fires the callback', () => {
    const onSeeAll = jest.fn()
    const items = ['a', 'b', 'c', 'd'].map(id => item(id, 'attending'))
    render(<MyEventsRail items={items} onPressEvent={noop} onSeeAll={onSeeAll} nowMs={NOW} />)
    fireEvent.press(screen.getByTestId('my-events-see-all'))
    expect(onSeeAll).toHaveBeenCalledTimes(1)
  })

  it('opens the event when a card is pressed', () => {
    const onPressEvent = jest.fn()
    render(
      <MyEventsRail items={[item('a', 'attending')]} onPressEvent={onPressEvent} onSeeAll={noop} nowMs={NOW} />,
    )
    fireEvent.press(screen.getByTestId('my-event-card-a'))
    expect(onPressEvent).toHaveBeenCalledWith('a')
  })

  it('shows the waitlist position, not just the status', () => {
    render(
      <MyEventsRail
        items={[item('a', 'waitlisted', { waitlistPosition: 2 })]}
        onPressEvent={noop}
        onSeeAll={noop}
        nowMs={NOW}
      />,
    )
    expect(screen.getByText('WAITLIST #2')).toBeTruthy()
  })

  it('falls back to WAITLISTED before the position is known', () => {
    render(
      <MyEventsRail items={[item('a', 'waitlisted')]} onPressEvent={noop} onSeeAll={noop} nowMs={NOW} />,
    )
    expect(screen.getByText('WAITLISTED')).toBeTruthy()
  })

  it('labels pending-approval and hosted events distinctly', () => {
    render(
      <MyEventsRail
        items={[item('a', 'requested'), item('b', 'hosting')]}
        onPressEvent={noop}
        onSeeAll={noop}
        nowMs={NOW}
      />,
    )
    expect(screen.getByText('PENDING')).toBeTruthy()
    expect(screen.getByText('HOSTING')).toBeTruthy()
  })
})

describe('railTimeLabel', () => {
  // The rail speaks the device's clock, so build times in the device's zone:
  // these hold whatever TZ the suite runs in. "Now" is Thu Aug 20, 1 PM local.
  const local = (d: number, h: number, m = 0) => new Date(2026, 7, d, h, m).toISOString()
  const LOCAL_NOW = new Date(2026, 7, 20, 13, 0).getTime()

  it('says TONIGHT for an event later today', () => {
    expect(railTimeLabel(local(20, 22), 120, LOCAL_NOW)).toBe('TONIGHT 10:00 PM')
  })

  it('says TOMORROW for the next day', () => {
    expect(railTimeLabel(local(21, 19), 120, LOCAL_NOW)).toBe('TOMORROW 7:00 PM')
  })

  it('shows a weekday and date further out', () => {
    expect(railTimeLabel(local(29, 19), 120, LOCAL_NOW)).toMatch(/^SAT AUG 29$/)
  })

  it('shows NOW and the end time once the event has started', () => {
    // Started 30 min ago, runs 120 → ends 90 min from now.
    expect(railTimeLabel(local(20, 12, 30), 120, LOCAL_NOW)).toBe('NOW · ends 2:30 PM')
  })
})
