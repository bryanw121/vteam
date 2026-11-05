/**
 * Edge Function: check-push-receipts
 *
 * Reads Expo delivery receipts for pushes sent at least 15 minutes ago, deletes
 * tokens Apple/Google report as no longer registered, and clears checked tickets.
 * Run it every 30 minutes with pg_cron (see migration 20261024120500_push_receipts.sql).
 *
 * Deployed with verify_jwt = false (supabase/config.toml). pg_cron calls it with
 * `Authorization: Bearer <service-role-key>`, which requireWebhookAuth checks
 * (as does the optional `x-webhook-secret` / WEBHOOK_SECRET).
 *
 * Expo keeps receipts for about 24 hours and accepts up to 1000 ids per request.
 *
 * index.ts serves this with the real dependencies; handler.test.ts runs it
 * against a fake database and a stubbed network.
 */

import { requireWebhookAuth } from '../_shared/webhook.ts'
import { EXPO_RECEIPTS_URL, RECEIPT_BATCH } from '../_shared/expo.ts'
import type { DbClient, Deps } from '../_shared/deps.ts'

type Receipt = { status: 'ok' } | { status: 'error'; message: string; details?: { error?: string } }

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

export function createHandler(deps: Deps) {
  return async (req: Request): Promise<Response> => {
    const denied = requireWebhookAuth(req, deps.env)
    if (denied) return denied

    let supabase: DbClient
    try {
      supabase = deps.getClient()
    } catch (e) {
      console.error('check-push-receipts: client setup failed', e)
      return json({ error: 'client setup failed' }, 500)
    }

    const cutoff = new Date(deps.now() - 15 * 60 * 1000).toISOString()
    const { data: rows, error } = await supabase
      .from('push_receipts')
      .select('ticket_id, token')
      .lt('created_at', cutoff)
      .limit(RECEIPT_BATCH)
    if (error) {
      console.error('check-push-receipts: receipt lookup failed', error.message)
      return json({ error: error.message }, 500)
    }
    const tickets = (rows ?? []) as { ticket_id: string; token: string }[]
    if (!tickets.length) return json({ checked: 0 })

    let receipts: Record<string, Receipt> = {}
    try {
      const res = await deps.fetch(EXPO_RECEIPTS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ ids: tickets.map((r) => r.ticket_id) }),
      })
      if (!res.ok) {
        // Leave the rows in place; the next run retries until they age out.
        console.error('check-push-receipts: Expo returned HTTP', res.status)
        return json({ error: `Expo returned HTTP ${res.status}` }, 502)
      }
      const parsed = await res.json().catch(() => null)
      receipts = parsed?.data ?? {}
    } catch (e) {
      console.error('check-push-receipts: Expo request failed', e)
      return json({ error: 'Expo request failed' }, 502)
    }

    const tokenByTicket = new Map(tickets.map((r) => [r.ticket_id, r.token]))
    const deadTokens: string[] = []
    let errors = 0
    for (const [ticketId, receipt] of Object.entries(receipts)) {
      if (receipt.status !== 'error') continue
      errors++
      if (receipt.details?.error === 'DeviceNotRegistered') {
        const token = tokenByTicket.get(ticketId)
        if (token) deadTokens.push(token)
      } else {
        console.warn('push receipt error', receipt.message, receipt.details?.error)
      }
    }

    if (deadTokens.length) {
      const { error: delError } = await supabase.from('push_tokens').delete().in('token', deadTokens)
      if (delError) console.error('check-push-receipts: dead token cleanup failed', delError.message)
    }
    // Receipts that came back, and tickets older than a day (receipt expired), are done.
    const done = Object.keys(receipts)
    if (done.length) {
      const { error: doneError } = await supabase.from('push_receipts').delete().in('ticket_id', done)
      if (doneError) console.error('check-push-receipts: clearing checked tickets failed', doneError.message)
    }
    const { error: expiredError } = await supabase
      .from('push_receipts')
      .delete()
      .lt('created_at', new Date(deps.now() - 24 * 3600 * 1000).toISOString())
    if (expiredError) console.error('check-push-receipts: clearing expired tickets failed', expiredError.message)

    return json({ checked: tickets.length, errors, removedTokens: deadTokens.length })
  }
}
