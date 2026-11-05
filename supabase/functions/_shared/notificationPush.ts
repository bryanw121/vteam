/**
 * Pure helpers for send-notification-push: read the webhook payload, decide
 * whether a notification row is pushed, and build the Expo messages. No Deno
 * globals and no URL imports, so jest can import this file
 * (__tests__/notificationPush.test.ts).
 */

export type NotificationRecord = {
  id: string
  user_id: string
  notification_type: string
  title: string
  body: string
  data: Record<string, unknown>
}

export type NotificationPrefsJson = { push?: Record<string, unknown> } | null | undefined

export type ExpoPushMessage = {
  to: string
  title: string
  body: string
  data: { deep_link?: string; event_id?: string; notification_id: string; notification_type: string }
  sound: 'default'
}

/**
 * Types another sender already pushes. chat_mention rows are created for a chat
 * message that send-chat-push already delivers to every member, so pushing the
 * row as well would buzz the phone twice for one message.
 */
export const PUSHED_ELSEWHERE: readonly string[] = ['chat_mention']

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The notifications row from a Database Webhook body (`{ type: 'INSERT', record }`), or null if it isn't one. */
export function parseNotificationWebhook(body: unknown): NotificationRecord | null {
  if (!body || typeof body !== 'object') return null
  const b = body as { type?: unknown; table?: unknown; record?: unknown }
  if (b.type !== undefined && b.type !== 'INSERT') return null
  if (b.table !== undefined && b.table !== 'notifications') return null
  const r = b.record as Partial<NotificationRecord> | null | undefined
  if (!r || typeof r !== 'object') return null
  if (typeof r.id !== 'string' || !UUID_RE.test(r.id)) return null
  if (typeof r.user_id !== 'string' || !UUID_RE.test(r.user_id)) return null
  if (typeof r.notification_type !== 'string' || !r.notification_type) return null
  return {
    id: r.id,
    user_id: r.user_id,
    notification_type: r.notification_type,
    title: typeof r.title === 'string' ? r.title : '',
    body: typeof r.body === 'string' ? r.body : '',
    data: r.data && typeof r.data === 'object' ? (r.data as Record<string, unknown>) : {},
  }
}

/** Same rule as public.notification_pref_enabled: only an explicit false turns push off. */
export function pushEnabled(prefs: NotificationPrefsJson, type: string): boolean {
  const v = prefs?.push?.[type]
  if (v === false || v === 'false') return false
  return true
}

/** Whether this row should be pushed at all (before looking at tokens). */
export function shouldPush(record: NotificationRecord, prefs: NotificationPrefsJson): boolean {
  if (PUSHED_ELSEWHERE.includes(record.notification_type)) return false
  if (!record.title.trim() && !record.body.trim()) return false
  return pushEnabled(prefs, record.notification_type)
}

/** Only an in-app absolute path, as the app's isAppPath (utils/routes.ts). */
export function safeDeepLink(v: unknown): string | undefined {
  return typeof v === 'string' && v.startsWith('/') && !v.startsWith('//') && !v.includes('://') && !v.includes('\\') ? v : undefined
}

/** One Expo message per token. Tapping it opens `data.deep_link` (see utils/pushNotifications.ts). */
export function buildPushMessages(record: NotificationRecord, tokens: string[]): ExpoPushMessage[] {
  const deepLink = safeDeepLink(record.data.deep_link)
  const eventId = typeof record.data.event_id === 'string' ? record.data.event_id : undefined
  return [...new Set(tokens)].map(to => ({
    to,
    title: record.title,
    body: record.body,
    data: {
      ...(deepLink ? { deep_link: deepLink } : {}),
      ...(eventId ? { event_id: eventId } : {}),
      notification_id: record.id,
      notification_type: record.notification_type,
    },
    sound: 'default',
  }))
}
