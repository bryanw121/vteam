import React from 'react'
import { Alert } from 'react-native'
import { act, render } from '@testing-library/react-native'
import { __resetQueryCache, getQueryData, invalidate, setQueryData, useQuery } from '../lib/query'
import { eventKeys } from '../hooks/event/keys'
import { EVENT_JUST_FILLED_BODY, EVENT_JUST_FILLED_TITLE, GENERIC_ERROR_MESSAGE } from '../constants/copy'
import {
  __resetFeedState,
  feedMonthKey,
  useFeedRsvp,
  useMonthEvents,
  withMyAttendance,
} from '../hooks/useMonthEvents'
import { addMonths } from '../utils/monthKeys'
import { localDateKey } from '../utils'
import type { EventWithDetails } from '../types'

// ─── Mocks ───────────────────────────────────────────────────────────────────

let mockFocusCallback: (() => void) | null = null
jest.mock('expo-router', () => ({
  useFocusEffect: (cb: () => void) => { mockFocusCallback = cb },
}))

const mockSession = { userId: 'me' as string | null, isGuest: false, loading: false, session: null }
jest.mock('../contexts/session', () => ({ useSession: () => mockSession }))

jest.mock('../lib/sessionUser', () => ({
  getSessionUser: async () => (mockSession.userId ? { id: mockSession.userId } : null),
}))

type Result = { data?: unknown; error?: { message: string; code?: string } | null }
/** Per-table response; a function is called once per query, so it can change between mockCalls. */
const mockResponses: Record<string, Result | (() => Result | Promise<Result>)> = {}
const mockCalls: Array<{ table: string; ops: Array<[string, unknown[]]> }> = []
let mockRpcImpl: () => Promise<Result> = async () => ({ data: [], error: null })
/** `get_feed_span`: not deployed by default, so the tests above exercise the three-query fallback. */
const FEED_RPC_MISSING: Result = { data: null, error: { message: 'Could not find the function public.get_feed_span', code: 'PGRST202' } }
let mockFeedRpcImpl: (args: Record<string, unknown>) => Promise<Result> = async () => FEED_RPC_MISSING
const mockRpcCalls: Array<{ name: string; args: Record<string, unknown> }> = []

function mockChain(table: string) {
  const record = { table, ops: [] as Array<[string, unknown[]]> }
  mockCalls.push(record)
  const c: Record<string, unknown> = {}
  for (const op of ['select', 'gte', 'lt', 'is', 'order', 'eq', 'neq', 'insert', 'delete', 'single']) {
    c[op] = (...args: unknown[]) => {
      record.ops.push([op, args])
      return c
    }
  }
  c.then = (onRes: (r: Result) => unknown, onRej: (e: unknown) => unknown) => {
    const r = mockResponses[table] ?? { data: [], error: null }
    return Promise.resolve(typeof r === 'function' ? r() : r).then(onRes, onRej)
  }
  return c
}

jest.mock('../lib/supabase', () => ({
  supabase: {
    from: (table: string) => mockChain(table),
    rpc: (name: string, args: Record<string, unknown>) => {
      mockRpcCalls.push({ name, args })
      return name === 'get_feed_span' ? mockFeedRpcImpl(args) : mockRpcImpl()
    },
  },
}))

// ─── Helpers ─────────────────────────────────────────────────────────────────

const THIS_MONTH = localDateKey(new Date()).substring(0, 7)
const NEXT_MONTH = addMonths(THIS_MONTH, 1)

function eventRow(id: string, month = NEXT_MONTH, over: Partial<EventWithDetails> = {}): EventWithDetails {
  return {
    id,
    created_by: 'host',
    club_id: null,
    title: `Event ${id}`,
    description: null,
    location: 'Roots',
    event_date: `${month}-15T19:00:00`,
    duration_minutes: 120,
    max_attendees: 12,
    created_at: '2026-01-01T00:00:00',
    price: 0,
    cancelled_at: null,
    profiles: { id: 'host', username: 'host' } as EventWithDetails['profiles'],
    event_tags: [],
    clubs: null,
    event_attendees_attending: [{ count: 3 }],
    event_guests_attending: [{ count: 0 }],
    my_attendance: [],
    ...over,
  } as EventWithDetails
}

