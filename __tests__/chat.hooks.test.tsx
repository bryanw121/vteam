import { act, renderHook } from '@testing-library/react-native'
import type { RealtimeBinding, RealtimeOptions } from '../lib/realtime'

// ── Mocks ────────────────────────────────────────────────────────────────────

type Result = { data: unknown; error: unknown }
type Call = { table: string; ops: Array<[string, unknown[]]> }

const calls: Call[] = []
/** Per-table responder: decides the result from the recorded chain. */
const tables: Record<string, (call: Call) => Result> = {}
const mockRpc = jest.fn<Promise<Result>, [string, unknown?]>()

function mockBuilder(table: string) {
  const call: Call = { table, ops: [] }
  calls.push(call)
  const resolve = () => Promise.resolve((tables[table] ?? (() => ({ data: [], error: null })))(call))
  const b: Record<string, unknown> = {}
  for (const op of ['select', 'eq', 'neq', 'order', 'limit', 'lt', 'in', 'or', 'insert', 'update', 'delete']) {
    b[op] = (...args: unknown[]) => {
      call.ops.push([op, args])
      return b
    }
  }
  b.single = () => { call.ops.push(['single', []]); return resolve() }
  b.maybeSingle = () => { call.ops.push(['maybeSingle', []]); return resolve() }
  b.then = (ok: (r: Result) => unknown, fail?: (e: unknown) => unknown) => resolve().then(ok, fail)
  return b
}

jest.mock('../lib/supabase', () => ({
  supabase: {
    rpc: (...args: [string, unknown?]) => mockRpc(...args),
    from: (table: string) => mockBuilder(table),
    storage: { from: () => ({ upload: async () => ({ error: null }), getPublicUrl: () => ({ data: { publicUrl: 'u' } }) }) },
  },
}))

/** Captured realtime mockSubscribers, by topic (lib/realtime itself has its own tests). */
const mockSubscribers = new Map<string, Array<{ bindings: { current: RealtimeBinding[] }; opts?: RealtimeOptions }>>()
jest.mock('../lib/realtime', () => {
  const React = require('react')
  return {
    useRealtimeChannel: (topic: string | null, bindings: RealtimeBinding[], opts?: RealtimeOptions) => {
      const ref = React.useRef(null)
      if (!ref.current) ref.current = { bindings: { current: bindings }, opts }
      ref.current.bindings.current = bindings
      ref.current.opts = opts
      const enabled = opts?.enabled ?? true
      React.useEffect(() => {
        if (!topic || !enabled) return
        const list = mockSubscribers.get(topic) ?? []
        list.push(ref.current)
        mockSubscribers.set(topic, list)
        return () => {
          const l = mockSubscribers.get(topic) ?? []
          mockSubscribers.set(topic, l.filter((s: unknown) => s !== ref.current))
        }
      }, [topic, enabled])
    },
  }
})

jest.mock('../contexts/session', () => ({
  useSession: () => ({ session: null, userId: 'me', isGuest: false, loading: false }),
}))
jest.mock('expo-router', () => ({ useFocusEffect: () => {} }))

/** Deliver a change to every subscriber of `topic` whose binding matches (as lib/realtime does). */
function emit(topic: string, table: string, event: 'INSERT' | 'UPDATE' | 'DELETE', payload: Record<string, unknown>) {
  for (const sub of mockSubscribers.get(topic) ?? []) {
    for (const b of sub.bindings.current) {
      if (b.table === table && (b.event === event || b.event === '*')) b.handler({ eventType: event, ...payload })
    }
  }
}

import { __resetQueryCache, getQueryData, setQueryData } from '../lib/query'
import {
  __resetConversationsStore,
  conversationsKey,
  markConversationReadLocally,
  profileBriefKey,
  useConversations,
  useConversationsQuery,
} from '../hooks/useConversations'
import { useMessages, MARK_READ_DEBOUNCE_MS } from '../hooks/useMessages'
import type { ConversationRow, MessageWithDetails } from '../types'

async function flush() {
  await act(async () => {
    for (let i = 0; i < 6; i++) await Promise.resolve()
  })
}

