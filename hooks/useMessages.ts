import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { getQueryData, setQueryData, useMutation } from '../lib/query'
import { useRealtimeChannel } from '../lib/realtime'
import { CHAT_IMAGES_BUCKET, NETWORK_ERROR_MESSAGE } from '../constants'
import { useSession } from '../contexts/session'
import {
  applyMessageUpdate,
  applyReactionChange,
  buildIncomingMessage,
  chatAlert,
  chatTopics,
  confirmSent,
  createDebouncedCall,
  mergeLatestPage,
  messagesBindings,
  newMessageId,
  reactionsBindings,
  replySnapshotOf,
  upsertIncoming,
} from '../utils/chatUtils'
import {
  applyOwnMessageToConversations,
  markConversationOpen,
  markConversationRead,
  profileBriefKey,
} from './useConversations'
import type { DebouncedCall, MessageRecord, MessageWithDetails, PendingSend, ReplySnapshot, SenderProfile } from '../types'
import { toProfileBrief } from './useMyProfile'

const PROFILE_BRIEF = 'id, username, first_name, last_name, avatar_url, selected_border'

const MESSAGE_SELECT = `
  id, conversation_id, sender_id, content, image_url, reply_to_id, created_at, deleted_at, edited_at,
  profiles!messages_sender_id_fkey (${PROFILE_BRIEF}),
  message_reactions (message_id, user_id, emoji, created_at)
`

// Separate select for reply-to messages — avoids the ambiguous PostgREST self-join
const REPLY_SELECT = `id, content, image_url, deleted_at, profiles!messages_sender_id_fkey (id, username, first_name, last_name)`

const PAGE_SIZE = 40
/** markRead runs at most once per second of activity, and only for a first open or a new incoming message. */
export const MARK_READ_DEBOUNCE_MS = 1_000
const RECONNECT_REFRESH_DEBOUNCE_MS = 300

// ── Sender profile cache (lib/query `profile:<id>:brief`) ────────────────────

/** Fetched rows are the newest copy: always overwrite (a renamed sender or new avatar shows at once). */
function rememberProfile(p: SenderProfile | null | undefined): void {
  if (!p?.id) return
  const next = toProfileBrief(p)
  const cached = getQueryData<SenderProfile>(profileBriefKey(p.id))
  // Skip identical writes: every page of messages would otherwise re-notify readers.
  if (cached && (Object.keys(next) as (keyof SenderProfile)[]).every(k => cached[k] === next[k])) return
  setQueryData(profileBriefKey(p.id), next)
}

const profileRequests = new Map<string, Promise<SenderProfile | null>>()

/** The sender's brief profile: cached, or fetched once (concurrent callers share the request). */
export function ensureSenderProfile(userId: string): Promise<SenderProfile | null> {
  const cached = getQueryData<SenderProfile>(profileBriefKey(userId))
  if (cached) return Promise.resolve(cached)
  const inFlight = profileRequests.get(userId)
  if (inFlight) return inFlight
  const req = (async () => {
    const { data, error } = await supabase.from('profiles').select(PROFILE_BRIEF).eq('id', userId).maybeSingle()
    profileRequests.delete(userId)
    if (error || !data) return null
    const p = data as SenderProfile
    setQueryData(profileBriefKey(userId), p)
    return p
  })()
  profileRequests.set(userId, req)
  return req
}

/** Attach reply quotes: resolved from the page itself where possible, the rest in one `IN` query. */
async function attachReplyTo(rows: MessageWithDetails[]): Promise<MessageWithDetails[]> {
  const byId = new Map(rows.map(r => [r.id, r]))
  const missing = [...new Set(rows.filter(r => r.reply_to_id && !byId.has(r.reply_to_id)).map(r => r.reply_to_id!))]
  const fetched = new Map<string, ReplySnapshot>()
  if (missing.length) {
    const { data } = await supabase.from('messages').select(REPLY_SELECT).in('id', missing)
    for (const r of data ?? []) fetched.set(r.id, r as ReplySnapshot)
  }
  return rows.map(m => {
    if (!m.reply_to_id) return m
    const local = byId.get(m.reply_to_id)
    return { ...m, reply_to: local ? replySnapshotOf(local) : fetched.get(m.reply_to_id) ?? null }
  })
}

