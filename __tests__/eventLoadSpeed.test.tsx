import React from 'react'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { act, fireEvent, render } from '@testing-library/react-native'
import { __resetQueryCache, getQueryData, prefetchQuery, setQueryData, useQuery } from '../lib/query'
import { eventKeys } from '../hooks/event/keys'
import {
  EVENT_COMMENTS_PAGE,
  fetchEventComments,
  fetchEventCommentsPage,
  useEventData,
} from '../hooks/event/useEventData'
import { PRESS_INTENT_MS, prefetchEventDetail } from '../hooks/event/prefetch'
import { EventCard } from '../components/EventCard'
import { EVENT_DETAIL_COLUMNS, EVENT_EDIT_SELECT } from '../constants/selects'
import type { EventCommentWithAuthor, EventCommentsPage, EventData, EventWithDetails } from '../types'

/**
 * #36: event detail / edit load speed — bounded comments with "load earlier",
 * prefetch on intent, and the edit form seeded from the cached detail row.
 */

type Op = [string, unknown[]]
type MockCall = { table: string; ops: Op[] }
type Res = { data: unknown; error: unknown }
const mockCalls: MockCall[] = []
let mockRespond: (call: MockCall) => Res | Promise<Res> = () => ({ data: [], error: null })

jest.mock('../lib/supabase', () => {
  const methods = ['select', 'eq', 'neq', 'insert', 'update', 'delete', 'order', 'in', 'or', 'limit', 'lt', 'single', 'maybeSingle']
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
jest.mock('../contexts/session', () => ({
  useSession: () => ({ userId: null, isGuest: true, loading: false, session: null }),
}))
jest.mock('../lib/sentry', () => ({ Sentry: { addBreadcrumb: jest.fn(), captureException: jest.fn() } }))
jest.mock('expo-router', () => ({ useFocusEffect: () => {}, useRouter: () => ({ push: jest.fn() }), usePathname: () => '/' }))
jest.mock('expo-image', () => ({ Image: () => null }))

const argsOf = (call: MockCall, op: string) => call.ops.find(o => o[0] === op)?.[1]

/** Thread of `n` comments, one a minute, oldest first: c0000 … c(n-1). */
function thread(n: number, extra: Partial<EventCommentWithAuthor>[] = []): EventCommentWithAuthor[] {
  const rows = Array.from({ length: n }, (_, i) => ({
    id: `c${String(i).padStart(4, '0')}`, event_id: 'e1', body: `#${i}`, is_announcement: false,
    created_at: new Date(Date.UTC(2030, 0, 1, 0, i)).toISOString(), user_id: 'u', mentions: [],
    parent_id: null, edited_at: null, deleted_at: null, profiles: null,
  })) as EventCommentWithAuthor[]
  extra.forEach(e => rows.push({ ...rows[0], ...e } as EventCommentWithAuthor))
  return rows
}

/** A fake `event_comments` endpoint over `rows`: honours lt / order desc / limit / in. */
function commentsServer(rows: EventCommentWithAuthor[]) {
  return (call: MockCall): Res => {
    if (call.table !== 'event_comments') return { data: call.table === 'events' ? null : [], error: null }
    let out = rows.slice().sort((a, b) => (a.created_at < b.created_at ? -1 : 1))
    const inIds = argsOf(call, 'in')
    if (inIds) {
      const set = new Set(inIds[1] as string[])
      return { data: out.filter(c => set.has(c.id)), error: null }
    }
    const lt = argsOf(call, 'lt')
    if (lt) out = out.filter(c => c.created_at < (lt[1] as string))
    out.reverse()
    const limit = argsOf(call, 'limit')
    if (limit) out = out.slice(0, limit[0] as number)
    return { data: out, error: null }
  }
}

async function settle() {
  await act(async () => {
    for (let i = 0; i < 10; i++) await new Promise(r => setTimeout(r, 0))
  })
}

beforeEach(() => {
  __resetQueryCache()
  mockCalls.length = 0
  mockRespond = () => ({ data: [], error: null })
})

describe('event comments: latest page + load earlier', () => {
  it('fetches only the newest page, oldest first, and says older ones exist', async () => {
    mockRespond = commentsServer(thread(250))
    const page = await fetchEventCommentsPage('e1')
    expect(page.rows).toHaveLength(EVENT_COMMENTS_PAGE)
    expect(page.rows[0].id).toBe('c0150')
    expect(page.rows[page.rows.length - 1].id).toBe('c0249')
    expect(page.hasEarlier).toBe(true)
    expect(page.cursor).toBe(page.rows[0].created_at)
    const call = mockCalls.find(c => c.table === 'event_comments')!
    expect(argsOf(call, 'limit')).toEqual([EVENT_COMMENTS_PAGE + 1])
    expect(argsOf(call, 'order')).toEqual(['created_at', { ascending: false }])
  })

  it('a short thread is one page with nothing earlier', async () => {
    mockRespond = commentsServer(thread(3))
    const page = await fetchEventCommentsPage('e1')
    expect(page.rows.map(c => c.id)).toEqual(['c0000', 'c0001', 'c0002'])
    expect(page.hasEarlier).toBe(false)
  })

  it('fetches the parent of a reply that is older than the page, in one IN query', async () => {
    const rows = thread(150, [{ id: 'reply', parent_id: 'c0003', created_at: '2031-01-01T00:00:00.000Z' }])
    mockRespond = commentsServer(rows)
    const page = await fetchEventCommentsPage('e1')
    expect(page.rows.map(c => c.id)).toContain('c0003')
    expect(page.rows[page.rows.length - 1].id).toBe('reply')
    // The cursor ignores the old parent: "load earlier" must not skip c0004…c0050.
    expect(page.cursor).toBe(rows.find(c => c.id === 'c0051')!.created_at)
    const ins = mockCalls.filter(c => c.table === 'event_comments' && argsOf(c, 'in'))
    expect(ins).toHaveLength(1)
    expect(argsOf(ins[0], 'in')).toEqual(['id', ['c0003']])
  })

  it('no extra query when every reply has its parent in the page', async () => {
    mockRespond = commentsServer(thread(5, [{ id: 'reply', parent_id: 'c0004', created_at: '2031-01-01T00:00:00.000Z' }]))
    await fetchEventCommentsPage('e1')
    expect(mockCalls.filter(c => argsOf(c, 'in'))).toHaveLength(0)
  })

  it('a refetch keeps older pages the viewer already loaded', async () => {
    const rows = thread(250)
    mockRespond = commentsServer(rows)
    const first = await fetchEventCommentsPage('e1')
    const older = await fetchEventCommentsPage('e1', first.cursor!)
    setQueryData<EventCommentsPage>(eventKeys.comments('e1'), {
      rows: [...older.rows, ...first.rows], hasEarlier: older.hasEarlier, cursor: older.cursor,
    })
    rows.push({ ...rows[0], id: 'new', created_at: '2031-01-01T00:00:00.000Z' })
    const refreshed = await fetchEventComments('e1')
    expect(refreshed.rows).toHaveLength(201)
    expect(refreshed.rows[0].id).toBe('c0050')
    expect(refreshed.rows[refreshed.rows.length - 1].id).toBe('new')
    expect(refreshed.cursor).toBe(older.cursor)
    expect(refreshed.hasEarlier).toBe(true)
  })

  it('useEventData exposes hasEarlier and loads the earlier page into the cache', async () => {
    mockRespond = commentsServer(thread(130))
    let data!: EventData
    function Harness() {
      data = useEventData('e1')
      return null
    }
    render(<Harness />)
    await settle()
    expect(data.comments).toHaveLength(EVENT_COMMENTS_PAGE)
    expect(data.hasEarlierComments).toBe(true)

    await act(async () => { await data.loadEarlierComments() })
    await settle()
    expect(data.comments).toHaveLength(130)
    expect(data.comments[0].id).toBe('c0000')
    expect(data.hasEarlierComments).toBe(false)
    expect(getQueryData<EventCommentsPage>(eventKeys.comments('e1'))?.rows).toHaveLength(130)
  })
})

describe('prefetchQuery', () => {
  it('fetches once; the screen joins the in-flight request instead of starting another', async () => {
    let calls = 0
    let release!: () => void
    const fetcher = () => { calls++; return new Promise<string>(r => { release = () => r('row') }) }
    void prefetchQuery('k:1', fetcher)
    void prefetchQuery('k:1', fetcher)
    let seen: string | undefined
    function Reader() {
      seen = useQuery('k:1', fetcher).data
      return null
    }
    render(<Reader />)
    expect(calls).toBe(1)
    await act(async () => { release() })
    await settle()
    expect(seen).toBe('row')
    expect(calls).toBe(1)
  })

  it('skips fresh data', async () => {
    setQueryData('k:2', 'cached')
    const fetcher = jest.fn(async () => 'new')
    await prefetchQuery('k:2', fetcher, { staleMs: 60_000 })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('prefetchEventDetail warms the row, guests, co-hosts and comments', async () => {
    mockRespond = commentsServer(thread(2))
    prefetchEventDetail('e1')
    await settle()
    expect(mockCalls.map(c => c.table).sort()).toEqual(['event_cohosts', 'event_comments', 'event_guests', 'events'])
    prefetchEventDetail('e1')
    await settle()
    expect(mockCalls).toHaveLength(4)
  })

  const pressRow = () => ({
    id: 'e1', created_by: 'host', club_id: null, title: 'Tap me', description: null, location: 'Roots',
    event_date: '2030-01-15T19:00:00', duration_minutes: 120, max_attendees: 12, created_at: 'x', price: 0,
    cancelled_at: null, profiles: { id: 'host', username: 'host' }, event_tags: [], clubs: null,
    event_attendees_attending: [{ count: 3 }], event_guests_attending: [{ count: 0 }], my_attendance: [],
  } as unknown as EventWithDetails)
  const waitPastIntent = () => act(() => new Promise<void>(r => setTimeout(r, PRESS_INTENT_MS + 30)))

  it('a press held past the intent delay starts the detail requests before the press completes', async () => {
    const view = render(<EventCard event={pressRow()} currentUserId="me" onRsvp={jest.fn()} />)
    fireEvent(view.getByText('Tap me'), 'pressIn')
    await settle()
    expect(mockCalls).toHaveLength(0)
    await waitPastIntent()
    await settle()
    expect(mockCalls.some(c => c.table === 'events')).toBe(true)
  })

  it('a touch that ends early (a scroll starting on the card) fetches nothing', async () => {
    const view = render(<EventCard event={pressRow()} currentUserId="me" onRsvp={jest.fn()} />)
    fireEvent(view.getByText('Tap me'), 'pressIn')
    fireEvent(view.getByText('Tap me'), 'pressOut')
    await waitPastIntent()
    await settle()
    expect(mockCalls).toHaveLength(0)
  })
})

describe('host edit form', () => {
  const host = readFileSync(resolve(__dirname, '../app/(app)/host.tsx'), 'utf8')

  it('the cached detail row carries every field the edit form reads', () => {
    const detail = new Set(EVENT_DETAIL_COLUMNS.split(',').map(c => c.trim()))
    const editColumns = EVENT_EDIT_SELECT.replace(/,?\s*event_tags \(tag_id\)/, '').split(',').map(c => c.trim())
    expect(editColumns.filter(c => !detail.has(c))).toEqual([])
  })

  it('seeds from event:<id> and is gated only by the edit row, not tags/clubs/venues', () => {
    expect(host).toMatch(/getQueryData<EventWithDetails \| null>\(eventKeys\.root\(editId\)\)/)
    const gate = host.match(/const initialLoading = (.*)/)?.[1] ?? ''
    expect(gate).not.toMatch(/tagsQuery|ownedClubsQuery|venuesQuery/)
    expect(host).not.toMatch(/ActivityIndicator size="large"/)
    expect(host).toMatch(/<HostFormSkeleton \/>/)
  })

  it('a background refresh never overwrites a form the host has started editing', () => {
    expect(host).toMatch(/if \(!untouched && !opts\?\.force\) return true/)
  })
})
