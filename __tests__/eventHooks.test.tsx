import React from 'react'
import { Alert } from 'react-native'
import { act, render } from '@testing-library/react-native'
import { __resetQueryCache, invalidate } from '../lib/query'
import { eventKeys } from '../hooks/event/keys'
import { useEventData } from '../hooks/event/useEventData'
import { useEventAttendance } from '../hooks/event/useEventAttendance'
import { useEventComments } from '../hooks/event/useEventComments'
import type { EventAttendanceApi, EventCommentsApi, EventData } from '../types'
import { computeEventStatus, mergeAssignments, randomizeAssignments } from '../hooks/event/derive'
import { ATTENDEE_SELECT, COMMENT_SELECT, GENERIC_ERROR_MESSAGE } from '../constants'

/**
 * Real tests of the event-detail hooks against a chainable fake Supabase
 * client. Replaces the source-grep "wiring" assertions on event/[id].tsx.
 */

// ─── Fake Supabase: records every query, answers from `mockRespond` ──────────

type Op = [string, unknown[]]
type MockCall = { table: string; ops: Op[] }
type Res = { data: unknown; error: unknown }

const mockCalls: MockCall[] = []
let mockRespond: (call: MockCall) => Res | Promise<Res> = () => ({ data: null, error: null })

jest.mock('../lib/supabase', () => {
  const methods = ['select', 'eq', 'neq', 'insert', 'update', 'delete', 'order', 'in', 'or', 'limit', 'single', 'maybeSingle']
  return {
    supabase: {
      from: (table: string) => {
        const call = { table, ops: [] as [string, unknown[]][] }
        mockCalls.push(call)
        const builder: Record<string, unknown> = {}
        methods.forEach(m => {
          builder[m] = (...args: unknown[]) => {
            call.ops.push([m, args])
            return builder
          }
        })
        builder.then = (onFulfilled: (r: Res) => unknown, onRejected: (e: unknown) => unknown) =>
          Promise.resolve().then(() => mockRespond(call)).then(onFulfilled, onRejected)
        return builder
      },
    },
  }
})

let mockUserId: string | null = 'me'
const mockRequireSignIn = jest.fn(() => mockUserId !== null)
jest.mock('../contexts/session', () => ({
  useSession: () => ({ userId: mockUserId, isGuest: mockUserId === null, loading: false, session: null }),
}))
jest.mock('../hooks/useRequireSignIn', () => ({ useRequireSignIn: () => mockRequireSignIn }))
jest.mock('../lib/sentry', () => ({ Sentry: { addBreadcrumb: jest.fn(), captureException: jest.fn() } }))
// lib/query's useFocusRefetch needs a navigator; nothing here focuses.
jest.mock('expo-router', () => ({ useFocusEffect: () => {} }))

// ─── Fixtures + helpers ──────────────────────────────────────────────────────

const ME_PROFILE = {
  id: 'me', username: 'me', first_name: 'Me', last_name: 'Myself', avatar_url: null,
  selected_border: null, position: [], skill_level: null,
}

function eventRow(attendees: unknown[] = []) {
  return {
    id: 'e1', created_by: 'host', club_id: null, title: 'Friday Open Play', description: null,
    location: 'Roots', event_date: '2030-01-01T19:00:00', duration_minutes: 120, max_attendees: 12,
    created_at: '2029-12-01T00:00:00', price: null, venmo_handle: null,
    profiles: { id: 'host', username: 'host', first_name: 'Host', last_name: 'H', avatar_url: null, selected_border: null },
    event_attendees: attendees,
    event_tags: [],
  }
}

function attendeeRow(status: string, profiles: unknown = ME_PROFILE) {
  return { event_id: 'e1', user_id: 'me', joined_at: '2029-12-02T00:00:00', team_number: null, team_pinned: false, status, profiles }
}