async function fetchReply(id: string): Promise<ReplySnapshot | null> {
  const { data } = await supabase.from('messages').select(REPLY_SELECT).eq('id', id).maybeSingle()
  return (data as ReplySnapshot | null) ?? null
}

async function fetchPage(conversationId: string, before?: string): Promise<MessageWithDetails[]> {
  let query = supabase
    .from('messages')
    .select(MESSAGE_SELECT)
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(PAGE_SIZE)
  if (before) query = query.lt('created_at', before)
  const { data, error } = await query
  if (error) throw error
  const rows = (data ?? []) as MessageWithDetails[]
  rows.forEach(r => rememberProfile(r.profiles))
  // Newest first — the order the inverted native list wants.
  return attachReplyTo(rows)
}

type Updater = MessageWithDetails[] | ((prev: MessageWithDetails[]) => MessageWithDetails[])


/**
 * One room's messages: newest page + older pages on demand, kept current from
 * realtime payloads on `messages:<id>` and `reactions:<id>` (no refetch per
 * event), refetched only on reconnect / pull to refresh. Sends are optimistic;
 * a failed send stays in the list with `_failed` until retried.
 */
export function useMessages(conversationId: string) {
  const { userId } = useSession()
  const [messages, setMessagesState] = useState<MessageWithDetails[]>([])
  const messagesRef = useRef<MessageWithDetails[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [hasMore, setHasMore] = useState(true)
  const oldestCreatedAt = useRef<string | null>(null)
  const loadingMore = useRef(false)
  /** Bumped per conversation; async results from an older one are dropped. */
  const generation = useRef(0)
  const pendingSends = useRef(new Map<string, PendingSend>())

  const setMessages = useCallback((updater: Updater) => {
    setMessagesState(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      messagesRef.current = next
      return next
    })
  }, [])

  // ── markRead: debounced, on first open and on new incoming messages only ──
  const markReadCall = useRef<DebouncedCall | null>(null)
  useEffect(() => {
    const call = createDebouncedCall(() => {
      if (!userId) return
      markConversationRead(userId, conversationId)
    }, MARK_READ_DEBOUNCE_MS)
    markReadCall.current = call
    return () => {
      // Leaving within the debounce window still records the read.
      call.flush()
      if (markReadCall.current === call) markReadCall.current = null
    }
  }, [conversationId, userId])
  const scheduleMarkRead = useCallback(() => markReadCall.current?.schedule(), [])

  // While mounted, new messages here don't bump this conversation's unread count in the list.
  useEffect(() => markConversationOpen(conversationId), [conversationId])

  // ── Initial page ──────────────────────────────────────────────────────────
  useEffect(() => {
    const gen = ++generation.current
    setMessages([])
    setLoading(true)
    setError(null)
    setHasMore(true)
    oldestCreatedAt.current = null
    pendingSends.current.clear()
    fetchPage(conversationId)
      .then(rows => {
        if (gen !== generation.current) return
        setMessages(prev => mergeLatestPage(prev, rows))
        oldestCreatedAt.current = rows[rows.length - 1]?.created_at ?? null
        setHasMore(rows.length === PAGE_SIZE)
        setLoading(false)
        if (rows.length > 0) scheduleMarkRead()
      })
      .catch((e: { message?: string }) => {
        if (gen !== generation.current) return
        console.error('[useMessages] fetch error:', e?.message)
        setError(new Error(e?.message ?? 'Failed to load messages'))
        setLoading(false)
      })
  }, [conversationId, setMessages, scheduleMarkRead])

  const loadMore = useCallback(async () => {
    if (!hasMore || !oldestCreatedAt.current || loadingMore.current) return
    loadingMore.current = true
    const gen = generation.current
    try {
      const rows = await fetchPage(conversationId, oldestCreatedAt.current)
      if (gen !== generation.current) return
      // Older page goes to the END of the array (highest index = visual top of inverted list)
      setMessages(prev => {
        const ids = new Set(prev.map(m => m.id))
        return [...prev, ...rows.filter(r => !ids.has(r.id))]
      })
      if (rows.length) oldestCreatedAt.current = rows[rows.length - 1].created_at
      setHasMore(rows.length === PAGE_SIZE)
    } catch (e) {
      console.error('[useMessages] loadMore error:', (e as { message?: string })?.message)
    } finally {
      loadingMore.current = false
    }
  }, [conversationId, hasMore, setMessages])

  /** Re-read the newest page and merge it in (older pages and unsent rows stay). Pull to refresh and reconnect. */
  const refresh = useCallback(async () => {
    const gen = generation.current
    try {
      const rows = await fetchPage(conversationId)
      if (gen !== generation.current) return
      setMessages(prev => mergeLatestPage(prev, rows))
      if (!oldestCreatedAt.current) {
        oldestCreatedAt.current = rows[rows.length - 1]?.created_at ?? null
        setHasMore(rows.length === PAGE_SIZE)
      }
      setError(null)
      setLoading(false)
    } catch (e) {
      console.error('[useMessages] refresh error:', (e as { message?: string })?.message)
    }
  }, [conversationId, setMessages])

  const reconnectRefresh = useRef<DebouncedCall | null>(null)
  const refreshRef = useRef(refresh)
  refreshRef.current = refresh
  if (!reconnectRefresh.current) {
    reconnectRefresh.current = createDebouncedCall(() => { void refreshRef.current() }, RECONNECT_REFRESH_DEBOUNCE_MS)
  }
  useEffect(() => () => reconnectRefresh.current?.cancel(), [])
  const onReconnect = useCallback(() => reconnectRefresh.current?.schedule(), [])

  // ── Realtime: rows built from payloads ────────────────────────────────────
  const onInsert = useCallback((payload: { new: MessageRecord }) => {
    const record = payload.new
    if (!record?.id || record.conversation_id !== conversationId) return
    const gen = generation.current
    const sender = getQueryData<SenderProfile>(profileBriefKey(record.sender_id)) ?? null
    const row = buildIncomingMessage(record, sender, messagesRef.current)
    setMessages(prev => upsertIncoming(prev, row))

    if (!sender) {
      // Unknown sender: one profile fetch, cached for every later message.
      void ensureSenderProfile(record.sender_id).then(p => {
        if (!p || gen !== generation.current) return
        setMessages(prev => prev.map(m => (m.sender_id === p.id && !m.profiles ? { ...m, profiles: p } : m)))
      })
    }
    if (record.reply_to_id && !row.reply_to) {
      // Quoting a message older than the loaded pages.
      void fetchReply(record.reply_to_id).then(snap => {
        if (!snap || gen !== generation.current) return
        setMessages(prev => prev.map(m => (m.id === record.id ? { ...m, reply_to: snap } : m)))
      })
    }
    if (record.sender_id !== userId) scheduleMarkRead()
  }, [conversationId, userId, setMessages, scheduleMarkRead])

  const onUpdate = useCallback((payload: { new: MessageRecord }) => {
    if (!payload.new?.id) return
    setMessages(prev => applyMessageUpdate(prev, payload.new))
  }, [setMessages])

  const onReactionChange = useCallback((payload: Parameters<typeof applyReactionChange>[1]) => {
    setMessages(prev => applyReactionChange(prev, payload))
  }, [setMessages])

  useRealtimeChannel(chatTopics.messages(conversationId), messagesBindings(conversationId, { onInsert, onUpdate }), { onReconnect })
  useRealtimeChannel(chatTopics.reactions(conversationId), reactionsBindings({ onChange: onReactionChange }), { onReconnect })

  // ── Send (optimistic, retryable) ──────────────────────────────────────────
  const insertPending = useCallback(async (tempId: string): Promise<boolean> => {
    const pending = pendingSends.current.get(tempId)
    if (!pending || !userId) return false
    const gen = generation.current
    setMessages(prev => prev.map(m => (m.id === tempId ? { ...m, _sending: true, _failed: false } : m)))

    let { data, error: sendError } = await supabase
      .from('messages')
      .insert({
        // Client-generated, so a retry after a lost response can't post twice.
        id: tempId,
        conversation_id: conversationId,
        sender_id: userId,
        content: pending.content,
        image_url: pending.imageUrl,
        reply_to_id: pending.replyTo?.id ?? null,
        mentions: pending.mentions,
      })
      .select(MESSAGE_SELECT)
      .single()

    // Duplicate primary key: an earlier attempt landed but its response was
    // lost. The message is on the server, so this send succeeded.
    if (sendError?.code === '23505') {
      const existing = await supabase.from('messages').select(MESSAGE_SELECT).eq('id', tempId).maybeSingle()
      if (existing.data) {
        data = existing.data
        sendError = null
      } else {
        if (gen !== generation.current) return true
        pendingSends.current.delete(tempId)
        setMessages(prev => prev.map(m => (m.id === tempId ? { ...m, _sending: false, _failed: false } : m)))
        return true
      }
    }

    if (gen !== generation.current) return !sendError
    if (sendError || !data) {
      console.error('[useMessages] send error:', sendError?.message)
      setMessages(prev => prev.map(m => (m.id === tempId ? { ...m, _sending: false, _failed: true } : m)))
      return false
    }
    pendingSends.current.delete(tempId)
    const confirmed: MessageWithDetails = { ...(data as MessageWithDetails), reply_to: pending.replyTo }
    rememberProfile(confirmed.profiles)
    setMessages(prev => confirmSent(prev, tempId, confirmed))
    applyOwnMessageToConversations(userId, confirmed, confirmed.profiles)
    return true
  }, [conversationId, userId, setMessages])

  /** Resolves `true` once the server has the message; `false` leaves a "Tap to retry" row. */
  const sendMessage = useCallback(async (
    content: string | null,
    imageUrl: string | null = null,
    replyTo: MessageWithDetails | null = null,
    mentions: string[] = [],
  ): Promise<boolean> => {
    if (!userId) return false
    // The optimistic row's id is the real one (see newMessageId).
    const tempId = newMessageId()
    const replySnapshot = replyTo ? replySnapshotOf(replyTo) : null
    pendingSends.current.set(tempId, { content: content || null, imageUrl, replyTo: replySnapshot, mentions })
    const tempMessage: MessageWithDetails = {
      id: tempId,
      conversation_id: conversationId,
      sender_id: userId,
      content: content || null,
      image_url: imageUrl,
      reply_to_id: replyTo?.id ?? null,
      created_at: new Date().toISOString(),
      deleted_at: null,
      edited_at: null,
      profiles: getQueryData<SenderProfile>(profileBriefKey(userId)) ?? null,
      message_reactions: [],
      reply_to: replySnapshot,
      _sending: true,
    }
    setMessages(prev => [tempMessage, ...prev])
    return insertPending(tempId)
  }, [conversationId, userId, setMessages, insertPending])

  const retryMessage = useCallback((tempId: string) => insertPending(tempId), [insertPending])

  // ── Edit / delete (useMutation: rollback + Alert on failure) ──────────────
  const edit = useMutation(
    async ({ id, content, editedAt }: { id: string; content: string; editedAt: string }) => {
      const { data, error: e } = await supabase
        .from('messages')
        .update({ content, edited_at: editedAt })
        .eq('id', id)
        .select('id')
      if (e) throw e
      if (!data?.length) throw new Error('Message not updated')
      // mutate() resolves undefined on failure, so success must return a value.
      return true
    },
    {
      onMutate: ({ id, content, editedAt }) => {
        const before = messagesRef.current.find(m => m.id === id)
        setMessages(prev => prev.map(m => (m.id === id ? { ...m, content, edited_at: editedAt } : m)))
        if (!before) return
        return () => setMessages(prev => prev.map(m => (m.id === id ? { ...m, content: before.content, edited_at: before.edited_at } : m)))
      },
      onError: () => chatAlert("Couldn't edit message", NETWORK_ERROR_MESSAGE),
    },
  )
  const editMutate = edit.mutate
  /** Resolves `true` on success; on failure the bubble is rolled back and an Alert shown. */
  const editMessage = useCallback(async (messageId: string, newContent: string) => {
    const r = await editMutate({ id: messageId, content: newContent, editedAt: new Date().toISOString() })
    return r !== undefined
  }, [editMutate])

  const remove = useMutation(
    async ({ id, deletedAt }: { id: string; deletedAt: string }) => {
      const { data, error: e } = await supabase
        .from('messages')
        .update({ deleted_at: deletedAt })
        .eq('id', id)
        .select('id')
      if (e) throw e
      if (!data?.length) throw new Error('Message not deleted')
      return true
    },
    {
      onMutate: ({ id, deletedAt }) => {
        const before = messagesRef.current.find(m => m.id === id)
        setMessages(prev => prev.map(m => (m.id === id ? { ...m, deleted_at: deletedAt } : m)))
        if (!before) return
        return () => setMessages(prev => prev.map(m => (m.id === id ? { ...m, deleted_at: before.deleted_at } : m)))
      },
      onError: () => chatAlert("Couldn't delete message", NETWORK_ERROR_MESSAGE),
    },
  )
  const removeMutate = remove.mutate
  const deleteMessage = useCallback(async (messageId: string) => {
    const r = await removeMutate({ id: messageId, deletedAt: new Date().toISOString() })
    return r !== undefined
  }, [removeMutate])

  // ── Reactions (optimistic; not useMutation — taps on different messages must not block each other) ──
  const toggleReaction = useCallback(async (messageId: string, emoji: string) => {
    if (!userId) return
    const existing = messagesRef.current
      .find(m => m.id === messageId)
      ?.message_reactions.find(r => r.user_id === userId && r.emoji === emoji)
    const reaction = { message_id: messageId, user_id: userId, emoji, created_at: new Date().toISOString() }
    const add = () => setMessages(prev => applyReactionChange(prev, { eventType: 'INSERT', new: reaction }))
    const drop = () => setMessages(prev => applyReactionChange(prev, { eventType: 'DELETE', old: reaction }))

    if (existing) {
      drop()
      const { error: e } = await supabase
        .from('message_reactions')
        .delete()
        .eq('message_id', messageId)
        .eq('user_id', userId)
        .eq('emoji', emoji)
      if (e) {
        add()
        chatAlert("Couldn't remove reaction", NETWORK_ERROR_MESSAGE)
      }
    } else {
      add()
      const { error: e } = await supabase
        .from('message_reactions')
        .insert({ message_id: messageId, user_id: userId, emoji })
      // 23505: already reacted (double tap / another device) — the optimistic state is right.
      if (e && e.code !== '23505') {
        drop()
        chatAlert("Couldn't add reaction", NETWORK_ERROR_MESSAGE)
      }
    }
  }, [userId, setMessages])

  /** Upload a picked image; resolves to its object path, or `null` on failure (the caller must not send without it). */
  const uploadImage = useCallback(async (uri: string): Promise<string | null> => {
    if (!userId) return null
    try {
      const response = await fetch(uri)
      const blob = await response.blob()

      // Prefer the blob's MIME type (reliable on web blob/data URLs).
      // Fall back to the file extension for native file:// URIs where blob.type may be empty.
      const mimeType = blob.type || 'image/jpeg'
      const extFromMime = mimeType.split('/')[1]?.toLowerCase().replace('jpeg', 'jpg') ?? 'jpg'
      const VALID_EXTS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic'])
      const uriExt = uri.split('?')[0].split('.').pop()?.toLowerCase()
      const ext = (uriExt && VALID_EXTS.has(uriExt)) ? uriExt : extFromMime

      // Unguessable name: the bucket is private, but don't make paths enumerable either.
      const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`
      const { error: e } = await supabase.storage
        .from(CHAT_IMAGES_BUCKET)
        .upload(path, blob, { contentType: mimeType })
      if (e) {
        console.error('[uploadImage] storage upload failed:', e.message)
        return null
      }
      // The object path, not a URL: the bucket is private and viewers get
      // short-lived signed URLs (useChatImageUrl).
      return path
    } catch (e) {
      console.error('[uploadImage] failed:', (e as Error)?.message)
      return null
    }
  }, [userId])

  return {
    messages, loading, error, hasMore, loadMore, refresh,
    sendMessage, retryMessage, deleteMessage, editMessage, toggleReaction, uploadImage,
  }
}