const eventQueries = () => mockCalls.filter(c => c.table === 'events')

async function flush(times = 3) {
  for (let i = 0; i < times; i++) {
    await act(async () => { await new Promise(r => setTimeout(r, 0)) })
  }
}

let feed: ReturnType<typeof useMonthEvents>
let rsvp: ReturnType<typeof useFeedRsvp>
function Probe() {
  feed = useMonthEvents()
  rsvp = useFeedRsvp()
  return null
}

beforeEach(() => {
  __resetQueryCache()
  __resetFeedState()
  for (const k of Object.keys(mockResponses)) delete mockResponses[k]
  mockCalls.length = 0
  mockRpcImpl = async () => ({ data: [], error: null })
  mockFeedRpcImpl = async () => FEED_RPC_MISSING
  mockRpcCalls.length = 0
  mockSession.userId = 'me'
  mockFocusCallback = null
  jest.restoreAllMocks()
  jest.spyOn(console, 'warn').mockImplementation(() => {})
  jest.spyOn(console, 'error').mockImplementation(() => {})
})

// ─── Feed ────────────────────────────────────────────────────────────────────

describe('useMonthEvents', () => {
  it('batches a month span into one query per table and buckets by month', async () => {
    mockResponses.events = { data: [eventRow('a'), eventRow('b', addMonths(NEXT_MONTH, 1))], error: null }
    render(<Probe />)
    act(() => feed.loadMonthSpan(NEXT_MONTH, addMonths(NEXT_MONTH, 2)))
    await flush()

    expect(eventQueries()).toHaveLength(1)
    expect(mockCalls.filter(c => c.table === 'tournaments')).toHaveLength(1)
    expect(mockCalls.filter(c => c.table === 'external_sessions')).toHaveLength(1)
    expect(feed.events.map(e => e.id)).toEqual(['a', 'b'])
    expect(getQueryData<EventWithDetails[]>(feedMonthKey(NEXT_MONTH))?.map(e => e.id)).toEqual(['a'])
    expect(feed.loadedMonths).toEqual([NEXT_MONTH, addMonths(NEXT_MONTH, 1), addMonths(NEXT_MONTH, 2)])
    // The last month came back empty → nothing further to scroll into.
    expect(feed.reachedEnd).toBe(true)
    expect(feed.loading).toBe(false)
  })

  it('leaves out items that have already ended, but keeps upcoming ones and items with no known end', async () => {
    const at = (ms: number) => new Date(ms).toISOString().slice(0, 19) // event_date: UTC without a zone
    const now = Date.now()
    const ended = eventRow('ended', THIS_MONTH, { event_date: at(now - 3 * 3600_000), duration_minutes: 60 })
    const later = eventRow('later', THIS_MONTH, { event_date: at(now + 3600_000), duration_minutes: 60 })
    const noEnd = eventRow('no-end', THIS_MONTH, { event_date: at(now + 7200_000), duration_minutes: 0 })
    mockResponses.events = { data: [ended, later, noEnd], error: null }
    render(<Probe />)
    const months = [...new Set([ended, later, noEnd].map(e => e.event_date.slice(0, 7)))].sort()
    act(() => feed.loadMonthSpan(months[0], addMonths(months[months.length - 1], 1)))
    await flush()
    expect(feed.events.map(e => e.id)).toEqual(['later', 'no-end'])
  })

  it('scopes my_attendance to the signed-in user', async () => {
    mockResponses.events = { data: [eventRow('a')], error: null }
    render(<Probe />)
    act(() => feed.loadMonth(NEXT_MONTH))
    await flush()
    const ops = eventQueries()[0].ops
    expect(ops).toContainEqual(['eq', ['my_attendance.user_id', 'me']])
  })

  it('serves a remount from cache without refetching', async () => {
    mockResponses.events = { data: [eventRow('a')], error: null }
    const first = render(<Probe />)
    act(() => feed.loadMonth(NEXT_MONTH))
    await flush()
    first.unmount()

    render(<Probe />)
    // Painted on the very first render — no spinner, no second query.
    expect(feed.events.map(e => e.id)).toEqual(['a'])
    await flush()
    expect(eventQueries()).toHaveLength(1)
  })

  it('keeps the last good data when a refetch fails, and reports the error', async () => {
    mockResponses.events = { data: [eventRow('a')], error: null }
    render(<Probe />)
    act(() => feed.loadMonth(NEXT_MONTH))
    await flush()

    mockResponses.events = { data: null, error: { message: 'offline' } }
    await act(async () => { await feed.refresh() })
    await flush()

    expect(feed.events.map(e => e.id)).toEqual(['a'])
    expect(feed.error?.message).toBe('offline')
  })

  it('reports an error with nothing to show when the first fetch fails', async () => {
    mockResponses.events = { data: null, error: { message: 'offline' } }
    render(<Probe />)
    act(() => feed.loadMonth(NEXT_MONTH))
    await flush()
    expect(feed.events).toEqual([])
    expect(feed.error?.message).toBe('offline')
    expect(feed.loading).toBe(false)
  })

  it('still renders events when tournaments / other venues fail', async () => {
    mockResponses.events = { data: [eventRow('a')], error: null }
    mockResponses.tournaments = { data: null, error: { message: 'nope' } }
    mockResponses.external_sessions = { data: null, error: { message: 'nope' } }
    render(<Probe />)
    act(() => feed.loadMonth(NEXT_MONTH))
    await flush()
    expect(feed.events.map(e => e.id)).toEqual(['a'])
    expect(feed.error).toBeNull()
  })

  it("invalidate('feed') refetches mounted months", async () => {
    let n = 0
    mockResponses.events = () => ({ data: [eventRow(`v${++n}`)], error: null })
    render(<Probe />)
    act(() => feed.loadMonth(NEXT_MONTH))
    await flush()
    expect(feed.events.map(e => e.id)).toEqual(['v1'])

    act(() => invalidate('feed'))
    await flush()
    expect(eventQueries()).toHaveLength(2)
    expect(feed.events.map(e => e.id)).toEqual(['v2'])
  })

  it('refetches on focus only when stale', async () => {
    mockResponses.events = { data: [eventRow('a')], error: null }
    render(<Probe />)
    act(() => feed.loadMonth(NEXT_MONTH))
    await flush()

    act(() => mockFocusCallback?.())
    await flush()
    expect(eventQueries()).toHaveLength(1)

    const realNow = Date.now()
    jest.spyOn(Date, 'now').mockReturnValue(realNow + 61_000)
    act(() => mockFocusCallback?.())
    await flush()
    expect(eventQueries()).toHaveLength(2)
  })

  it('merges avatar previews in a second phase', async () => {
    mockResponses.events = { data: [eventRow('a')], error: null }
    mockRpcImpl = async () => ({
      data: [{ event_id: 'a', user_id: 'u1', username: 'kim', first_name: null, last_name: null, avatar_url: null }],
      error: null,
    })
    render(<Probe />)
    act(() => feed.loadMonth(NEXT_MONTH))
    await flush(5)
    expect(feed.events[0].attendee_previews?.map(p => p.user_id)).toEqual(['u1'])
  })

  it('does not let a late preview merge overwrite a newer write', async () => {
    mockResponses.events = { data: [eventRow('a')], error: null }
    let releasePreviews!: (r: Result) => void
    mockRpcImpl = () => new Promise(res => { releasePreviews = res })
    render(<Probe />)
    act(() => feed.loadMonth(NEXT_MONTH))
    await flush()

    const newer = [eventRow('a', NEXT_MONTH, { title: 'Renamed' })]
    act(() => setQueryData(feedMonthKey(NEXT_MONTH), newer))
    await act(async () => {
      releasePreviews({ data: [{ event_id: 'a', user_id: 'u1', username: 'kim', first_name: null, last_name: null, avatar_url: null }], error: null })
    })
    await flush()
    expect(getQueryData(feedMonthKey(NEXT_MONTH))).toBe(newer)
  })

  it('drops cached months when the signed-in user changes', async () => {
    mockResponses.events = { data: [eventRow('a')], error: null }
    const view = render(<Probe />)
    act(() => feed.loadMonth(NEXT_MONTH))
    await flush()
    expect(eventQueries()).toHaveLength(1)

    mockSession.userId = null
    view.rerender(<Probe />)
    await flush()
    expect(eventQueries()).toHaveLength(2)
    expect(eventQueries()[1].ops.some(([op, args]) => op === 'eq' && args[0] === 'my_attendance.user_id')).toBe(false)
  })
})