function kind(call: MockCall): 'insert' | 'update' | 'delete' | 'select' {
  const names = call.ops.map(o => o[0])
  if (names.includes('insert')) return 'insert'
  if (names.includes('update')) return 'update'
  if (names.includes('delete')) return 'delete'
  return 'select'
}
const argsOf = (call: MockCall, op: string) => call.ops.find(o => o[0] === op)?.[1]
const callsTo = (table: string, k?: ReturnType<typeof kind>) =>
  mockCalls.filter(c => c.table === table && (!k || kind(c) === k))

type Handler = (call: MockCall) => Res | Promise<Res>
/** Default answers for the initial reads; `overrides` keyed `table:kind`. */
function router(overrides: Record<string, Handler> = {}): Handler {
  return call => {
    const o = overrides[`${call.table}:${kind(call)}`]
    if (o) return o(call)
    if (call.table === 'events') return { data: eventRow(), error: null }
    if (call.table === 'profiles') return { data: ME_PROFILE, error: null }
    return { data: [], error: null }
  }
}

function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>(r => { resolve = r })
  return { promise, resolve }
}

async function settle() {
  await act(async () => {
    for (let i = 0; i < 10; i++) await new Promise(r => setTimeout(r, 0))
  })
}

let api: { data: EventData; attendance: EventAttendanceApi; comments: EventCommentsApi }
function Harness() {
  const data = useEventData('e1')
  const attendance = useEventAttendance(data)
  const comments = useEventComments(data, { isHostOrCohost: false })
  api = { data, attendance, comments }
  return null
}

const status = () => computeEventStatus({
  event: api.data.event,
  rows: api.data.roster.rows,
  attendingGuestCount: api.data.roster.attendingGuests.length,
  userId: api.data.userId,
  isHostOrCohost: false,
})

let alertSpy: jest.SpyInstance
beforeEach(() => {
  __resetQueryCache()
  mockCalls.length = 0
  mockUserId = 'me'
  mockRespond = router()
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {})
})
afterEach(() => alertSpy.mockRestore())

// ─── useEventData ────────────────────────────────────────────────────────────

describe('useEventData', () => {
  it('starts every read in one parallel round — guests/co-hosts/comments do not wait on the event row', async () => {
    const eventResponse = deferred<Res>()
    mockRespond = router({ 'events:select': () => eventResponse.promise })
    render(<Harness />)

    // The event row has NOT answered yet, and every other read is already out.
    expect(mockCalls.map(c => c.table).sort()).toEqual(
      ['event_cohosts', 'event_comments', 'event_guests', 'events', 'profiles'],
    )
    expect(api.data.isLoading).toBe(true)

    eventResponse.resolve({ data: eventRow(), error: null })
    await settle()
    expect(api.data.isLoading).toBe(false)
    expect(api.data.event?.title).toBe('Friday Open Play')
    expect(mockCalls).toHaveLength(5) // nothing fetched twice
  })

  it('selects explicit columns (no *) and scopes each read to the event', async () => {
    render(<Harness />)
    await settle()
    for (const c of mockCalls) {
      const cols = String(argsOf(c, 'select')?.[0] ?? '')
      expect(cols).not.toMatch(/(^|,\s*)\*/)
    }
    expect(argsOf(callsTo('events')[0], 'eq')).toEqual(['id', 'e1'])
    expect(argsOf(callsTo('event_comments')[0], 'select')).toEqual([COMMENT_SELECT])
  })

  it('a guest makes the four event reads and no profile read', async () => {
    mockUserId = null
    render(<Harness />)
    await settle()
    // Signed-out visitors read +1s from the name-free view, never event_guests.
    expect(mockCalls.map(c => c.table).sort()).toEqual(['event_cohosts', 'event_comments', 'event_guests_attending', 'events'])
  })

  it('an edit elsewhere (invalidate of the event root) refetches every piece in place, without a spinner', async () => {
    render(<Harness />)
    await settle()
    mockCalls.length = 0
    mockRespond = router({ 'events:select': () => ({ data: { ...eventRow(), title: 'Renamed' }, error: null }) })

    act(() => invalidate(eventKeys.root('e1')))
    expect(api.data.isLoading).toBe(false) // old data stays on screen
    await settle()
    expect(mockCalls.map(c => c.table).sort()).toEqual(['event_cohosts', 'event_comments', 'event_guests', 'events'])
    expect(api.data.event?.title).toBe('Renamed')
  })

  it('reports a missing event as not found rather than loading forever', async () => {
    mockRespond = router({ 'events:select': () => ({ data: null, error: null }) })
    render(<Harness />)
    await settle()
    expect(api.data.isLoading).toBe(false)
    expect(api.data.notFound).toBe(true)
  })
})

