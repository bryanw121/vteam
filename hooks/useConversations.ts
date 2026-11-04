import { useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { Sentry } from '../lib/sentry'
import { getQueryData, invalidate, queryKey, setQueryData, useFocusRefetch, useForegroundRefetch, useQuery } from '../lib/query'
import { useRealtimeChannel } from '../lib/realtime'
import { STALE } from '../constants/cache'
import { useSession } from '../contexts/session'
import {
  applyMembershipUpdate,
  applyMessageToConversations,
  applyMessageUpdateToConversations,
  chatTopics,
  conversationsBindings,
  sortConversations,
} from '../utils/chatUtils'
import type { ConversationLookupRow, ConversationRow, MessageRecord, SenderProfile } from '../types'
import { profileBriefKey } from './useMyProfile'

/**
 * The shared conversations store: one `get_my_conversations` result per user
 * in lib/query, read by the Chat list (useConversations), the tab badge
 * (ChatUnreadProvider) and the chat room header (useConversationRow). Realtime
 * payloads patch it in place; it is only refetched when a payload can't be
 * applied (a conversation we don't have yet), on reconnect, on focus when
 * stale, or on pull to refresh.
 */

export function conversationsKey(userId: string): string {
  return queryKey('conversations', userId)
}

/** Sender profiles seen in chat (`profile:<id>:brief`), so realtime rows can be built without a round trip. */
export { profileBriefKey }

export async function fetchConversations(): Promise<ConversationRow[]> {
  const { data, error } = await supabase.rpc('get_my_conversations')
  if (error) throw error
  return sortConversations(((data ?? []) as ConversationRow[]).map(r => ({ ...r, unread_count: Number(r.unread_count ?? 0) })))
}

// ── Debounced refetch (shared by every subscriber of a key) ──────────────────

const REFETCH_DEBOUNCE_MS = 450
const refetchTimers = new Map<string, ReturnType<typeof setTimeout>>()

/**
 * Invalidate `key` once, `REFETCH_DEBOUNCE_MS` after the last request. Several
 * components subscribe to the same realtime topic and each handler runs per
 * payload; going through here turns N handlers into one refetch.
 */
export function scheduleInvalidate(key: string): void {
  const existing = refetchTimers.get(key)
  if (existing) clearTimeout(existing)
  refetchTimers.set(key, setTimeout(() => {
    refetchTimers.delete(key)
    invalidate(key)
  }, REFETCH_DEBOUNCE_MS))
}

// ── Open rooms and our own reads ─────────────────────────────────────────────

const openConversations = new Map<string, number>()
/** conversation id → ms epoch of our last mark_conversation_read. */
const ownReads = new Map<string, number>()
/**
 * An UPDATE on our membership this soon after our own markRead is probably its
 * echo. It is still applied (it can only clear a count); the window only skips
 * the recount an echo that doesn't cover the newest message would otherwise ask for.
 */
const OWN_READ_ECHO_MS = 10_000
/** Waits before retrying a failed `mark_conversation_read` (then give up and show the server's count). */
export const MARK_READ_RETRY_MS = [1_000, 4_000] as const
/** Bumped when the signed-in user changes: a read still retrying for the old user stops. */
let sessionEpoch = 0
const retryTimers = new Set<ReturnType<typeof setTimeout>>()

/** A room registers while mounted: new messages there don't bump its unread count (the room marks them read). */
export function markConversationOpen(conversationId: string): () => void {
  openConversations.set(conversationId, (openConversations.get(conversationId) ?? 0) + 1)
  return () => {
    const n = (openConversations.get(conversationId) ?? 1) - 1
    if (n <= 0) openConversations.delete(conversationId)
    else openConversations.set(conversationId, n)
  }
}

/** Record our own read (so its realtime echo is ignored) and zero the count in the shared store. */
export function markConversationReadLocally(userId: string, conversationId: string): void {
  const now = new Date()
  ownReads.set(conversationId, now.getTime())
  const key = conversationsKey(userId)
  const rows = getQueryData<ConversationRow[]>(key)
  if (!rows) return
  const row = rows.find(r => r.conversation_id === conversationId)
  if (!row || row.unread_count === 0) return
  setQueryData<ConversationRow[]>(key, rows.map(r =>
    r.conversation_id === conversationId ? { ...r, unread_count: 0, my_last_read_at: now.toISOString() } : r,
  ))
}

/**
 * Mark a conversation read: zero it in the shared store now, then save it with
 * `mark_conversation_read`. Once the server has the read, recount once
 * (debounced): a recount that left before the save (reconnect, focus, an
 * unknown conversation's message, the badge's first load) would otherwise put
 * the old count back, and nothing else would correct it (#146). A failed save
 * is retried; if it still fails, the store is recounted so the badge shows
 * what the server has instead of a zero that comes back later.
 */
export function markConversationRead(userId: string, conversationId: string): void {
  markConversationReadLocally(userId, conversationId)
  void saveRead(userId, conversationId, 0, sessionEpoch)
}

async function saveRead(userId: string, conversationId: string, attempt: number, epoch: number): Promise<void> {
  let failure: unknown = null
  try {
    const { error } = await supabase.rpc('mark_conversation_read', { p_conversation_id: conversationId })
    failure = error
  } catch (e) {
    failure = e
  }
  if (epoch !== sessionEpoch) return // signed out or switched account meanwhile
  const key = conversationsKey(userId)
  if (!failure) {
    ownReads.set(conversationId, Date.now())
    scheduleInvalidate(key)
    return
  }
  if (attempt < MARK_READ_RETRY_MS.length) {
    const t = setTimeout(() => {
      retryTimers.delete(t)
      void saveRead(userId, conversationId, attempt + 1, epoch)
    }, MARK_READ_RETRY_MS[attempt])
    retryTimers.add(t)
    return
  }
  const message = (failure as { message?: string })?.message ?? String(failure)
  console.warn('[useConversations] mark_conversation_read failed', message)
  Sentry.captureException(failure instanceof Error ? failure : new Error(`mark_conversation_read: ${message}`))
  scheduleInvalidate(key)
}

/** The signed-in user changed: forget our reads and stop retrying the old user's. */
export function resetChatReadState(): void {
  sessionEpoch++
  retryTimers.forEach(t => clearTimeout(t))
  retryTimers.clear()
  ownReads.clear()
}

/** Our own message, confirmed by the insert: update the list preview without a refetch. */
export function applyOwnMessageToConversations(userId: string, msg: MessageRecord, sender: SenderProfile | null): void {
  const key = conversationsKey(userId)
  const rows = getQueryData<ConversationRow[]>(key)
  if (!rows) return
  const { rows: next, known, changed } = applyMessageToConversations(rows, msg, userId, { isOpen: true, sender })
  if (changed) setQueryData(key, next)
  else if (!known) scheduleInvalidate(key)
}

/** Test-only. */
export function __resetConversationsStore(): void {
  refetchTimers.forEach(t => clearTimeout(t))
  refetchTimers.clear()
  openConversations.clear()
  resetChatReadState()
}

// ── Realtime ────────────────────────────────────────────────────────────────

/**
 * Keeps the shared store current from payloads. Every subscriber (Chat list,
 * badge provider) passes the same `conversationsBindings`, so they share one
 * ref-counted channel; the handlers are idempotent, so running once per
 * subscriber is harmless.
 */
export function useConversationsRealtime(userId: string | null, enabled: boolean): void {
  const key = userId ? conversationsKey(userId) : null

  const onMessageInsert = useCallback((payload: { new: MessageRecord }) => {
    if (!userId || !key) return
    const msg = payload.new
    const rows = getQueryData<ConversationRow[]>(key)
    if (!rows || !msg?.conversation_id) return
    const sender = getQueryData<SenderProfile>(profileBriefKey(msg.sender_id)) ?? null
    const { rows: next, known, changed } = applyMessageToConversations(rows, msg, userId, {
      isOpen: openConversations.has(msg.conversation_id),
      sender,
    })
    if (changed) setQueryData(key, next)
    else if (!known) scheduleInvalidate(key)
  }, [userId, key])

  const onMessageUpdate = useCallback((payload: { new: MessageRecord }) => {
    if (!key || !payload.new?.id) return
    const rows = getQueryData<ConversationRow[]>(key)
    if (!rows) return
    const next = applyMessageUpdateToConversations(rows, payload.new)
    if (next !== rows) setQueryData(key, next)
  }, [key])

  const onMembershipUpdate = useCallback((payload: { new: { conversation_id: string; last_read_at: string | null } }) => {
    if (!key || !payload.new?.conversation_id) return
    const at = ownReads.get(payload.new.conversation_id)
    const ownEcho = at !== undefined && Date.now() - at < OWN_READ_ECHO_MS
    const rows = getQueryData<ConversationRow[]>(key)
    if (!rows) return
    // Always applied: a read covering the newest message clears the row, whoever
    // made it (this device's echo, or the phone a moment later).
    const { rows: next, needsRefetch } = applyMembershipUpdate(rows, payload.new)
    if (next !== rows) setQueryData(key, next)
    if (needsRefetch && !ownEcho) scheduleInvalidate(key)
  }, [key])

  const onReconnect = useCallback(() => {
    if (key) scheduleInvalidate(key)
  }, [key])

  useRealtimeChannel(
    userId ? chatTopics.conversations(userId) : null,
    userId ? conversationsBindings(userId, { onMessageInsert, onMessageUpdate, onMembershipUpdate }) : [],
    { enabled, onReconnect },
  )
}

/**
 * The shared conversations query, without screen-focus refetch (for providers
 * outside a screen). It still recounts when the app comes back to the
 * foreground and the copy is stale, so a read on another device clears the badge.
 */
export function useConversationsQuery(enabled: boolean) {
  const { userId } = useSession()
  const key = userId ? conversationsKey(userId) : null
  const query = useQuery(key, fetchConversations, { staleMs: STALE.conversations, enabled })
  useForegroundRefetch(enabled ? key : null)
  useConversationsRealtime(userId, enabled && !!userId)
  return { key, ...query }
}

/** Pass `enabled: false` while the Chat tab is mounted but inactive (neighbor prefetch): it then only reads the cache. */
export function useConversations(enabled = true) {
  const { key, data, error, isLoading, refetch } = useConversationsQuery(enabled)
  useFocusRefetch(enabled ? key : null)

  const conversations = data ?? EMPTY
  const totalUnread = useMemo(
    () => conversations.reduce((sum, c) => sum + Number(c.unread_count ?? 0), 0),
    [conversations],
  )

  const clearUnread = useCallback((conversationId: string) => {
    if (!key) return
    const rows = getQueryData<ConversationRow[]>(key)
    if (!rows?.some(r => r.conversation_id === conversationId && r.unread_count > 0)) return
    setQueryData<ConversationRow[]>(key, rows.map(c =>
      c.conversation_id === conversationId ? { ...c, unread_count: 0 } : c,
    ))
  }, [key])

  /** Pull to refresh: always hits the server. */
  const refresh = useCallback(() => refetch({ force: true }), [refetch])

  return { conversations, hasData: data !== undefined, loading: isLoading, error, refetch: refresh, totalUnread, clearUnread }
}

const EMPTY: ConversationRow[] = []

// ── One conversation (chat room header) ─────────────────────────────────────

const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null)

