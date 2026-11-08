import React from 'react'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { fireEvent, render } from '@testing-library/react-native'
import { resolveJoinAction } from '../hooks/event/derive'
import { JoinFooter } from '../components/event/JoinFooter'
import { APPROVAL_REQUIRED_NOTE } from '../constants'
import { EVENT_LIST_EVENT_COLUMNS } from '../constants/events'
import { EVENT_DETAIL_COLUMNS, EVENT_EDIT_SELECT } from '../constants/selects'
import type { AttendanceStatus, EventAttendanceApi, JoinAction, JoinActionState } from '../types'

const base: JoinActionState = {
  isAttending: false,
  isWaitlisted: false,
  isRequested: false,
  isDenied: false,
  isFull: false,
  requiresApproval: false,
}

const at = (over: Partial<JoinActionState>) => resolveJoinAction({ ...base, ...over })
const source = (rel: string) => readFileSync(resolve(__dirname, '..', rel), 'utf8')

describe('resolveJoinAction: approval is independent of price', () => {
  it('offers a plain join on an open event with space', () => {
    expect(at({})).toBe('join')
  })

  it('offers a request when the host requires approval', () => {
    // Impossible for a free event before: approval was inferred from price.
    expect(at({ requiresApproval: true })).toBe('request')
  })
})

describe('resolveJoinAction: capacity beats approval', () => {
  it('waitlists a full event that requires approval', () => {
    // The regression: the old chain tested paid-ness first, so this returned
    // "request" and the waitlist was unreachable past max_attendees.
    expect(at({ isFull: true, requiresApproval: true })).toBe('waitlist')
  })

  it('waitlists a full event that does not require approval', () => {
    expect(at({ isFull: true })).toBe('waitlist')
  })
})

describe('resolveJoinAction: an existing row wins over everything', () => {
  const overrides: Array<[Partial<JoinActionState>, JoinAction]> = [
    [{ isAttending: true }, 'leave'],
    [{ isWaitlisted: true }, 'leave-waitlist'],
    [{ isRequested: true }, 'cancel-request'],
    [{ isDenied: true }, 'rerequest'],
  ]

  it.each(overrides)('%o resolves to %s regardless of capacity or approval', (over, expected) => {
    for (const isFull of [true, false]) {
      for (const requiresApproval of [true, false]) {
        expect(at({ ...over, isFull, requiresApproval })).toBe(expected)
      }
    }
  })

  it('prefers attending over a stale waitlist flag', () => {
    expect(at({ isAttending: true, isWaitlisted: true })).toBe('leave')
  })

  it('prefers a pending request over a previous denial', () => {
    expect(at({ isRequested: true, isDenied: true })).toBe('cancel-request')
  })

  it('returns a valid action for all 64 flag combinations', () => {
    const flags = ['isAttending', 'isWaitlisted', 'isRequested', 'isDenied', 'isFull', 'requiresApproval'] as const
    const valid: JoinAction[] = ['leave', 'leave-waitlist', 'cancel-request', 'rerequest', 'waitlist', 'request', 'join']
    for (let mask = 0; mask < 1 << flags.length; mask++) {
      const s = { ...base }
      flags.forEach((f, i) => { s[f] = Boolean(mask & (1 << i)) })
      expect(valid).toContain(resolveJoinAction(s))
    }
  })
})