// ─── useEventAttendance ──────────────────────────────────────────────────────

describe('useEventAttendance — join', () => {
  it('flips to attending immediately, then swaps in the server row (works before the viewer profile loads — audit #10)', async () => {
    const insert = deferred<Res>()
    mockRespond = router({
      'profiles:select': () => new Promise<Res>(() => {}), // viewer profile never arrives
      'event_attendees:insert': () => insert.promise,
    })
    render(<Harness />)
    await settle()
    expect(api.data.viewerProfile).toBeNull()

    act(() => { void api.attendance.join() })
    expect(status().isAttending).toBe(true) // optimistic
    expect(api.attendance.joining).toBe(true)

    const ins = callsTo('event_attendees', 'insert')[0]
    expect(argsOf(ins, 'insert')).toEqual([{ event_id: 'e1', user_id: 'me' }])
    expect(argsOf(ins, 'select')).toEqual([ATTENDEE_SELECT])
    expect(ins.ops.some(o => o[0] === 'single')).toBe(true)

    insert.resolve({ data: attendeeRow('attending'), error: null })
    await settle()
    expect(status().isAttending).toBe(true)
    expect(api.attendance.joining).toBe(false)
    // The embedded profile from the read-back puts the viewer on the roster.
    expect(api.data.roster.attendees.map(p => p.id)).toEqual(['me'])
    // No refetch of the event to learn what just happened.
    expect(callsTo('events')).toHaveLength(1)
  })

  it('rolls back and alerts when the insert fails', async () => {
    mockRespond = router({ 'event_attendees:insert': () => ({ data: null, error: { message: 'duplicate key' } }) })
    render(<Harness />)
    await settle()

    await act(async () => { await api.attendance.join() })
    expect(status().isAttending).toBe(false)
    expect(api.data.roster.rows).toHaveLength(0)
    expect(alertSpy).toHaveBeenCalledWith('Error', GENERIC_ERROR_MESSAGE)
  })

  it('reads back a waitlisted status when the last spot went first', async () => {
    mockRespond = router({ 'event_attendees:insert': () => ({ data: attendeeRow('waitlisted'), error: null }) })
    render(<Harness />)
    await settle()

    await act(async () => { await api.attendance.join() })
    expect(status().isAttending).toBe(false)
    expect(status().isWaitlisted).toBe(true)
    expect(status().waitlistPosition).toBe(1)
    expect(api.data.roster.waitlistProfiles.map(p => p.id)).toEqual(['me'])
    expect(alertSpy).toHaveBeenCalledWith('Event just filled up', expect.stringContaining('waitlist'))
  })

  it('ignores a second tap while the first join is in flight', async () => {
    const insert = deferred<Res>()
    mockRespond = router({ 'event_attendees:insert': () => insert.promise })
    render(<Harness />)
    await settle()

    act(() => { void api.attendance.join(); void api.attendance.join() })
    expect(callsTo('event_attendees', 'insert')).toHaveLength(1)
    insert.resolve({ data: attendeeRow('attending'), error: null })
    await settle()
  })

  it('sends a guest to sign in instead of writing', async () => {
    mockUserId = null
    render(<Harness />)
    await settle()
    await act(async () => { await api.attendance.join() })
    expect(mockRequireSignIn).toHaveBeenCalled()
    expect(callsTo('event_attendees', 'insert')).toHaveLength(0)
  })

  it('leave is optimistic and restores the row if the delete fails', async () => {
    const del = deferred<Res>()
    mockRespond = router({
      'events:select': () => ({ data: eventRow([attendeeRow('attending')]), error: null }),
      'event_attendees:delete': () => del.promise,
    })
    render(<Harness />)
    await settle()
    expect(status().isAttending).toBe(true)

    act(() => { void api.attendance.leave() })
    expect(status().isAttending).toBe(false)
    del.resolve({ data: null, error: { message: 'nope' } })
    await settle()
    expect(status().isAttending).toBe(true)
    expect(api.data.roster.attendees.map(p => p.id)).toEqual(['me'])
  })
})