/** One header row, for a room opened before (or without) the list: one request, no message aggregates. */
export async function fetchConversationRow(conversationId: string, myId: string): Promise<ConversationRow | null> {
  const { data, error } = await supabase
    .from('conversations')
    .select(`
      id, type, club_id, created_at,
      clubs!conversations_club_id_fkey (name, avatar_url),
      conversation_members!conversation_members_conversation_id_fkey (
        user_id, last_read_at,
        profiles!conversation_members_user_id_fkey (id, username, first_name, last_name, avatar_url, selected_border)
      )
    `)
    .eq('id', conversationId)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const row = data as ConversationLookupRow
  const club = one(row.clubs)
  const me = row.conversation_members.find(m => m.user_id === myId)
  const other = row.type === 'dm' ? row.conversation_members.find(m => m.user_id !== myId) : undefined
  const otherProfile = one(other?.profiles)
  return {
    conversation_id: row.id,
    type: row.type,
    club_id: row.club_id,
    created_at: row.created_at,
    last_message_id: null,
    last_message_content: null,
    last_message_image_url: null,
    last_message_at: null,
    last_message_deleted_at: null,
    last_sender_id: null,
    last_sender_username: null,
    last_sender_first_name: null,
    last_sender_last_name: null,
    unread_count: 0,
    other_user_id: otherProfile?.id ?? other?.user_id ?? null,
    other_user_username: otherProfile?.username ?? null,
    other_user_first_name: otherProfile?.first_name ?? null,
    other_user_last_name: otherProfile?.last_name ?? null,
    other_user_avatar_url: otherProfile?.avatar_url ?? null,
    other_user_selected_border: otherProfile?.selected_border ?? null,
    club_name: club?.name ?? null,
    club_avatar_url: club?.avatar_url ?? null,
    my_last_read_at: me?.last_read_at ?? null,
  }
}

/**
 * The room header's conversation: read from the shared store (no request when
 * the list has loaded), else one single-row fetch.
 */
export function useConversationRow(conversationId: string) {
  const { userId } = useSession()
  const listKey = userId ? conversationsKey(userId) : null
  const list = useQuery(listKey, fetchConversations, { staleMs: STALE.conversations, enabled: false })
  const fromList = list.data?.find(r => r.conversation_id === conversationId) ?? null
  const single = useQuery(
    userId ? queryKey('conversation', conversationId, userId) : null,
    () => fetchConversationRow(conversationId, userId!),
    { staleMs: STALE.conversations, enabled: !!userId && !fromList },
  )
  const row = fromList ?? single.data ?? null
  const refresh = useCallback(() => {
    if (listKey && list.data) invalidate(listKey)
    else void single.refetch({ force: true })
  }, [listKey, list.data, single])
  return { row, refresh }
}
