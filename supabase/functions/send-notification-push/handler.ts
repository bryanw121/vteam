/**
 * Edge Function: send-notification-push
 *
 * Triggered by a Supabase Database Webhook on notifications INSERT. Pushes
 * every inbox notification (event reminders, cancellations, waitlist, cheers,
 * join requests, late dropouts, and any type added later) to the recipient's
 * devices, unless they turned push off for that type in Settings →
 * Notifications (user_settings.notification_prefs.push.<type> = false; the
 * legacy profiles.notification_prefs is read only when user_settings has none,
 * the same fallback as public.notification_pref_enabled). Tapping
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
 * Web tokens (platform 'web', #189) get standard Web Push through
 * _shared/webpush.ts (VAPID secrets; skipped when they are not set); a 404/410
 * deletes the subscription.
 *
 * Same delivery rules as send-chat-push: chunks of 100, DeviceNotRegistered
 * tokens deleted, ticket ids stored in push_receipts for check-push-receipts.
 * chat_mention rows are not pushed (send-chat-push already delivered the
 * message they point at).
 *
 * Failure rules:
 *   - A database error before anything is sent returns 500 (the webhook retries).
 *   - Failures AFTER pushes went out are only logged: a 500 would push twice.
 *
 * index.ts serves this with the real dependencies; handler.test.ts runs it
 * against a fake database and a stubbed network.
 */

import { requireWebhookAuth } from '../_shared/webhook.ts'
import { chunk, EXPO_BATCH_SIZE, EXPO_PUSH_URL } from '../_shared/expo.ts'
import type { DbClient, Deps } from '../_shared/deps.ts'
import { buildPushMessages, parseNotificationWebhook, safeDeepLink, shouldPush, type NotificationPrefsJson } from '../_shared/notificationPush.ts'
import { sendToWebTokens, vapidFromEnv, type WebToken } from '../_shared/webpush.ts'

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

export function createHandler(deps: Deps) {
  // Per handler, so per isolate in production (index.ts creates one) and fresh in each test.
  const recent = new Map<string, number>()

  function claim(id: string): boolean {
    const now = deps.now()
    for (const [key, at] of recent) {
      if (now - at > DEDUPE_TTL_MS || recent.size >= DEDUPE_MAX) recent.delete(key)
      else break
    }
    if (recent.has(id)) return false
    recent.set(id, now)
    return true
  }

  return async (req: Request): Promise<Response> => {
    if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

    const denied = requireWebhookAuth(req, deps.env)
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

    let supabase: DbClient
    try {
      supabase = deps.getClient()
    } catch (e) {
      return fail('client setup', e instanceof Error ? e : { message: String(e) })
    }

    // The switches live in user_settings (owner-only) since #99; profiles keeps
    // only the legacy default, read as a fallback like notification_pref_enabled.
    const [settingsRes, profileRes, tokensRes] = await Promise.all([
      supabase.from('user_settings').select('notification_prefs').eq('user_id', record.user_id).maybeSingle(),
      supabase.from('profiles').select('notification_prefs').eq('id', record.user_id).maybeSingle(),
      supabase.from('push_tokens').select('token, platform, web_keys').eq('user_id', record.user_id),
    ])
    if (settingsRes.error) return fail('prefs lookup', settingsRes.error)
    if (profileRes.error) return fail('prefs lookup', profileRes.error)
    if (tokensRes.error) return fail('token lookup', tokensRes.error)

    type PrefsRow = { notification_prefs: NotificationPrefsJson | null } | null
    const prefs = (settingsRes.data as PrefsRow)?.notification_prefs
      ?? (profileRes.data as PrefsRow)?.notification_prefs
      ?? undefined
    if (!shouldPush(record, prefs)) return new Response('Not pushed for this type', { status: 200 })

    type TokenRow = { token: string; platform?: string | null; web_keys?: unknown }
    const rows = (tokensRes.data ?? []) as TokenRow[]
    const tokens = rows.filter(r => r.platform !== 'web').map(r => r.token)
    const webTokens: WebToken[] = rows.filter(r => r.platform === 'web').map(r => ({ token: r.token, web_keys: r.web_keys }))
    const messages = buildPushMessages(record, tokens)
    const vapid = webTokens.length ? vapidFromEnv(deps.env) : null
    if (webTokens.length && !vapid) console.warn('web push skipped: VAPID secrets are not set')
    if (!messages.length && !vapid) return new Response('No tokens', { status: 200 })

    const deadTokens: string[] = []
    const receipts: { ticket_id: string; token: string }[] = []
    let webSent = 0

    // Web Push (#189): one encrypted POST per browser subscription.
    if (vapid) {
      const deepLink = safeDeepLink(record.data.deep_link)
      const web = await sendToWebTokens(deps.fetch, vapid, webTokens, {
        title: record.title,
        body: record.body,
        ...(deepLink ? { deep_link: deepLink } : {}),
        tag: record.notification_type,
      }, deps.now())
      webSent = web.sent
      deadTokens.push(...web.dead)
    }

    for (const batch of chunk(messages, EXPO_BATCH_SIZE)) {
      try {
        const res = await deps.fetch(EXPO_PUSH_URL, {
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

    return new Response(JSON.stringify({ sent: receipts.length, ...(webTokens.length ? { webSent } : {}), removedTokens: deadTokens.length }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