// ─── useEventComments ────────────────────────────────────────────────────────

describe('useEventComments', () => {
  it('appends the inserted row (returned with its author) instead of refetching the thread', async () => {
    const newComment = {
      id: 'c1', event_id: 'e1', body: 'see you there', is_announcement: false, created_at: '2029-12-03T00:00:00',
      user_id: 'me', mentions: [], parent_id: null, edited_at: null, deleted_at: null,
      profiles: { id: 'me', username: 'me', first_name: 'Me', last_name: 'Myself', avatar_url: null, selected_border: null },
    }
    mockRespond = router({ 'event_comments:insert': () => ({ data: newComment, error: null }) })
    render(<Harness />)
    await settle()

    await act(async () => { await api.comments.post('see you there', false, []) })
    const ins = callsTo('event_comments', 'insert')[0]
    expect(argsOf(ins, 'select')).toEqual([COMMENT_SELECT])
    expect(api.comments.comments.map(c => c.id)).toEqual(['c1'])
    expect(callsTo('event_comments', 'select')).toHaveLength(1) // only the initial load
  })

  it('rejects (so the composer keeps the draft) and leaves the list alone when the insert fails', async () => {
    mockRespond = router({ 'event_comments:insert': () => ({ data: null, error: { message: 'rls' } }) })
    render(<Harness />)
    await settle()

    let rejected = false
    await act(async () => { await api.comments.post('hi', false, []).catch(() => { rejected = true }) })
    expect(rejected).toBe(true)
    expect(api.comments.comments).toHaveLength(0)
    expect(alertSpy).toHaveBeenCalledWith('Error', 'Could not post comment. Please try again.')
  })

  it('replaces an edited comment in place', async () => {
    const original = {
      id: 'c1', event_id: 'e1', body: 'old', is_announcement: false, created_at: '2029-12-03T00:00:00',
      user_id: 'me', mentions: [], parent_id: null, edited_at: null, deleted_at: null, profiles: null,
    }
    mockRespond = router({
      'event_comments:select': () => ({ data: [original], error: null }),
      'event_comments:update': () => ({ data: { ...original, body: 'new', edited_at: '2029-12-04T00:00:00' }, error: null }),
    })
    render(<Harness />)
    await settle()

    act(() => api.comments.setEditing(api.comments.comments[0]))
    await act(async () => { await api.comments.post('new', false, []) })
    expect(api.comments.comments.map(c => c.body)).toEqual(['new'])
    expect(api.comments.editing).toBeNull()
  })
})

// ─── Pure team helpers ───────────────────────────────────────────────────────

describe('mergeAssignments', () => {
  it("keeps the host's unsaved edits unless the server value moved", () => {
    const base = { a: { team: null, pinned: false }, b: { team: 1, pinned: false } }
    const local = { a: { team: 2, pinned: true }, b: { team: 2, pinned: false } }
    const server = { a: { team: null, pinned: false }, b: { team: 3, pinned: false }, c: { team: null, pinned: false } }
    expect(mergeAssignments(base, local, server)).toEqual({
      a: { team: 2, pinned: true }, // server unchanged → local draft wins
      b: { team: 3, pinned: false }, // server moved → server wins
      c: { team: null, pinned: false }, // new player
    })
  })
})