describe('JoinFooter', () => {
  const status = (over: Partial<AttendanceStatus> = {}): AttendanceStatus => ({
    count: 3, spotsLeft: 9, isFull: false, isAttending: false, isOwner: false, isWaitlisted: false,
    waitlistPosition: null, waitlistCount: 0, isRequested: false, isDenied: false, denialReason: null,
    ...over,
  })
  const api = () => ({
    joining: false,
    join: jest.fn(async () => {}),
    leave: jest.fn(async () => {}),
    joinWaitlist: jest.fn(async () => {}),
    leaveWaitlist: jest.fn(async () => {}),
    requestToJoin: jest.fn(async () => {}),
    cancelRequest: jest.fn(async () => {}),
    rerequest: jest.fn(async () => {}),
  })
  const renderFooter = (eventStatus: AttendanceStatus, requiresApproval: boolean, attendance = api(), onLeave = jest.fn()) => ({
    attendance,
    onLeave,
    view: render(
      <JoinFooter
        eventDate="2026-09-09T22:35:00"
        eventStatus={eventStatus}
        requiresApproval={requiresApproval}
        attendance={attendance as unknown as EventAttendanceApi}
        onLeave={onLeave}
        onAddGuest={() => {}}
        docScrollActive={false}
        bottomInset={0}
        onHeightChange={() => {}}
      />,
    ),
  })

  it('asks for a request and says the host reviews it, before the player taps', () => {
    const { view, attendance } = renderFooter(status(), true)
    expect(view.getByText(APPROVAL_REQUIRED_NOTE)).toBeTruthy()
    fireEvent.press(view.getByText('Request to Join'))
    expect(attendance.requestToJoin).toHaveBeenCalled()
    expect(attendance.join).not.toHaveBeenCalled()
  })

  it('joins instantly when approval is off, with no disclosure line', () => {
    const { view, attendance } = renderFooter(status(), false)
    expect(view.queryByText(APPROVAL_REQUIRED_NOTE)).toBeNull()
    fireEvent.press(view.getByText('Join event'))
    expect(attendance.join).toHaveBeenCalled()
  })

  it('restates the start time above every sign-up button, and only there', () => {
    const signup = /^You're signing up for \w{3}, \w{3} \d{1,2} · \d{1,2}:\d{2} (AM|PM)$/
    expect(renderFooter(status(), false).view.getByText(signup)).toBeTruthy()
    expect(renderFooter(status(), true).view.getByText(signup)).toBeTruthy()
    expect(renderFooter(status({ isFull: true, spotsLeft: 0 }), false).view.getByText(signup)).toBeTruthy()
    expect(renderFooter(status({ isAttending: true }), false).view.queryByText(signup)).toBeNull()
  })

  it('Leave event opens the leave sheet instead of leaving at once (#171)', () => {
    const { view, attendance, onLeave } = renderFooter(status({ isAttending: true }), false)
    fireEvent.press(view.getByTestId('leave-event'))
    expect(onLeave).toHaveBeenCalledTimes(1)
    expect(attendance.leave).not.toHaveBeenCalled()
  })

  it('leaving the waitlist and cancelling a request stay one tap', () => {
    const waitlisted = renderFooter(status({ isWaitlisted: true, waitlistPosition: 2 }), false)
    fireEvent.press(waitlisted.view.getByText('Leave Waitlist'))
    expect(waitlisted.attendance.leaveWaitlist).toHaveBeenCalled()
    expect(waitlisted.onLeave).not.toHaveBeenCalled()
    const requested = renderFooter(status({ isRequested: true }), true)
    fireEvent.press(requested.view.getByText('Cancel Request'))
    expect(requested.attendance.cancelRequest).toHaveBeenCalled()
    expect(requested.onLeave).not.toHaveBeenCalled()
  })

  it('offers the waitlist on a full approval-gated event', () => {
    const { view } = renderFooter(status({ isFull: true, spotsLeft: 0 }), true)
    expect(view.getByText('Join Waitlist')).toBeTruthy()
    expect(view.queryByText('Request to Join')).toBeNull()
  })
})

describe('wiring: approval comes from the column, never from price', () => {
  const eventPage = source('components/event/EventDetailScreen.tsx')
  const footer = source('components/event/JoinFooter.tsx')

  it('the event page reads requires_approval from the event row', () => {
    expect(eventPage).toMatch(/requiresApproval\s*=\s*event\?\.requires_approval/)
    expect(eventPage).not.toMatch(/isPaidEvent/)
    expect(eventPage).not.toMatch(/requiresApproval\s*=\s*\(?event\?\.price/)
  })

  it('the footer delegates the branch order to resolveJoinAction', () => {
    expect(footer).toMatch(/resolveJoinAction\(/)
    expect(footer).not.toMatch(/\.price\b|isPaid/)
  })

  it('the detail and feed selects carry requires_approval', () => {
    expect(EVENT_DETAIL_COLUMNS).toMatch(/\brequires_approval\b/)
    expect(EVENT_LIST_EVENT_COLUMNS).toMatch(/\brequires_approval\b/)
  })
})

describe('host form persists the approval choice', () => {
  const host = source('app/(app)/host.tsx')

  it('writes requires_approval on both create and edit', () => {
    expect(host.match(/requires_approval: form\.requiresApproval/g) ?? []).toHaveLength(2)
  })

  it('selects and hydrates it when editing', () => {
    expect(EVENT_EDIT_SELECT).toMatch(/\brequires_approval\b/)
    expect(host).toMatch(/\.select\(EVENT_EDIT_SELECT\)/)
    expect(host).toMatch(/requiresApproval: data\.requires_approval/)
  })

  it('defaults new events to no approval, independent of price', () => {
    expect(host).toMatch(/requiresApproval: false/)
  })

  it('renders a switch bound to the form field', () => {
    expect(host).toMatch(/value=\{form\.requiresApproval\}/)
    expect(host).toMatch(/setField\('requiresApproval'/)
  })
})
