/**
 * Edge Function: send-chat-push
 *
 * Triggered by a Supabase Database Webhook on messages INSERT.
 * Sends Expo push notifications to all conversation members except the sender.
 *
 * Deployed with verify_jwt = false (supabase/config.toml), so the request is
 * authenticated here by requireWebhookAuth: either the service-role key as a
 * bearer token or the optional WEBHOOK_SECRET in `x-webhook-secret`.
 *
 * Set up the webhook in Supabase Dashboard → Database → Webhooks:
 *   Table: messages
 *   Events: INSERT
 *   URL: https://<project-ref>.supabase.co/functions/v1/send-chat-push
 *   Headers: Authorization: Bearer <service-role-key>
 *            (or x-webhook-secret: <WEBHOOK_SECRET>)
 *
 * Reliability rules (Expo push docs):
 *   - At most 100 messages per request, so tokens are sent in chunks.
 *   - Each message gets a ticket back. A ticket error of DeviceNotRegistered means
 *     the app was uninstalled or the token rotated: that token is deleted so we stop
 *     sending to it. Ticket ids are stored in push_receipts so check-push-receipts
 *     can read delivery receipts later (Expo keeps them ~24h).
 *   - Members who muted the sender (chat_silences) get no push.
 *
 * Failure rules:
 *   - A database error before anything is sent returns 500 (the webhook retries)
 *     rather than being mistaken for "no recipients".
 *   - Failures AFTER pushes went out (token cleanup, receipt bookkeeping) are only
 *     logged: returning 500 there would make the webhook retry and push twice.
 *
 * index.ts serves this with the real dependencies; handler.test.ts runs it
 * against a fake database and a stubbed network.
 */

import { requireWebhookAuth } from '../_shared/webhook.ts'
import { chunk, EXPO_BATCH_SIZE, EXPO_PUSH_URL } from '../_shared/expo.ts'
import { sendToWebTokens, vapidFromEnv, type WebToken } from '../_shared/webpush.ts'
import type { DbClient, Deps } from '../_shared/deps.ts'

interface MessagePayload {
  id?: string
  conversation_id: string
  sender_id: string
  content: string | null
  image_url: string | null
}

type ExpoTicket =
  | { status: 'ok'; id: string }
  | { status: 'error'; message: string; details?: { error?: string } }

/**
 * Best-effort dedupe of webhook retries.
 *
 * Remembers recently handled message ids in this isolate's memory. It does NOT
 * survive a cold start and is not shared between isolates, so a retry that lands
 * on a different instance can still push twice. A durable guarantee needs a
 * column or table (e.g. messages.push_sent_at); that is deliberately not added here.
 * An id is claimed on arrival and released if we fail before sending, so a retry
 * after a 500 is processed normally.
 */
const DEDUPE_TTL_MS = 10 * 60 * 1000
const DEDUPE_MAX = 5000