// ─── One request per span (get_feed_span) ────────────────────────────────────

describe('useMonthEvents with get_feed_span', () => {
  const feedRpcCalls = () => mockRpcCalls.filter(c => c.name === 'get_feed_span')
  const previewRpcCalls = () => mockRpcCalls.filter(c => c.name === 'get_event_card_attendee_previews')

  const tournamentRow = {
    id: 't1', created_by: 'host', club_id: 'c1', title: 'Fall Cup', location: 'Roots',
    start_date: `${NEXT_MONTH}-20T15:00:00+00:00`, max_teams: 8, price: 20, skill_levels: [], status: 'published',
    created_at: '2026-01-01T00:00:00+00:00', profiles: { id: 'host', username: 'host' }, clubs: { id: 'c1', name: 'Club', avatar_url: null },
  }
  const externalRow = {
    id: 'reclub-1', source_id: 'reclub', region: 'austin', title: 'Koi Net', venue: 'Roots', city: null, surface: 'indoor',
    session_type: 'open play', level: null, price: '$12', starts_at: `${NEXT_MONTH}-10T00:00:00+00:00`, ends_at: null,
    signup_url: 'https://reclub.co/m/1', signup_label: null, note: null, verified_at: null,
  }
  const preview = { event_id: 'a', user_id: 'u1', username: 'kim', first_name: null, last_name: null, avatar_url: null }

  it('loads a span in one request, previews included, with no table queries', async () => {
    mockFeedRpcImpl = async () => ({
      data: {
        events: [eventRow('a'), eventRow('b', addMonths(NEXT_MONTH, 1))],
        tournaments: [tournamentRow],
        external: [externalRow],
        previews: [preview],
      },
      error: null,
    })
    render(<Probe />)
    act(() => feed.loadMonthSpan(NEXT_MONTH, addMonths(NEXT_MONTH, 1)))
    await flush(5)

    expect(feedRpcCalls()).toHaveLength(1)
    expect(mockCalls).toHaveLength(0)
    expect(previewRpcCalls()).toHaveLength(0)

    const args = feedRpcCalls()[0].args
    expect(args.p_start).toBe(new Date(Number(NEXT_MONTH.slice(0, 4)), Number(NEXT_MONTH.slice(5)) - 1, 1).toISOString())
    expect(typeof args.p_end).toBe('string')
    expect(Date.parse(args.p_external_updated_since as string)).toBeLessThan(Date.now() - 11 * 60 * 60 * 1000)

    // Same merge as the query path: sorted by date, normalized, bucketed by month.
    expect(getQueryData<EventWithDetails[]>(feedMonthKey(NEXT_MONTH))?.map(e => e.id)).toEqual(['external:reclub-1', 'a', 't1'])
    expect(getQueryData<EventWithDetails[]>(feedMonthKey(addMonths(NEXT_MONTH, 1)))?.map(e => e.id)).toEqual(['b'])
    const a = feed.events.find(e => e.id === 'a')!
    expect(a.attendee_previews?.map(p => p.user_id)).toEqual(['u1'])
    expect(feed.events.find(e => e.id === 'b')!.attendee_previews).toEqual([])
    expect(feed.events.find(e => e.id === 't1')!._isTournament).toBe(true)
    expect(feed.events.find(e => e.id === 'external:reclub-1')!._external?.id).toBe('reclub-1')
  })

  it('falls back to the three queries when the function is not deployed, and stops asking', async () => {
    mockResponses.events = { data: [eventRow('a')], error: null }
    render(<Probe />)
    act(() => feed.loadMonth(NEXT_MONTH))
    await flush(5)
    expect(feedRpcCalls()).toHaveLength(1)
    expect(eventQueries()).toHaveLength(1)
    expect(feed.events.map(e => e.id)).toEqual(['a'])
    expect(feed.error).toBeNull()

    act(() => invalidate('feed'))
    await flush(5)
    expect(feedRpcCalls()).toHaveLength(1)
    expect(eventQueries()).toHaveLength(2)
  })

  it('falls back for one fetch on a network error, then tries the RPC again', async () => {
    mockResponses.events = { data: [eventRow('a')], error: null }
    mockFeedRpcImpl = async () => ({ data: null, error: { message: 'TypeError: Failed to fetch', code: '' } })
    render(<Probe />)
    act(() => feed.loadMonth(NEXT_MONTH))
    await flush(5)
    expect(eventQueries()).toHaveLength(1)
    expect(feed.events.map(e => e.id)).toEqual(['a'])

    mockFeedRpcImpl = async () => ({ data: { events: [eventRow('z')], tournaments: [], external: [], previews: [] }, error: null })
    act(() => invalidate('feed'))
    await flush(5)
    expect(feedRpcCalls()).toHaveLength(2)
    expect(eventQueries()).toHaveLength(1)
    expect(feed.events.map(e => e.id)).toEqual(['z'])
  })

  it('treats an unexpected payload as unavailable', async () => {
    mockResponses.events = { data: [eventRow('a')], error: null }
    mockFeedRpcImpl = async () => ({ data: [], error: null })
    render(<Probe />)
    act(() => feed.loadMonth(NEXT_MONTH))
    await flush(5)
    expect(feed.events.map(e => e.id)).toEqual(['a'])

    act(() => invalidate('feed'))
    await flush(5)
    expect(feedRpcCalls()).toHaveLength(1)
  })

  it('replaces stale previews when nobody is going any more', async () => {
    mockFeedRpcImpl = async () => ({ data: { events: [eventRow('a')], previews: [preview] }, error: null })
    render(<Probe />)
    act(() => feed.loadMonth(NEXT_MONTH))
    await flush(5)
    expect(feed.events[0].attendee_previews).toHaveLength(1)

    mockFeedRpcImpl = async () => ({ data: { events: [eventRow('a')], previews: [] }, error: null })
    act(() => invalidate('feed'))
    await flush(5)
    expect(feed.events[0].attendee_previews).toEqual([])
  })
})