function conv(over: Partial<ConversationRow> = {}): ConversationRow {
  return {
    conversation_id: 'c1', type: 'dm', club_id: null, created_at: '2026-10-01T00:00:00.000Z',
    last_message_id: 'm1', last_message_content: 'old', last_message_image_url: null,
    last_message_at: '2026-10-24T19:00:00.000Z', last_message_deleted_at: null, last_sender_id: 'them',
    last_sender_username: null, last_sender_first_name: null, last_sender_last_name: null, unread_count: 0,
    other_user_id: 'them', other_user_username: 'jexy', other_user_first_name: null, other_user_last_name: null,
    other_user_avatar_url: null, other_user_selected_border: null, club_name: null, club_avatar_url: null,
    my_last_read_at: null, ...over,
  }
}

const them = { id: 'them', username: 'jexy', first_name: 'Jex', last_name: null, avatar_url: null, selected_border: null }

function msg(over: Partial<MessageWithDetails> = {}): MessageWithDetails {
  return {
    id: 'm1', conversation_id: 'c1', sender_id: 'them', content: 'hello', image_url: null, reply_to_id: null,
    created_at: '2026-10-24T19:00:00.000Z', deleted_at: null, edited_at: null, profiles: them, message_reactions: [],
    reply_to: null, ...over,
  }
}

const markReadCalls = () => mockRpc.mock.calls.filter(c => c[0] === 'mark_conversation_read').length
const conversationRpcCalls = () => mockRpc.mock.calls.filter(c => c[0] === 'get_my_conversations').length

beforeEach(() => {
  jest.useFakeTimers()
  __resetQueryCache()
  __resetConversationsStore()
  mockSubscribers.clear()
  calls.length = 0
  for (const k of Object.keys(tables)) delete tables[k]
  mockRpc.mockReset()
  mockRpc.mockImplementation(async (name: string) => {
    if (name === 'get_my_conversations') return { data: [conv()], error: null }
    return { data: null, error: null }
  })
})

afterEach(() => {
  jest.useRealTimers()
})

// ── Conversations store ──────────────────────────────────────────────────────

describe('shared conversations query', () => {
  it('fetches get_my_conversations once for the list, a second list and the badge', async () => {
    const list = renderHook(() => useConversations(true))
    const list2 = renderHook(() => useConversations(true))
    const badge = renderHook(() => useConversationsQuery(true))
    await flush()
    expect(conversationRpcCalls()).toBe(1)
    expect(list.result.current.conversations).toHaveLength(1)
    expect(badge.result.current.data).toHaveLength(1)
    // Both share one topic with identical bindings.
    expect(mockSubscribers.get('conversations:me')).toHaveLength(3)
    list2.unmount()
  })

  it('stays idle (cache only, no channel) while disabled', async () => {
    renderHook(() => useConversations(false))
    await flush()
    expect(conversationRpcCalls()).toBe(0)
    expect(mockSubscribers.get('conversations:me') ?? []).toHaveLength(0)
  })

  it('patches the list from a message payload, once, with no refetch', async () => {
    const list = renderHook(() => useConversations(true))
    renderHook(() => useConversationsQuery(true))
    await flush()
    act(() => {
      emit('conversations:me', 'messages', 'INSERT', {
        new: { id: 'm2', conversation_id: 'c1', sender_id: 'them', content: 'new!', image_url: null, reply_to_id: null, created_at: '2026-10-24T20:00:00.000Z', deleted_at: null, edited_at: null },
      })
    })
    jest.advanceTimersByTime(2000)
    await flush()
    const row = list.result.current.conversations[0]
    expect(row.last_message_content).toBe('new!')
    expect(row.unread_count).toBe(1) // two mockSubscribers ran the handler; applied once
    expect(conversationRpcCalls()).toBe(1)
  })

  it('does not recount for the echo of our own markRead, applies a read from another device', async () => {
    const list = renderHook(() => useConversations(true))
    await flush()
    act(() => {
      setQueryData<ConversationRow[]>(conversationsKey('me'), [conv({ unread_count: 2 })])
      markConversationReadLocally('me', 'c1')
    })
    expect(list.result.current.conversations[0].unread_count).toBe(0)
    act(() => {
      emit('conversations:me', 'conversation_members', 'UPDATE', { new: { conversation_id: 'c1', user_id: 'me', last_read_at: '2026-10-24T18:00:00.000Z' } })
    })
    jest.advanceTimersByTime(1000)
    await flush()
    expect(conversationRpcCalls()).toBe(1) // echo: no recount

    jest.advanceTimersByTime(11_000)
    act(() => {
      setQueryData<ConversationRow[]>(conversationsKey('me'), [conv({ unread_count: 2 })])
      emit('conversations:me', 'conversation_members', 'UPDATE', { new: { conversation_id: 'c1', user_id: 'me', last_read_at: '2026-10-24T19:30:00.000Z' } })
    })
    expect(list.result.current.conversations[0].unread_count).toBe(0)
    expect(conversationRpcCalls()).toBe(1)
  })

  it('refetches once (debounced) for a conversation it does not have', async () => {
    renderHook(() => useConversations(true))
    renderHook(() => useConversationsQuery(true))
    await flush()
    act(() => {
      emit('conversations:me', 'messages', 'INSERT', {
        new: { id: 'x', conversation_id: 'brand-new', sender_id: 'them', content: 'hey', image_url: null, reply_to_id: null, created_at: '2026-10-24T20:00:00.000Z', deleted_at: null, edited_at: null },
      })
    })
    expect(conversationRpcCalls()).toBe(1)
    act(() => { jest.advanceTimersByTime(500) })
    await flush()
    expect(conversationRpcCalls()).toBe(2)
  })

  it('refetches on reconnect', async () => {
    renderHook(() => useConversations(true))
    await flush()
    act(() => { mockSubscribers.get('conversations:me')![0].opts?.onReconnect?.() })
    act(() => { jest.advanceTimersByTime(500) })
    await flush()
    expect(conversationRpcCalls()).toBe(2)
  })
})

