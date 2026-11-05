/**
 * Edge Function: send-feedback-email
 *
 * Emails one feedback / bug submission to the team (issue #9). The app inserts
 * the row into feedback_submissions first (so nothing is lost if email fails),
 * then calls this with `{ id }` via supabase.functions.invoke.
 *
 * Trust: the client sends only the row id. The function identifies the caller
 * from their JWT, loads the row server-side with the service role, and emails
 * only a fresh row the caller owns. Subject, body and destination never come
 * from the request.
 *
 * Responses (the app shows success either way; the row is already saved):
 *   200 { sent: true }                 emailed
 *   400 invalid body                   401 no / bad user JWT
 *   403 someone else's submission      404 no such submission
 *   409 already emailed (this instance) 410 older than 15 minutes
 *   429 more than 5 submissions by this user in the last hour
 *   503 { error: 'email not configured' } RESEND_API_KEY is not set
 *   502 Resend rejected the request
 *
 * Secrets:
 *   RESEND_API_KEY  required to send (without it: 503, nothing else breaks)
 *   FEEDBACK_EMAIL  optional destination; default DEFAULT_FEEDBACK_EMAIL, which
 *                   must equal FEEDBACK_EMAIL in constants/feedback.ts (tested)
 *   FEEDBACK_FROM   optional sender; default "vteam <feedback@vteamvolleyball.com>"
 *                   (its domain must be verified in Resend)
 *   ALLOWED_ORIGINS optional CORS allow-list, as for places-proxy
 *
 * Deployed with verify_jwt = true (supabase/config.toml): the gateway rejects
 * requests without a valid JWT before this code runs.
 *
 * index.ts serves this with the real dependencies; handler.test.ts runs it
 * against a fake database and a stubbed network.
 */

import type { Deps } from '../_shared/deps.ts'
import { corsHeaders } from '../_shared/cors.ts'
import {
  decideFeedbackSend,
  parseFeedbackRequest,
  resendPayload,
  RESEND_URL,
  type FeedbackEnv,
  type FeedbackRow,
  type Reporter,
} from '../_shared/feedback.ts'

const DEDUP_MS = 10 * 60_000

export function createHandler(deps: Deps) {
  /** Ids emailed by this instance in the last 10 minutes: absorbs double taps and retries (best effort, lost on cold start). */
  const recentlySent = new Map<string, number>()

  function remember(id: string, now: number) {
    for (const [k, t] of recentlySent) if (now - t > DEDUP_MS) recentlySent.delete(k)
    recentlySent.set(id, now)
  }

  return async (req: Request): Promise<Response> => {
    const cors = corsHeaders(req, deps.env)
    const json = (status: number, body: unknown) =>
      new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
    if (req.method !== 'POST') return json(405, { error: 'method not allowed' })

    let id: string | null
    try {
      id = parseFeedbackRequest(await req.json())
    } catch {
      return json(400, { error: 'invalid JSON' })
    }
    if (!id) return json(400, { error: 'body must be { id: <uuid> }' })

    const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
    if (!jwt) return json(401, { error: 'sign in required' })

    try {
      const db = deps.getClient()
      const { data: auth, error: authError } = await db.auth.getUser(jwt)
      const caller = auth?.user
      if (authError || !caller) return json(401, { error: 'sign in required' })

      const now = deps.now()
      const hourAgo = new Date(now - 60 * 60_000).toISOString()
      const [rowRes, countRes, profileRes] = await Promise.all([
        db.from('feedback_submissions')
          .select('id, user_id, kind, priority, title, description, repro_steps, created_at')
          .eq('id', id)
          .maybeSingle(),
        db.from('feedback_submissions')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', caller.id)
          .gte('created_at', hourAgo),
        db.from('profiles').select('id, username, first_name, last_name').eq('id', caller.id).maybeSingle(),
      ])
      if (rowRes.error) throw rowRes.error
      if (countRes.error) throw countRes.error

      const env: FeedbackEnv = {
        resendApiKey: deps.env('RESEND_API_KEY') ?? undefined,
        feedbackEmail: deps.env('FEEDBACK_EMAIL') ?? undefined,
        feedbackFrom: deps.env('FEEDBACK_FROM') ?? undefined,
      }
      const row = (rowRes.data ?? null) as FeedbackRow | null
      const decision = decideFeedbackSend({
        row,
        callerId: caller.id,
        recentCount: countRes.count ?? 0,
        alreadySent: recentlySent.has(id),
        env,
        now,
      })
      if (!decision.ok) {
        if (decision.status === 503) console.warn('[send-feedback-email] RESEND_API_KEY is not set; submission stored, not emailed', id)
        return json(decision.status, { error: decision.error })
      }

      const profile = (profileRes.data ?? null) as Omit<Reporter, 'email'> | null
      const reporter: Reporter = {
        id: caller.id,
        username: profile?.username ?? null,
        first_name: profile?.first_name ?? null,
        last_name: profile?.last_name ?? null,
        email: caller.email ?? null,
      }

      remember(id, now) // before the send, so a concurrent duplicate is refused
      const res = await deps.fetch(RESEND_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.resendApiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(resendPayload(row as FeedbackRow, reporter, env)),
      })
      if (!res.ok) {
        recentlySent.delete(id) // let a retry try again
        console.error('[send-feedback-email] Resend rejected', res.status, await res.text().catch(() => ''))
        return json(502, { error: 'email provider error' })
      }
      return json(200, { sent: true })
    } catch (err) {
      console.error('[send-feedback-email]', err)
      return json(500, { error: 'internal error' })
    }
  }
}