// ─── RSVP from a card ────────────────────────────────────────────────────────

describe('useFeedRsvp', () => {
  async function loadedFeed() {
    mockResponses.events = { data: [eventRow('a')], error: null }
    render(<Probe />)
    act(() => feed.loadMonth(NEXT_MONTH))
    await flush()
  }

  it('applies the join optimistically and keeps it on success', async () => {
    await loadedFeed()
    let release!: (r: Result) => void
    mockResponses.event_attendees = () => new Promise<Result>(res => { release = res })
    jest.spyOn(Alert, 'alert').mockImplementation(() => {})

    let done!: Promise<void>
    act(() => { done = rsvp.rsvp({ eventId: 'a', action: 'join', userId: 'me' }) })
    expect(rsvp.isPending('a')).toBe(true)
    expect(feed.events[0].my_attendance).toEqual([{ user_id: 'me', status: 'attending' }])
    expect(feed.events[0].event_attendees_attending).toEqual([{ count: 4 }])

    // Let the insert reach the (held) network call.
    await act(async () => { await new Promise(r => setTimeout(r, 0)) })
    expect(feed.events[0].my_attendance).toEqual([{ user_id: 'me', status: 'attending' }])

    // The server confirms; then `invalidates: ['feed']` refetches.
    mockResponses.events = { data: [eventRow('a', NEXT_MONTH, { my_attendance: [{ user_id: 'me', status: 'attending' }], event_attendees_attending: [{ count: 4 }] })], error: null }
    await act(async () => { release({ data: { status: 'attending' }, error: null }); await done })
    await flush()

    const insert = mockCalls.find(c => c.table === 'event_attendees')!
    expect(insert.ops.map(([op]) => op)).toEqual(['insert', 'select', 'single'])
    expect(insert.ops[1]).toEqual(['select', ['status']])
    expect(Alert.alert).not.toHaveBeenCalled()
    expect(rsvp.pendingEventIds.size).toBe(0)
    expect(eventQueries()).toHaveLength(2)
    expect(feed.events[0].event_attendees_attending).toEqual([{ count: 4 }])
  })

  it('shows "Event just filled up" and marks the card waitlisted', async () => {
    await loadedFeed()
    mockResponses.event_attendees = { data: { status: 'waitlisted' }, error: null }
    // Hold the refetch so the patched cache state is observable.
    mockResponses.events = () => new Promise<Result>(() => {})
    jest.spyOn(Alert, 'alert').mockImplementation(() => {})

    await act(async () => { await rsvp.rsvp({ eventId: 'a', action: 'join', userId: 'me' }) })

    expect(Alert.alert).toHaveBeenCalledWith(EVENT_JUST_FILLED_TITLE, EVENT_JUST_FILLED_BODY)
    expect(EVENT_JUST_FILLED_TITLE).toBe('Event just filled up')
    expect(feed.events[0].my_attendance).toEqual([{ user_id: 'me', status: 'waitlisted' }])
    expect(feed.events[0].event_attendees_attending).toEqual([{ count: 3 }])
  })

  it('rolls back and alerts when the write fails', async () => {
    await loadedFeed()
    const before = getQueryData<EventWithDetails[]>(feedMonthKey(NEXT_MONTH))
    mockResponses.event_attendees = { data: null, error: { message: 'denied' } }
    mockResponses.events = () => new Promise<Result>(() => {})
    jest.spyOn(Alert, 'alert').mockImplementation(() => {})

    await act(async () => { await rsvp.rsvp({ eventId: 'a', action: 'join', userId: 'me' }) })

    expect(Alert.alert).toHaveBeenCalledWith('Error', 'Something went wrong. Please try again.')
    expect(feed.events[0].my_attendance).toEqual([])
    expect(feed.events[0].event_attendees_attending).toEqual([{ count: 3 }])
    expect(getQueryData<EventWithDetails[]>(feedMonthKey(NEXT_MONTH))?.[0]).toEqual(before?.[0])
    expect(rsvp.pendingEventIds.size).toBe(0)
  })

  it('leaves optimistically with a delete', async () => {
    mockResponses.events = { data: [eventRow('a', NEXT_MONTH, { my_attendance: [{ user_id: 'me', status: 'attending' }] })], error: null }
    render(<Probe />)
    act(() => feed.loadMonth(NEXT_MONTH))
    await flush()
    mockResponses.event_attendees = { data: null, error: null }
    mockResponses.events = () => new Promise<Result>(() => {})

    await act(async () => { await rsvp.rsvp({ eventId: 'a', action: 'leave', userId: 'me' }) })
    expect(mockCalls.find(c => c.table === 'event_attendees')!.ops[0][0]).toBe('delete')
    expect(feed.events[0].my_attendance).toEqual([])
    expect(feed.events[0].event_attendees_attending).toEqual([{ count: 2 }])
  })

  it('invalidates the event detail entry on success, so an open event page refetches', async () => {
    await loadedFeed()
    mockResponses.event_attendees = { data: { status: 'attending' }, error: null }
    mockResponses.events = () => new Promise<Result>(() => {})
    let detailFetches = 0
    function EventPageProbe() {
      useQuery(eventKeys.root('a'), async () => { detailFetches++; return { id: 'a' } })
      return null
    }
    render(<EventPageProbe />)
    await flush()
    expect(detailFetches).toBe(1)

    await act(async () => { await rsvp.rsvp({ eventId: 'a', action: 'join', userId: 'me' }) })
    await flush()
    expect(detailFetches).toBe(2)
  })

  it('lets two different cards RSVP at once; a failure on one leaves the other alone', async () => {
    mockResponses.events = { data: [eventRow('a'), eventRow('b')], error: null }
    render(<Probe />)
    act(() => feed.loadMonth(NEXT_MONTH))
    await flush()
    const releases: Array<(r: Result) => void> = []
    mockResponses.event_attendees = () => new Promise<Result>(res => { releases.push(res) })
    mockResponses.events = () => new Promise<Result>(() => {})
    jest.spyOn(Alert, 'alert').mockImplementation(() => {})

    let doneA!: Promise<void>
    let doneB!: Promise<void>
    act(() => { doneA = rsvp.rsvp({ eventId: 'a', action: 'join', userId: 'me' }) })
    act(() => { doneB = rsvp.rsvp({ eventId: 'b', action: 'join', userId: 'me' }) })
    // A second tap on a pending card is ignored.
    act(() => { void rsvp.rsvp({ eventId: 'a', action: 'join', userId: 'me' }) })
    await act(async () => { await new Promise(r => setTimeout(r, 0)) })

    expect(rsvp.isPending('a')).toBe(true)
    expect(rsvp.isPending('b')).toBe(true)
    expect(releases).toHaveLength(2)
    const eventsBefore = eventQueries().length

    // A fails, B is still in flight: only A rolls back, and the feed isn't refetched yet.
    await act(async () => { releases[0]({ data: null, error: { message: 'nope' } }); await doneA })
    expect(feed.events.find(e => e.id === 'a')?.my_attendance).toEqual([])
    expect(feed.events.find(e => e.id === 'b')?.my_attendance).toEqual([{ user_id: 'me', status: 'attending' }])
    expect(eventQueries().length).toBe(eventsBefore)
    expect(Alert.alert).toHaveBeenCalledWith('Error', GENERIC_ERROR_MESSAGE)

    await act(async () => { releases[1]({ data: { status: 'attending' }, error: null }); await doneB })
    await flush()
    expect(rsvp.pendingEventIds.size).toBe(0)
    expect(eventQueries().length).toBe(eventsBefore + 1)
  })

  it('alerts through window.alert on web (Alert.alert is a no-op there)', async () => {
    await loadedFeed()
    mockResponses.event_attendees = { data: null, error: { message: 'denied' } }
    mockResponses.events = () => new Promise<Result>(() => {})
    const { Platform } = require('react-native')
    const realOS = Platform.OS
    Platform.OS = 'web'
    const webAlert = jest.fn()
    ;(global as unknown as { window: { alert: unknown } }).window.alert = webAlert
    try {
      await act(async () => { await rsvp.rsvp({ eventId: 'a', action: 'join', userId: 'me' }) })
    } finally {
      Platform.OS = realOS
    }
    expect(webAlert).toHaveBeenCalledWith(`Error\n\n${GENERIC_ERROR_MESSAGE}`)
  })
})