describe('randomizeAssignments', () => {
  it('refuses an uneven split', () => {
    const r = randomizeAssignments(['a', 'b', 'c'], {}, 2)
    expect(r.ok).toBe(false)
  })

  it('fills teams equally around pinned players', () => {
    const pinned = { a: { team: 1, pinned: true } }
    const r = randomizeAssignments(['a', 'b', 'c', 'd'], pinned, 2, () => 0.3)
    if (!r.ok) throw new Error('expected ok')
    const counts = Object.values(r.assignments).reduce<Record<number, number>>((m, x) => {
      m[x.team as number] = (m[x.team as number] ?? 0) + 1
      return m
    }, {})
    expect(counts).toEqual({ 1: 2, 2: 2 })
    expect(r.assignments.a).toEqual({ team: 1, pinned: true })
  })
})

// ─── Review fixes ────────────────────────────────────────────────────────────

describe('useEventCheers — revoke double tap', () => {
  it('a second revoke while one is in flight is skipped silently (no error alert)', async () => {
    const { useEventCheers } = require('../hooks/event/useEventCheers')
    const cheer = (receiver: string) => ({ id: receiver, event_id: 'e1', giver_id: 'me', receiver_id: receiver, cheer_type: 'mvp', created_at: 'x' })
    const held = deferred<Res>()
    mockRespond = router({
      'cheers:select': () => ({ data: [cheer('a'), cheer('b')], error: null }),
      'cheers:delete': () => held.promise,
    })
    let cheers!: { toggleCheer: (r: string, t: string) => void; myCheersGiven: unknown[] }
    function CheersHarness() {
      cheers = useEventCheers('e1', 'me', true)
      return null
    }
    render(<CheersHarness />)
    await settle()
    expect(cheers.myCheersGiven).toHaveLength(2)

    act(() => { cheers.toggleCheer('a', 'mvp') })
    act(() => { cheers.toggleCheer('b', 'mvp') })
    await settle()
    expect(callsTo('cheers', 'delete')).toHaveLength(1)
    expect(alertSpy).not.toHaveBeenCalled()

    await act(async () => { held.resolve({ data: null, error: null }) })
    await settle()
    expect(alertSpy).not.toHaveBeenCalled()
  })
})

describe('forgetDeletedEvent', () => {
  it('drops every event:<id> entry and invalidates the feed and club pages', async () => {
    const q = require('../lib/query')
    const { eventKeys, forgetDeletedEvent } = require('../hooks/event/keys')
    q.setQueryData(eventKeys.root('e1'), { id: 'e1' })
    q.setQueryData(eventKeys.comments('e1'), [])
    q.setQueryData(eventKeys.root('e10'), { id: 'e10' })
    let feedFetches = 0
    let clubFetches = 0
    function ListReaders() {
      q.useQuery('feed:month:2030-01', async () => { feedFetches++; return [] })
      q.useQuery('club:c1:detail:me', async () => { clubFetches++; return {} })
      return null
    }
    render(<ListReaders />)
    await settle()
    expect([feedFetches, clubFetches]).toEqual([1, 1])

    act(() => forgetDeletedEvent('e1'))
    await settle()
    expect(q.getQueryData(eventKeys.root('e1'))).toBeUndefined()
    expect(q.getQueryData(eventKeys.comments('e1'))).toBeUndefined()
    expect(q.getQueryData(eventKeys.root('e10'))).toEqual({ id: 'e10' })
    expect([feedFetches, clubFetches]).toEqual([2, 2])
  })

  it('is what the event page runs after a successful delete', () => {
    const { readFileSync } = require('fs')
    const { join } = require('path')
    const screen: string = readFileSync(join(__dirname, '..', 'app/(app)/event/[id].tsx'), 'utf8')
    const del = screen.slice(screen.indexOf('const deleteEvent = useMutation('))
    const onSuccess = del.slice(del.indexOf('onSuccess'), del.indexOf('onError'))
    expect(onSuccess).toMatch(/forgetDeletedEvent\(id\)/)
  })
})
