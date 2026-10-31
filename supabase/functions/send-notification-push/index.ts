/**
 * Edge Function: send-notification-push
 *
 * Triggered by a Supabase Database Webhook on notifications INSERT. Pushes
 * every inbox notification (event reminders, cancellations, waitlist, cheers,
 * join requests, late dropouts, and any type added later) to the recipient's
 * devices, unless they turned push off for that type in Settings →
 * Notifications (profiles.notification_prefs.push.<type> = false). Tapping
 * the push opens the row's data.deep_link in the app.
 *
 * Deployed with verify_jwt = false (supabase/config.toml), so the request is
 * authenticated here by requireWebhookAuth: either the service-role key as a
 * bearer token or the optional WEBHOOK_SECRET in `x-webhook-secret`.
 *
 * Set up the webhook in Supabase Dashboard → Database → Webhooks:
 *   Table: notifications
 *   Events: INSERT
 *   Type: Supabase Edge Functions → send-notification-push
 *   Headers: x-webhook-secret: <WEBHOOK_SECRET>
 *            (or Authorization: Bearer <service-role-key>)
 *
 * Same delivery rules as send-chat-push: chunks of 100, DeviceNotRegistered
 * tokens deleted, ticket ids stored in push_receipts for check-push-receipts.
 * chat_mention rows are not pushed (send-chat-push already delivered the
 * message they point at).
 *
 * Failure rules:
 *   - A database error before anything is sent returns 500 (the webhook retries).
 *   - Failures AFTER pushes went out are only logged: a 500 would push twice.
 */

import { requireWebhookAuth } from '../_shared/webhook.ts'
import { chunk, EXPO_BATCH_SIZE, EXPO_PUSH_URL, getServiceClient } from '../_shared/supabase.ts'
import { buildPushMessages, parseNotificationWebhook, shouldPush, type NotificationPrefsJson } from '../_shared/notificationPush.ts'

type ExpoTicket =
  | { status: 'ok'; id: string }
  | { status: 'error'; message: string; details?: { error?: string } }

/**
 * Best-effort dedupe of webhook retries, keyed on the notification id. Per
 * isolate and lost on cold start (like send-chat-push). Claimed on arrival and
 * released if we fail before sending, so a retry after a 500 is processed.
 */
const DEDUPE_TTL_MS = 10 * 60 * 1000
const DEDUPE_MAX = 5000
const recent = new Map<string, number>()

function claim(id: string): boolean {
  const now = Date.now()
  for (const [key, at] of recent) {
    if (now - at > DEDUPE_TTL_MS || recent.size >= DEDUPE_MAX) recent.delete(key)
    else break
  }
  if (recent.has(id)) return false
  recent.set(id, now)
  return true
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const denied = requireWebhookAuth(req)
  if (denied) return denied

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return new Response('Invalid JSON', { status: 400 })
  }
  const record = parseNotificationWebhook(body)
  if (!record) return new Response('Invalid payload', { status: 400 })

  if (!claim(record.id)) return new Response('Duplicate delivery ignored', { status: 200 })

  const fail = (what: string, error: { message: string }) => {
    console.error(`send-notification-push: ${what} failed`, error.message)
    recent.delete(record.id)
    return new Response(`${what} failed`, { status: 500 })
  }

  let supabase: ReturnType<typeof getServiceClient>
  try {
    supabase = getServiceClient()
  } catch (e) {
    return fail('client setup', e instanceof Error ? e : { message: String(e) })
  }

  const [prefsRes, tokensRes] = await Promise.all([
    supabase.from('profiles').select('notification_prefs').eq('id', record.user_id).maybeSingle(),
    supabase.from('push_tokens').select('token').eq('user_id', record.user_id),
  ])
  if (prefsRes.error) return fail('prefs lookup', prefsRes.error)
  if (tokensRes.error) return fail('token lookup', tokensRes.error)

  const prefs = (prefsRes.data as { notification_prefs: NotificationPrefsJson } | null)?.notification_prefs
  if (!shouldPush(record, prefs)) return new Response('Not pushed for this type', { status: 200 })

  const tokens = ((tokensRes.data ?? []) as { token: string }[]).map(r => r.token)
  const messages = buildPushMessages(record, tokens)
  if (!messages.length) return new Response('No tokens', { status: 200 })

  const deadTokens: string[] = []
  const receipts: { ticket_id: string; token: string }[] = []

  for (const batch of chunk(messages, EXPO_BATCH_SIZE)) {
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(batch),
      })
      if (!res.ok) console.warn('push send returned HTTP', res.status)
      const json = await res.json().catch(() => null)
      const tickets: ExpoTicket[] = json?.data ?? []
      tickets.forEach((t, i) => {
        const token = batch[i].to
        if (t.status === 'ok') receipts.push({ ticket_id: t.id, token })
        else if (t.details?.error === 'DeviceNotRegistered') deadTokens.push(token)
        else console.warn('push ticket error', t.message, t.details?.error)
      })
    } catch (e) {
      console.error('push batch failed', e)
    }
  }

  // From here on pushes may have gone out: log failures, never return 500.
  if (deadTokens.length) {
    const { error } = await supabase.from('push_tokens').delete().in('token', deadTokens)
    if (error) console.error('dead token cleanup failed:', error.message)
  }
  if (receipts.length) {
    const { error } = await supabase.from('push_receipts').insert(receipts)
    if (error) console.warn('push_receipts insert skipped:', error.message)
  }

  return new Response(JSON.stringify({ sent: receipts.length, removedTokens: deadTokens.length }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})
