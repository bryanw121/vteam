import { Alert, Platform } from 'react-native'
import type { RealtimeBinding } from '../lib/realtime'
import type {
  ConversationRow, DebouncedCall, Message, MessageReaction, MessageRecord, MessageWithDetails, ReplySnapshot, SenderProfile,
} from '../types'

export function timeAgo(iso: string | null): string {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d`
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' })
}

export function lastMessagePreview(row: ConversationRow, myId: string, silencedIds?: Set<string>): string {
  if (!row.last_message_at) return 'No messages yet'
  if (row.last_message_deleted_at) return 'Deleted message'
  const prefix = row.last_sender_id === myId ? 'You: ' : ''
  if (
    silencedIds
    && row.type === 'club'
    && row.last_sender_id
    && row.last_sender_id !== myId
    && silencedIds.has(row.last_sender_id)
  ) {
    return prefix ? `${prefix}Message hidden` : 'Message hidden'
  }
  if (row.last_message_image_url && !row.last_message_content) return `${prefix}📷 Image`
  return `${prefix}${row.last_message_content ?? ''}`
}

/** Alert that also works on web (react-native-web's Alert.alert is a no-op). */
export function chatAlert(title: string, message: string): void {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') window.alert(`${title}\n\n${message}`)
  } else {
    Alert.alert(title, message)
  }
}

// ── Realtime topics & bindings ───────────────────────────────────────────────
//
// lib/realtime keeps one channel per topic and requires every subscriber of a
// topic to pass the same bindings (event/table/filter). Each topic's binding
// set is therefore defined exactly once, here; hooks only supply handlers.
// One topic per purpose, scoped to the conversation or user it serves, so two
// screens never share a channel by accident (the old `conversations-list` /
// `chat-silences-<uid>` names were shared, and one screen unmounting killed
// the other's subscription).

export const chatTopics = {
  /** New / edited / deleted messages in one room. */
  messages: (conversationId: string) => `messages:${conversationId}`,
  /** Reactions for one open room (message_reactions has no conversation column, so it is unfiltered; RLS scopes it). */
  reactions: (conversationId: string) => `reactions:${conversationId}`,
  /** Everything the conversation list / unread badge derive from, for one user. */
  conversations: (userId: string) => `conversations:${userId}`,
  /** The user's own chat_silences rows. */
  silences: (userId: string) => `silences:${userId}`,
} as const

type Handler = RealtimeBinding['handler']

export function messagesBindings(
  conversationId: string,
  h: { onInsert: Handler; onUpdate: Handler },
): RealtimeBinding[] {
  const filter = `conversation_id=eq.${conversationId}`
  return [
    { event: 'INSERT', table: 'messages', filter, handler: h.onInsert },
    { event: 'UPDATE', table: 'messages', filter, handler: h.onUpdate },
  ]
}

export function reactionsBindings(h: { onChange: Handler }): RealtimeBinding[] {
  return [{ event: '*', table: 'message_reactions', handler: h.onChange }]
}

/**
 * `messages` is unfiltered (a user's conversations can't be expressed as one
 * filter); RLS limits delivery to conversations the user belongs to.
 * `conversation_members` is filtered to the user's own membership rows — that is
 * where `last_read_at` lives.
 */
export function conversationsBindings(
  userId: string,
  h: { onMessageInsert: Handler; onMessageUpdate: Handler; onMembershipUpdate: Handler },
): RealtimeBinding[] {
  return [
    { event: 'INSERT', table: 'messages', handler: h.onMessageInsert },
    { event: 'UPDATE', table: 'messages', handler: h.onMessageUpdate },
    { event: 'UPDATE', table: 'conversation_members', filter: `user_id=eq.${userId}`, handler: h.onMembershipUpdate },
  ]
}

export function silencesBindings(userId: string, h: { onChange: Handler }): RealtimeBinding[] {
  return [{ event: '*', table: 'chat_silences', filter: `user_id=eq.${userId}`, handler: h.onChange }]
}

// ── Payload → message rows ───────────────────────────────────────────────────

/** Quote snapshot of `m` for a reply bubble. */
export function replySnapshotOf(m: MessageWithDetails): ReplySnapshot {
  return {
    id: m.id,
    content: m.content,
    image_url: m.image_url,
    deleted_at: m.deleted_at,
    profiles: m.profiles
      ? { id: m.profiles.id, username: m.profiles.username, first_name: m.profiles.first_name, last_name: m.profiles.last_name }
      : null,
  }
}

/**
 * Build a renderable row from a realtime `messages` INSERT payload without a
 * round trip: the sender comes from the profile cache, the quoted message from
 * the rows already loaded. Either may be null; the caller fetches what's missing
 * (once) and patches the row.
 */
export function buildIncomingMessage(
  record: MessageRecord,
  sender: SenderProfile | null | undefined,
  loaded: readonly MessageWithDetails[],
): MessageWithDetails {
  const quoted = record.reply_to_id ? loaded.find(m => m.id === record.reply_to_id && !m._sending && !m._failed) : undefined
  return {
    id: record.id,
    conversation_id: record.conversation_id,
    sender_id: record.sender_id,
    content: record.content ?? null,
    image_url: record.image_url ?? null,
    reply_to_id: record.reply_to_id ?? null,
    created_at: record.created_at,
    deleted_at: record.deleted_at ?? null,
    edited_at: record.edited_at ?? null,
    profiles: sender ?? null,
    message_reactions: [],
    reply_to: quoted ? replySnapshotOf(quoted) : null,
  }
}

function newestFirst(a: MessageWithDetails, b: MessageWithDetails): number {
  return b.created_at.localeCompare(a.created_at)
}

/**
 * Id for a message we are about to send. Generated on the client and sent with
 * the insert, so the optimistic row, the insert response and the realtime echo
 * all share it, and a retry after a lost response fails as a duplicate.
 * `crypto.randomUUID` is missing on some runtimes (Hermes); fall back to a
 * Math.random v4 UUID.
 */
export function newMessageId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto
  if (typeof c?.randomUUID === 'function') return c.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, ch => {
    const r = (Math.random() * 16) | 0
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

/**
 * Add an incoming row to a newest-first list. Idempotent: a row already present
 * by id is replaced in place — including our own optimistic row (sending or
 * failed), whose id is the client-generated one the insert used, so a "failed"
 * send that actually landed turns into a sent message. As a fallback, an own
 * message also replaces a still-sending temp row with the same
 * content/image/reply, so the realtime echo of a send never shows twice.
 */
export function upsertIncoming(prev: readonly MessageWithDetails[], row: MessageWithDetails): MessageWithDetails[] {
  const existing = prev.findIndex(m => m.id === row.id)
  if (existing >= 0) {
    const next = prev.slice()
    const old = prev[existing]
    next[existing] = { ...row, message_reactions: old.message_reactions, reply_to: row.reply_to ?? old.reply_to, profiles: row.profiles ?? old.profiles }
    return next
  }
  const temp = prev.findIndex(m =>
    m._sending
    && m.sender_id === row.sender_id
    && (m.content ?? null) === (row.content ?? null)
    && (m.image_url ?? null) === (row.image_url ?? null)
    && (m.reply_to_id ?? null) === (row.reply_to_id ?? null),
  )
  const base = temp >= 0 ? prev.filter((_, i) => i !== temp) : prev.slice()
  const merged = temp >= 0 ? { ...row, reply_to: row.reply_to ?? prev[temp].reply_to, profiles: row.profiles ?? prev[temp].profiles } : row
  base.push(merged)
  return base.sort(newestFirst)
}

/** Replace the optimistic row `tempId` with the confirmed insert (or drop it if realtime already delivered the row). */
export function confirmSent(prev: readonly MessageWithDetails[], tempId: string, confirmed: MessageWithDetails): MessageWithDetails[] {
  const withoutTemp = prev.filter(m => m.id !== tempId)
  if (withoutTemp.some(m => m.id === confirmed.id)) {
    return withoutTemp.map(m => (m.id === confirmed.id ? { ...m, reply_to: m.reply_to ?? confirmed.reply_to } : m))
  }
  return [confirmed, ...withoutTemp].sort(newestFirst)
}

/** Apply a `messages` UPDATE (edit / soft delete) to the row and to quotes of it. */
export function applyMessageUpdate(prev: readonly MessageWithDetails[], record: MessageRecord): MessageWithDetails[] {
  let changed = false
  const next = prev.map(m => {
    if (m.id === record.id) {
      changed = true
      return {
        ...m,
        content: record.content ?? null,
        image_url: record.image_url ?? null,
        deleted_at: record.deleted_at ?? null,
        edited_at: record.edited_at ?? null,
      }
    }
    if (m.reply_to && m.reply_to.id === record.id) {
      changed = true
      return { ...m, reply_to: { ...m.reply_to, content: record.content ?? null, image_url: record.image_url ?? null, deleted_at: record.deleted_at ?? null } }
    }
    return m
  })
  return changed ? next : (prev as MessageWithDetails[])
}

type ReactionPayload = {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE'
  new?: Partial<MessageReaction>
  old?: Partial<MessageReaction>
}

/**
 * Apply a `message_reactions` change from its payload. Rows for messages that
 * aren't loaded are ignored; duplicates (our own optimistic toggle echoing back)
 * are no-ops. Returns `prev` unchanged when nothing applies.
 */
export function applyReactionChange(prev: readonly MessageWithDetails[], payload: ReactionPayload): MessageWithDetails[] {
  const same = (r: MessageReaction, x: Partial<MessageReaction>) =>
    r.message_id === x.message_id && r.user_id === x.user_id && r.emoji === x.emoji
  if (payload.eventType === 'INSERT' && payload.new?.message_id) {
    const rx = payload.new as MessageReaction
    const i = prev.findIndex(m => m.id === rx.message_id)
    if (i < 0 || prev[i].message_reactions.some(r => same(r, rx))) return prev as MessageWithDetails[]
    const next = prev.slice()
    next[i] = { ...prev[i], message_reactions: [...prev[i].message_reactions, { message_id: rx.message_id, user_id: rx.user_id, emoji: rx.emoji, created_at: rx.created_at ?? new Date().toISOString() }] }
    return next
  }
  if (payload.eventType === 'DELETE' && payload.old?.message_id) {
    const rx = payload.old
    const i = prev.findIndex(m => m.id === rx.message_id)
    if (i < 0 || !prev[i].message_reactions.some(r => same(r, rx))) return prev as MessageWithDetails[]
    const next = prev.slice()
    next[i] = { ...prev[i], message_reactions: prev[i].message_reactions.filter(r => !same(r, rx)) }
    return next
  }
  return prev as MessageWithDetails[]
}

/**
 * Merge a freshly fetched newest page into the loaded list (reconnect, pull to
 * refresh). Older pages the user scrolled through stay; rows in the page win;
 * unsent / failed optimistic rows stay on top unless the page has them.
 */
export function mergeLatestPage(prev: readonly MessageWithDetails[], page: readonly MessageWithDetails[]): MessageWithDetails[] {
  const pageIds = new Set(page.map(m => m.id))
  // A sending / failed row the server already has (same client-generated id) is sent: the page row wins.
  const pending = prev.filter(m => (m._sending || m._failed) && !pageIds.has(m.id))
  if (page.length === 0) return [...pending, ...prev.filter(m => !m._sending && !m._failed)]
  const oldestInPage = page[page.length - 1].created_at
  const older = prev.filter(m => !m._sending && !m._failed && !pageIds.has(m.id) && m.created_at < oldestInPage)
  return [...pending, ...page, ...older]
}

// ── Conversations list from payloads ─────────────────────────────────────────

export function sortConversations(rows: ConversationRow[]): ConversationRow[] {
  return rows.sort((a, b) => (b.last_message_at ?? b.created_at ?? '').localeCompare(a.last_message_at ?? a.created_at ?? ''))
}

/**
 * Patch the conversation a new message belongs to. `known: false` = the
 * conversation isn't in the list (e.g. someone just started a DM) and the list
 * must be refetched. Idempotent: a message already applied (`last_message_id`)
 * changes nothing, so several subscribers can run it on the same payload.
 */
export function applyMessageToConversations(
  rows: readonly ConversationRow[],
  msg: MessageRecord,
  myId: string,
  opts: { isOpen: boolean; sender?: SenderProfile | null },
): { rows: ConversationRow[]; known: boolean; changed: boolean } {
  const i = rows.findIndex(r => r.conversation_id === msg.conversation_id)
  if (i < 0) return { rows: rows as ConversationRow[], known: false, changed: false }
  const row = rows[i]
  if (row.last_message_id === msg.id) return { rows: rows as ConversationRow[], known: true, changed: false }
  if (row.last_message_at && msg.created_at < row.last_message_at) {
    // Older than what we show (out-of-order delivery): only the unread count could change.
    return { rows: rows as ConversationRow[], known: true, changed: false }
  }
  const fromOther = msg.sender_id !== myId
  const next = rows.slice()
  next[i] = {
    ...row,
    last_message_id: msg.id,
    last_message_content: msg.content ?? null,
    last_message_image_url: msg.image_url ?? null,
    last_message_at: msg.created_at,
    last_message_deleted_at: msg.deleted_at ?? null,
    last_sender_id: msg.sender_id,
    last_sender_username: opts.sender?.username ?? (fromOther ? null : row.last_sender_username),
    last_sender_first_name: opts.sender?.first_name ?? null,
    last_sender_last_name: opts.sender?.last_name ?? null,
    unread_count: fromOther && !opts.isOpen && !msg.deleted_at ? Number(row.unread_count ?? 0) + 1 : Number(row.unread_count ?? 0),
  }
  return { rows: sortConversations(next), known: true, changed: true }
}

/** A `messages` UPDATE: refresh the preview when the edited / deleted message is the one shown. */
export function applyMessageUpdateToConversations(rows: readonly ConversationRow[], msg: MessageRecord): ConversationRow[] {
  const i = rows.findIndex(r => r.conversation_id === msg.conversation_id && r.last_message_id === msg.id)
  if (i < 0) return rows as ConversationRow[]
  const row = rows[i]
  if (row.last_message_content === (msg.content ?? null) && row.last_message_deleted_at === (msg.deleted_at ?? null)) {
    return rows as ConversationRow[]
  }
  const next = rows.slice()
  next[i] = { ...row, last_message_content: msg.content ?? null, last_message_image_url: msg.image_url ?? null, last_message_deleted_at: msg.deleted_at ?? null }
  return next
}

/**
 * A `conversation_members` UPDATE for the signed-in user (read on another
 * device, or the echo of our own `mark_conversation_read`). Echoes are ignored
 * by the caller; here, a read that covers the last message zeroes the count,
 * anything else needs a refetch to recount.
 */
export function applyMembershipUpdate(
  rows: readonly ConversationRow[],
  member: { conversation_id: string; last_read_at: string | null },
): { rows: ConversationRow[]; needsRefetch: boolean } {
  const i = rows.findIndex(r => r.conversation_id === member.conversation_id)
  if (i < 0) return { rows: rows as ConversationRow[], needsRefetch: true }
  const row = rows[i]
  if (!member.last_read_at) return { rows: rows as ConversationRow[], needsRefetch: false }
  const coversLast = !row.last_message_at || new Date(member.last_read_at).getTime() >= new Date(row.last_message_at).getTime()
  if (!coversLast) return { rows: rows as ConversationRow[], needsRefetch: true }
  if (row.unread_count === 0 && row.my_last_read_at === member.last_read_at) return { rows: rows as ConversationRow[], needsRefetch: false }
  const next = rows.slice()
  next[i] = { ...row, unread_count: 0, my_last_read_at: member.last_read_at }
  return { rows: next, needsRefetch: false }
}

/** Unread total for the tab badge: DMs with silenced people don't count. */
export function unreadTotal(rows: readonly ConversationRow[], silenced: ReadonlySet<string>): number {
  let total = 0
  for (const r of rows) {
    if (r.type === 'dm' && r.other_user_id && silenced.has(r.other_user_id)) continue
    total += Number(r.unread_count ?? 0)
  }
  return total
}

// ── markRead debounce ────────────────────────────────────────────────────────

/** Trailing-edge debounce with flush, for `mark_conversation_read`. */
export function createDebouncedCall(fn: () => void, delayMs: number): DebouncedCall {
  let timer: ReturnType<typeof setTimeout> | null = null
  const run = () => {
    timer = null
    fn()
  }
  return {
    schedule: () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(run, delayMs)
    },
    flush: () => {
      if (!timer) return
      clearTimeout(timer)
      run()
    },
    cancel: () => {
      if (timer) clearTimeout(timer)
      timer = null
    },
    isPending: () => timer !== null,
  }
}

/**
 * The first-item index for `ascending`, given what it was for the previous
 * list: lowered by however many messages now sit before the old first one
 * (an older page was prepended). Appends and edits leave it unchanged.
 */
export function nextFirstItemIndex(
  prev: { firstId: string | null; firstIndex: number },
  ascending: readonly { id: string }[],
): number {
  if (!prev.firstId) return prev.firstIndex
  const k = ascending.findIndex(m => m.id === prev.firstId)
  return k > 0 ? prev.firstIndex - k : prev.firstIndex
}

// ─── Chat images (private bucket) ─────────────────────────────────────────────

const LEGACY_PUBLIC_MARKER = '/storage/v1/object/public/chat-images/'
const SIGNED_MARKER = '/storage/v1/object/sign/chat-images/'

/**
 * Where a message's `image_url` points, now that `chat-images` is private:
 *  - `{ kind: 'path', path }` for an object in the bucket: new messages store
 *    the object path (`<uid>/<file>`), older ones the former public URL;
 *    either way the app needs a signed URL to show it.
 *  - `{ kind: 'direct', uri }` for something already displayable: an image
 *    still uploading (`file:`, `blob:`, `data:`) or any other URL.
 */
export function chatImageRef(ref: string | null | undefined): { kind: 'path'; path: string } | { kind: 'direct'; uri: string } | null {
  if (!ref) return null
  for (const marker of [LEGACY_PUBLIC_MARKER, SIGNED_MARKER]) {
    const at = ref.indexOf(marker)
    if (at !== -1) {
      const path = decodeURIComponent(ref.slice(at + marker.length).split('?')[0])
      return path ? { kind: 'path', path } : null
    }
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(ref)) return { kind: 'direct', uri: ref }
  return { kind: 'path', path: ref }
}