describe('feed loading flag', () => {
  it('stays false during a background refetch of months that already have data', async () => {
    mockResponses.events = { data: [eventRow('a')], error: null }
    render(<Probe />)
    act(() => feed.loadMonth(NEXT_MONTH))
    await flush()
    expect(feed.loading).toBe(false)

    mockResponses.events = () => new Promise<Result>(() => {})
    act(() => invalidate('feed'))
    await flush()
    expect(feed.loading).toBe(false)
  })

  it('is true while a newly requested month has no data yet', async () => {
    mockResponses.events = { data: [eventRow('a')], error: null }
    render(<Probe />)
    act(() => feed.loadMonth(NEXT_MONTH))
    await flush()
    mockResponses.events = () => new Promise<Result>(() => {})
    act(() => feed.loadMonth(addMonths(NEXT_MONTH, 1)))
    await flush()
    expect(feed.loading).toBe(true)
  })
})

describe('withMyAttendance', () => {
  it('does not double-count a repeat join', () => {
    const e = eventRow('a', NEXT_MONTH, { my_attendance: [{ user_id: 'me', status: 'attending' }] })
    expect(withMyAttendance(e, 'me', 'attending').event_attendees_attending).toEqual([{ count: 3 }])
  })

  it('treats a status-less row (attending-only view) as attending', () => {
    const e = eventRow('a', NEXT_MONTH, { my_attendance: [{ user_id: 'me' }] })
    expect(withMyAttendance(e, 'me', null).event_attendees_attending).toEqual([{ count: 2 }])
  })
})