export function createHandler(deps: Deps) {
  // Per handler, so per isolate in production (index.ts creates one) and fresh in each test.
  const recentMessages = new Map<string, number>() // id -> claimed at; insertion order = age order

  function claimMessage(id: string | undefined): boolean {
    if (!id) return true
    const now = deps.now()
    for (const [key, claimedAt] of recentMessages) {
      if (now - claimedAt > DEDUPE_TTL_MS || recentMessages.size >= DEDUPE_MAX) recentMessages.delete(key)
      else break
    }
    if (recentMessages.has(id)) return false
    recentMessages.set(id, now)
    return true
  }

  function releaseMessage(id: string | undefined) {
    if (id) recentMessages.delete(id)
  }

  return async (req: Request): Promise<Response> => {
    if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

    const denied = requireWebhookAuth(req, deps.env)
    if (denied) return denied

    let body: { record?: MessagePayload } | null
    try {
      body = await req.json()
    } catch {
      return new Response('Invalid JSON', { status: 400 })
    }
    const message = body?.record

    if (!message?.conversation_id || !message?.sender_id) {
      return new Response('Invalid payload', { status: 400 })
    }

    if (!claimMessage(message.id)) {
      return new Response('Duplicate delivery ignored', { status: 200 })
    }

    // Everything before the first push is retryable: release the claim on any failure.
    const fail = (what: string, error: { message: string }) => {
      console.error(`send-chat-push: ${what} failed`, error.message)
      releaseMessage(message.id)
      return new Response(`${what} failed`, { status: 500 })
    }

    let supabase: DbClient
    try {
      supabase = deps.getClient()
    } catch (e) {
      return fail('client setup', e instanceof Error ? e : { message: String(e) })
    }

    // Sender, conversation and members are independent: fetch them together.
    // maybeSingle: a missing row is not an error (sender falls back to "Someone").
    const [senderRes, convRes, membersRes] = await Promise.all([
      supabase.from('profiles').select('username, first_name, last_name').eq('id', message.sender_id).maybeSingle(),
      supabase.from('conversations').select('type, clubs(name)').eq('id', message.conversation_id).maybeSingle(),
      supabase.from('conversation_members').select('user_id').eq('conversation_id', message.conversation_id).neq('user_id', message.sender_id),
    ])
    if (senderRes.error) return fail('sender lookup', senderRes.error)
    if (convRes.error) return fail('conversation lookup', convRes.error)
    if (membersRes.error) return fail('member lookup', membersRes.error)

    const sender = senderRes.data as { username: string; first_name: string | null; last_name: string | null } | null
    const conv = convRes.data as { type: string; clubs: { name: string | null } | null } | null
    const members = membersRes.data as { user_id: string }[] | null

    if (!members?.length) return new Response('No recipients', { status: 200 })

    const memberIds = members.map((m) => m.user_id)

    // Skip members who muted the sender. If we cannot tell who muted, do not send.
    const silencedRes = await supabase
      .from('chat_silences')
      .select('user_id')
      .eq('silenced_user_id', message.sender_id)
      .in('user_id', memberIds)
    if (silencedRes.error) return fail('mute lookup', silencedRes.error)
    const muted = new Set(((silencedRes.data ?? []) as { user_id: string }[]).map((r) => r.user_id))
    const recipientIds = memberIds.filter((id) => !muted.has(id))
    if (!recipientIds.length) return new Response('All recipients muted the sender', { status: 200 })

    const tokensRes = await supabase.from('push_tokens').select('token, platform, web_keys').in('user_id', recipientIds)
    if (tokensRes.error) return fail('token lookup', tokensRes.error)

    type TokenRow = { token: string; platform?: string | null; web_keys?: unknown }
    const rows = (tokensRes.data ?? []) as TokenRow[]
    const tokens = [...new Set(rows.filter((r) => r.platform !== 'web').map((r) => r.token))]
    const webTokens: WebToken[] = rows.filter((r) => r.platform === 'web').map((r) => ({ token: r.token, web_keys: r.web_keys }))
    const vapid = webTokens.length ? vapidFromEnv(deps.env) : null
    if (webTokens.length && !vapid) console.warn('web push skipped: VAPID secrets are not set')
    if (!tokens.length && !vapid) return new Response('No tokens', { status: 200 })

    const senderName = sender
      ? ([sender.first_name, sender.last_name].filter(Boolean).join(' ') || sender.username)
      : 'Someone'
    const isClub = conv?.type === 'club'
    const clubName = isClub ? conv?.clubs?.name : null
    const notifTitle = isClub ? `${senderName} in ${clubName ?? 'Club Chat'}` : senderName
    const notifBody = message.image_url && !message.content ? '📷 Image' : (message.content ?? '')

    const deadTokens: string[] = []
    const receipts: { ticket_id: string; token: string }[] = []
    let webSent = 0

    // Web Push (#189): browser subscriptions open the conversation on tap.
    if (vapid) {
      const web = await sendToWebTokens(deps.fetch, vapid, webTokens, {
        title: notifTitle,
        body: notifBody,
        deep_link: `/chat/${message.conversation_id}`,
        tag: 'chat',
      }, deps.now())
      webSent = web.sent
      deadTokens.push(...web.dead)
    }

    for (const batch of chunk(tokens, EXPO_BATCH_SIZE)) {
      const notifications = batch.map((token) => ({
        to: token,
        title: notifTitle,
        body: notifBody,
        data: { conversation_id: message.conversation_id },
        sound: 'default',
        badge: 1,
      }))

      try {
        const res = await deps.fetch(EXPO_PUSH_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(notifications),
        })
        if (!res.ok) console.warn('push send returned HTTP', res.status)
        const json = await res.json().catch(() => null)
        const tickets: ExpoTicket[] = json?.data ?? []
        // Tickets come back in the same order as the messages sent.
        tickets.forEach((t, i) => {
          const token = batch[i]
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
      // Optional table: if the migration hasn't been applied yet, just skip.
      const { error } = await supabase.from('push_receipts').insert(receipts)
      if (error) console.warn('push_receipts insert skipped:', error.message)
    }

    return new Response(JSON.stringify({ sent: receipts.length, ...(webTokens.length ? { webSent } : {}), removedTokens: deadTokens.length, muted: muted.size }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