// ── Room ─────────────────────────────────────────────────────────────────────

function messagesSelects() {
  return calls.filter(c => c.table === 'messages' && c.ops.some(([op]) => op === 'select') && !c.ops.some(([op]) => op === 'insert'))
}

describe('useMessages', () => {
  beforeEach(() => {
    tables.messages = call => {
      if (call.ops.some(([op]) => op === 'lt')) return { data: [msg({ id: 'm0', created_at: '2026-10-20T00:00:00.000Z' })], error: null }
      return { data: [msg({ id: 'm2', created_at: '2026-10-24T19:10:00.000Z' }), msg()], error: null }
    }
    tables.profiles = () => ({ data: { id: 'stranger', username: 'new', first_name: null, last_name: null, avatar_url: null, selected_border: null }, error: null })
  })

  it('marks read once after the first page, not on pagination', async () => {
    // A full first page (40 rows), so there is an older page to load.
    const fullPage = Array.from({ length: 40 }, (_, i) =>
      msg({ id: `p${i}`, created_at: new Date(Date.UTC(2026, 9, 24, 19, 59 - i)).toISOString() }))
    tables.messages = call => (call.ops.some(([op]) => op === 'lt')
      ? { data: [msg({ id: 'm0', created_at: '2026-10-20T00:00:00.000Z' })], error: null }
      : { data: fullPage, error: null })
    const room = renderHook(() => useMessages('c1'))
    await flush()
    expect(room.result.current.messages).toHaveLength(40)
    expect(room.result.current.hasMore).toBe(true)
    expect(markReadCalls()).toBe(0)
    act(() => { jest.advanceTimersByTime(MARK_READ_DEBOUNCE_MS) })
    expect(markReadCalls()).toBe(1)

    await act(async () => { await room.result.current.loadMore() })
    act(() => { jest.advanceTimersByTime(5_000) })
    expect(room.result.current.messages).toHaveLength(41)
    expect(room.result.current.messages[40].id).toBe('m0')
    expect(markReadCalls()).toBe(1)
  })

  it('builds incoming rows from the payload (no refetch) and marks a burst read once', async () => {
    const room = renderHook(() => useMessages('c1'))
    await flush()
    act(() => { jest.advanceTimersByTime(MARK_READ_DEBOUNCE_MS) })
    const selectsBefore = messagesSelects().length
    const markBefore = markReadCalls()

    act(() => {
      for (let i = 3; i < 6; i++) {
        emit('messages:c1', 'messages', 'INSERT', {
          new: { id: `m${i}`, conversation_id: 'c1', sender_id: 'them', content: `n${i}`, image_url: null, reply_to_id: 'm1', created_at: `2026-10-24T20:0${i}:00.000Z`, deleted_at: null, edited_at: null },
        })
      }
    })
    expect(room.result.current.messages.slice(0, 3).map(m => m.id)).toEqual(['m5', 'm4', 'm3'])
    expect(room.result.current.messages[0].profiles?.username).toBe('jexy') // from the profile cache
    expect(room.result.current.messages[0].reply_to?.id).toBe('m1') // from the loaded rows
    expect(messagesSelects().length).toBe(selectsBefore)
    expect(calls.filter(c => c.table === 'profiles')).toHaveLength(0)

    act(() => { jest.advanceTimersByTime(MARK_READ_DEBOUNCE_MS) })
    expect(markReadCalls()).toBe(markBefore + 1)
  })

  it('fetches an unknown sender once and reuses it', async () => {
    const room = renderHook(() => useMessages('c1'))
    await flush()
    const ins = (id: string) => emit('messages:c1', 'messages', 'INSERT', {
      new: { id, conversation_id: 'c1', sender_id: 'stranger', content: id, image_url: null, reply_to_id: null, created_at: `2026-10-24T21:00:0${id.length}.000Z`, deleted_at: null, edited_at: null },
    })
    act(() => { ins('a') })
    await flush()
    act(() => { ins('bb') })
    await flush()
    expect(calls.filter(c => c.table === 'profiles')).toHaveLength(1)
    expect(getQueryData(profileBriefKey('stranger'))).toBeTruthy()
    expect(room.result.current.messages.filter(m => m.sender_id === 'stranger').every(m => m.profiles?.username === 'new')).toBe(true)
  })

  it('does not mark read for our own incoming echo', async () => {
    renderHook(() => useMessages('c1'))
    await flush()
    act(() => { jest.advanceTimersByTime(MARK_READ_DEBOUNCE_MS) })
    const before = markReadCalls()
    act(() => {
      emit('messages:c1', 'messages', 'INSERT', {
        new: { id: 'own', conversation_id: 'c1', sender_id: 'me', content: 'mine', image_url: null, reply_to_id: null, created_at: '2026-10-24T22:00:00.000Z', deleted_at: null, edited_at: null },
      })
    })
    act(() => { jest.advanceTimersByTime(MARK_READ_DEBOUNCE_MS * 2) })
    expect(markReadCalls()).toBe(before)
  })

  it('applies reaction payloads without refetching page 1', async () => {
    const room = renderHook(() => useMessages('c1'))
    await flush()
    const selectsBefore = messagesSelects().length
    act(() => {
      emit('reactions:c1', 'message_reactions', 'INSERT', { new: { message_id: 'm1', user_id: 'them', emoji: '🔥', created_at: 'x' } })
    })
    expect(room.result.current.messages.find(m => m.id === 'm1')?.message_reactions).toHaveLength(1)
    expect(messagesSelects().length).toBe(selectsBefore)
  })

  it('keeps a failed send in the list and retries it', async () => {
    let fail = true
    tables.messages = call => {
      if (call.ops.some(([op]) => op === 'insert')) {
        return fail
          ? { data: null, error: { message: 'offline' } }
          : { data: msg({ id: 'real', sender_id: 'me', content: 'yo', created_at: '2026-10-24T23:00:00.000Z' }), error: null }
      }
      return { data: [msg()], error: null }
    }
    const room = renderHook(() => useMessages('c1'))
    await flush()
    let ok: boolean | undefined
    await act(async () => { ok = await room.result.current.sendMessage('yo') })
    expect(ok).toBe(false)
    const failed = room.result.current.messages[0]
    expect(failed).toMatchObject({ content: 'yo', _failed: true, _sending: false })

    fail = false
    await act(async () => { ok = await room.result.current.retryMessage(failed.id) })
    expect(ok).toBe(true)
    expect(room.result.current.messages.map(m => m.id)).toEqual(['real', 'm1'])
  })

  it('rolls back an edit the server rejected', async () => {
    tables.messages = call => {
      if (call.ops.some(([op]) => op === 'update')) return { data: null, error: { message: 'nope' } }
      return { data: [msg({ sender_id: 'me' })], error: null }
    }
    const alert = jest.spyOn(require('react-native').Alert, 'alert').mockImplementation(() => {})
    const room = renderHook(() => useMessages('c1'))
    await flush()
    let ok: boolean | undefined
    await act(async () => { ok = await room.result.current.editMessage('m1', 'changed') })
    expect(ok).toBe(false)
    expect(room.result.current.messages[0].content).toBe('hello')
    expect(alert).toHaveBeenCalled()
    alert.mockRestore()
  })
})

describe('useMessages — review fixes', () => {
  beforeEach(() => {
    tables.messages = () => ({ data: [msg()], error: null })
  })

  it('overwrites a cached sender profile with the fetched row (renamed sender shows at once)', async () => {
    setQueryData(profileBriefKey('them'), { ...them, username: 'old-name' })
    renderHook(() => useMessages('c1'))
    await flush()
    expect(getQueryData<{ username: string }>(profileBriefKey('them'))?.username).toBe('jexy')
  })

  it('uses the same profile:<uid>:brief key as the event page', () => {
    const { eventKeys } = require('../hooks/event/keys')
    expect(profileBriefKey('u1')).toBe('profile:u1:brief')
    expect(eventKeys.viewerProfile('u1')).toBe(profileBriefKey('u1'))
  })

  it('sends a client-generated id, and the optimistic row carries it', async () => {
    let inserted: Record<string, unknown> | undefined
    tables.messages = call => {
      const ins = call.ops.find(([op]) => op === 'insert')
      if (ins) {
        inserted = ins[1][0] as Record<string, unknown>
        return { data: msg({ id: inserted.id as string, sender_id: 'me', content: 'yo', created_at: '2026-10-24T23:00:00.000Z' }), error: null }
      }
      return { data: [msg()], error: null }
    }
    const room = renderHook(() => useMessages('c1'))
    await flush()
    await act(async () => { await room.result.current.sendMessage('yo') })
    expect(inserted?.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(room.result.current.messages.map(m => m.id)).toEqual([inserted?.id, 'm1'])
  })

  it('treats a retry that hits a duplicate id as sent (the first attempt landed, its response was lost)', async () => {
    let attempt = 0
    let sentId = ''
    tables.messages = call => {
      const ins = call.ops.find(([op]) => op === 'insert')
      if (ins) {
        attempt++
        sentId = (ins[1][0] as { id: string }).id
        return attempt === 1
          ? { data: null, error: { message: 'network', code: 'FETCH' } }
          : { data: null, error: { message: 'duplicate key', code: '23505' } }
      }
      if (call.ops.some(([op]) => op === 'maybeSingle')) {
        return { data: msg({ id: sentId, sender_id: 'me', content: 'yo', created_at: '2026-10-24T23:00:00.000Z' }), error: null }
      }
      return { data: [msg()], error: null }
    }
    const room = renderHook(() => useMessages('c1'))
    await flush()
    let ok: boolean | undefined
    await act(async () => { ok = await room.result.current.sendMessage('yo') })
    expect(ok).toBe(false)
    const failed = room.result.current.messages[0]
    expect(failed._failed).toBe(true)

    await act(async () => { ok = await room.result.current.retryMessage(failed.id) })
    expect(ok).toBe(true)
    expect(room.result.current.messages.filter(m => m.content === 'yo')).toHaveLength(1)
    expect(room.result.current.messages[0].id).toBe(sentId)
    expect(room.result.current.messages[0]._failed).toBeFalsy()
    expect(room.result.current.messages[0]._sending).toBeFalsy()
  })
})

// ── Tab badge (#146) ─────────────────────────────────────────────────────────
// A tiny server: `unread` per conversation, what get_my_conversations returns,
// and a mark_conversation_read that can be held open or made to fail.

import React from 'react'
import { AppState } from 'react-native'
import { ChatUnreadProvider, useChatUnread } from '../hooks/useChatUnread'
import { MARK_READ_RETRY_MS, resetChatReadState } from '../hooks/useConversations'

describe('chat tab badge (#146)', () => {
  type Server = { unread: Record<string, number>; lastAt: Record<string, string>; readAt: Record<string, string> }
  let server: Server
  let holdRead: Array<() => void>
  let failReads: number

  const rowsFromServer = () => Object.keys(server.unread).map(id => conv({
    conversation_id: id, other_user_id: `u-${id}`, unread_count: server.unread[id],
    last_message_id: `last-${id}`, last_message_at: server.lastAt[id] ?? '2026-10-24T19:00:00.000Z',
  }))

  /** AppState listeners the badge registered (jest-expo's AppState returns no subscription). */
  let appStateListeners: Array<(s: string) => void>
  let appStateSpy: jest.SpyInstance

  beforeEach(() => {
    appStateListeners = []
    appStateSpy = jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, fn: (s: string) => void) => {
      appStateListeners.push(fn)
      return { remove: () => { appStateListeners = appStateListeners.filter(l => l !== fn) } }
    }) as unknown as typeof AppState.addEventListener)
    server = { unread: { c1: 2, c2: 1 }, lastAt: {}, readAt: {} }
    holdRead = []
    failReads = 0
    tables.messages = () => ({ data: [msg()], error: null })
    mockRpc.mockImplementation(async (name: string, args?: unknown) => {
      if (name === 'get_my_conversations') return { data: rowsFromServer(), error: null }
      if (name === 'mark_conversation_read') {
        const id = (args as { p_conversation_id: string }).p_conversation_id
        if (failReads > 0) { failReads--; return { data: null, error: { message: 'timeout' } } }
        await new Promise<void>(resolve => {
          holdRead.push(resolve)
        })
        server.unread[id] = 0
        server.readAt[id] = '2026-10-24T19:30:00.000Z'
        return { data: null, error: null }
      }
      return { data: null, error: null }
    })
  })

  afterEach(() => appStateSpy.mockRestore())

  const releaseReads = async () => {
    const pending = holdRead.splice(0)
    pending.forEach(r => r())
    await flush()
  }

  function renderBadge() {
    const wrapper = ({ children }: { children: React.ReactNode }) => <ChatUnreadProvider>{children}</ChatUnreadProvider>
    return renderHook(() => useChatUnread(), { wrapper })
  }

  async function startBadge() {
    const badge = renderBadge()
    act(() => { jest.advanceTimersByTime(1_500) })
    await flush()
    return badge
  }

  /** What a membership UPDATE for our own row looks like on the wire. */
  const membershipEcho = (conversationId: string, lastReadAt: string) =>
    emit('conversations:me', 'conversation_members', 'UPDATE', { new: { conversation_id: conversationId, user_id: 'me', last_read_at: lastReadAt } })

  it('starts after the delay and counts every unread conversation', async () => {
    const badge = renderBadge()
    expect(badge.result.current).toBe(0)
    expect(conversationRpcCalls()).toBe(0)
    act(() => { jest.advanceTimersByTime(1_500) })
    await flush()
    expect(badge.result.current).toBe(3)
  })

  it('opening a conversation clears it from the badge without a reload', async () => {
    const badge = await startBadge()
    const room = renderHook(() => useMessages('c1'))
    await flush()
    act(() => { jest.advanceTimersByTime(MARK_READ_DEBOUNCE_MS) })
    expect(badge.result.current).toBe(1)
    await releaseReads()
    room.unmount()
    expect(badge.result.current).toBe(1)
  })

  it('a new message elsewhere adds 1 live; in the open room it never counts', async () => {
    const badge = await startBadge()
    act(() => {
      emit('conversations:me', 'messages', 'INSERT', {
        new: { id: 'n1', conversation_id: 'c2', sender_id: 'them', content: 'yo', image_url: null, reply_to_id: null, created_at: '2026-10-24T20:00:00.000Z', deleted_at: null, edited_at: null },
      })
    })
    expect(badge.result.current).toBe(4)

    const room = renderHook(() => useMessages('c1'))
    await flush()
    act(() => { jest.advanceTimersByTime(MARK_READ_DEBOUNCE_MS) })
    await releaseReads()
    act(() => {
      emit('conversations:me', 'messages', 'INSERT', {
        new: { id: 'n2', conversation_id: 'c1', sender_id: 'them', content: 'here', image_url: null, reply_to_id: null, created_at: '2026-10-24T20:01:00.000Z', deleted_at: null, edited_at: null },
      })
    })
    expect(badge.result.current).toBe(2) // c2 only
    room.unmount()
  })

  it('a DM from someone you silenced never adds to the badge', async () => {
    tables.chat_silences = () => ({ data: [{ silenced_user_id: 'u-c2', created_at: 'x', profiles: null }], error: null })
    const badge = await startBadge()
    expect(badge.result.current).toBe(2) // c1 only
    act(() => {
      emit('conversations:me', 'messages', 'INSERT', {
        new: { id: 'n1', conversation_id: 'c2', sender_id: 'u-c2', content: 'hi', image_url: null, reply_to_id: null, created_at: '2026-10-24T20:00:00.000Z', deleted_at: null, edited_at: null },
      })
    })
    expect(badge.result.current).toBe(2)
  })

  it('no ghost: a recount that left before the server saved our read does not bring the count back', async () => {
    const badge = await startBadge()
    expect(badge.result.current).toBe(3)

    // Open c1: the room marks it read; the server is slow to commit.
    const room = renderHook(() => useMessages('c1'))
    await flush()
    act(() => { jest.advanceTimersByTime(MARK_READ_DEBOUNCE_MS) })
    expect(badge.result.current).toBe(1)

    // Meanwhile something recounts (a message in a conversation not in the list,
    // a reconnect, a focus refetch). The server hasn't saved the read yet.
    act(() => {
      emit('conversations:me', 'messages', 'INSERT', {
        new: { id: 'x', conversation_id: 'brand-new', sender_id: 'them', content: 'hey', image_url: null, reply_to_id: null, created_at: '2026-10-24T20:00:00.000Z', deleted_at: null, edited_at: null },
      })
    })
    act(() => { jest.advanceTimersByTime(500) })
    await flush()

    // The read commits; its realtime echo follows within seconds.
    await releaseReads()
    act(() => { membershipEcho('c1', '2026-10-24T19:30:00.000Z') })
    act(() => { jest.advanceTimersByTime(1_000) })
    await flush()
    room.unmount()
    await flush()
    expect(badge.result.current).toBe(1) // c2 only: c1 stays read
  })

  it('no ghost even when the realtime echo never arrives: the saved read is recounted', async () => {
    const badge = await startBadge()
    const room = renderHook(() => useMessages('c1'))
    await flush()
    act(() => { jest.advanceTimersByTime(MARK_READ_DEBOUNCE_MS) })
    act(() => { mockSubscribers.get('conversations:me')![0].opts?.onReconnect?.() }) // a recount before the save
    act(() => { jest.advanceTimersByTime(500) })
    await flush()
    await releaseReads() // saved; no membership UPDATE delivered
    act(() => { jest.advanceTimersByTime(500) })
    await flush()
    room.unmount()
    expect(badge.result.current).toBe(1)
  })

  it('no ghost: a read saved before the list first loaded is not shown as unread', async () => {
    // Deep link straight into the room: the read starts before the badge's first fetch.
    const room = renderHook(() => useMessages('c1'))
    await flush()
    act(() => { jest.advanceTimersByTime(MARK_READ_DEBOUNCE_MS) })
    const badge = renderBadge()
    act(() => { jest.advanceTimersByTime(1_500) })
    await flush() // the badge's first fetch returns c1 as unread: the read isn't saved yet
    await releaseReads()
    act(() => { membershipEcho('c1', '2026-10-24T19:30:00.000Z') })
    act(() => { jest.advanceTimersByTime(1_000) })
    await flush()
    room.unmount()
    await flush()
    expect(badge.result.current).toBe(1)
  })

  it('a failed mark_conversation_read is retried, so the read sticks', async () => {
    failReads = 1
    const badge = await startBadge()
    const room = renderHook(() => useMessages('c1'))
    await flush()
    act(() => { jest.advanceTimersByTime(MARK_READ_DEBOUNCE_MS) })
    await flush()
    expect(badge.result.current).toBe(1)
    act(() => { jest.advanceTimersByTime(5_000) }) // retry
    await flush()
    await releaseReads()
    room.unmount()
    // Any later recount (reload, foreground, reconnect) agrees.
    act(() => { mockSubscribers.get('conversations:me')![0].opts?.onReconnect?.() })
    act(() => { jest.advanceTimersByTime(500) })
    await flush()
    expect(server.unread.c1).toBe(0)
    expect(badge.result.current).toBe(1)
  })

  it('a read on another device clears the badge here, even right after our own read', async () => {
    const badge = await startBadge()
    const room = renderHook(() => useMessages('c2'))
    await flush()
    act(() => { jest.advanceTimersByTime(MARK_READ_DEBOUNCE_MS) })
    await releaseReads()
    room.unmount()
    expect(badge.result.current).toBe(2)
    // c1 read on the phone a moment later.
    server.unread.c1 = 0
    act(() => { membershipEcho('c1', '2026-10-24T19:31:00.000Z') })
    expect(badge.result.current).toBe(0)
  })

  it('gives up after the retries and shows the server count rather than a zero that comes back later', async () => {
    failReads = 1 + MARK_READ_RETRY_MS.length
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    const badge = await startBadge()
    const room = renderHook(() => useMessages('c1'))
    await flush()
    act(() => { jest.advanceTimersByTime(MARK_READ_DEBOUNCE_MS) })
    await flush()
    expect(badge.result.current).toBe(1)
    for (const ms of MARK_READ_RETRY_MS) {
      act(() => { jest.advanceTimersByTime(ms) })
      await flush()
    }
    expect(markReadCalls()).toBe(1 + MARK_READ_RETRY_MS.length)
    act(() => { jest.advanceTimersByTime(500) })
    await flush()
    expect(badge.result.current).toBe(3)
    expect(warn).toHaveBeenCalledWith('[useConversations] mark_conversation_read failed', 'timeout')
    warn.mockRestore()
    room.unmount()
  })

  it('stops retrying a read once the user changes (sign out / sign in)', async () => {
    failReads = 1
    renderHook(() => useMessages('c1'))
    await flush()
    act(() => { jest.advanceTimersByTime(MARK_READ_DEBOUNCE_MS) })
    await flush()
    expect(markReadCalls()).toBe(1)
    act(() => { resetChatReadState() })
    act(() => { jest.advanceTimersByTime(10_000) })
    await flush()
    expect(markReadCalls()).toBe(1)
  })

  it('never sends a client timestamp: unread is the server comparing its own clocks', async () => {
    renderHook(() => useMessages('c1'))
    await flush()
    act(() => { jest.advanceTimersByTime(MARK_READ_DEBOUNCE_MS) })
    expect(mockRpc.mock.calls.find(c => c[0] === 'mark_conversation_read')?.[1]).toEqual({ p_conversation_id: 'c1' })
    await releaseReads()
  })

  it('recounts when the app comes back to the foreground with a stale copy (a read on another device)', async () => {
    const badge = await startBadge()
    expect(badge.result.current).toBe(3)
    server.unread = { c1: 0, c2: 0 } // read on the web while this phone slept
    act(() => { jest.advanceTimersByTime(31_000) })
    act(() => { appStateListeners.forEach(l => l('active')) })
    await flush()
    expect(badge.result.current).toBe(0)
  })

  it('stays clear after a reload', async () => {
    const badge = await startBadge()
    for (const id of ['c1', 'c2']) {
      const room = renderHook(() => useMessages(id))
      await flush()
      act(() => { jest.advanceTimersByTime(MARK_READ_DEBOUNCE_MS) })
      await releaseReads()
      room.unmount()
    }
    expect(badge.result.current).toBe(0)
    badge.unmount()
    __resetQueryCache()
    const reloaded = await startBadge()
    expect(reloaded.result.current).toBe(0)
  })
})
