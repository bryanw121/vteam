import assert from 'node:assert/strict'
import { createHandler } from './handler.ts'
import { DEFAULT_FEEDBACK_EMAIL, RESEND_URL } from '../_shared/feedback.ts'
import { fakeSupabase, type FetchCall, NOW, quietly, stubFetch, testDeps, webhookRequest } from '../_shared/testing.ts'

const ID = '33333333-3333-4333-8333-333333333333'
const CALLER = '44444444-4444-4444-8444-444444444444'
const RESEND_KEY = 're_test_key'

const row = (over: Record<string, unknown> = {}) => ({
  id: ID,
  user_id: CALLER,
  kind: 'bug',
  priority: 'high',
  title: 'Calendar skips a day',
  description: 'Week view jumps from Mon to Wed.',
  repro_steps: null,
  created_at: new Date(NOW - 60_000).toISOString(),
  ...over,
})

function setup(opts: {
  row?: unknown
  recent?: number
  env?: Record<string, string | undefined>
  respond?: (call: FetchCall) => Response
} = {}) {
  const db = fakeSupabase({
    user: (jwt) => (jwt === 'user-jwt' ? { id: CALLER, email: 'pat@example.com' } : null),
    results: {
      'feedback_submissions.select': (call) =>
        call.options?.head ? { count: opts.recent ?? 1 } : { data: opts.row === undefined ? row() : opts.row },
      'profiles.select': { data: { id: CALLER, username: 'pat', first_name: 'Pat', last_name: 'Lee' } },
    },
  })
  const net = stubFetch([{ url: RESEND_URL, respond: opts.respond ?? (() => Response.json({ id: 'email-1' })) }])
  const handler = createHandler(testDeps({ db, net, env: { RESEND_API_KEY: RESEND_KEY, ...opts.env } }))
  const send = async (body: unknown = { id: ID }, headers: Record<string, string> = { Authorization: 'Bearer user-jwt' }, method?: string) => {
    const res = (await quietly(() => handler(webhookRequest(body, headers, method)))).result
    return { status: res.status, body: await res.json().catch(() => null) }
  }
  return { db, net, send }
}

Deno.test('405 on GET', async () => {
  const { send } = setup()
  assert.equal((await send(undefined, undefined, 'GET')).status, 405)
})

Deno.test('400 on bad JSON or a body that is not { id: uuid }', async () => {
  const { send, net } = setup()
  assert.equal((await send('{oops')).status, 400)
  assert.equal((await send({ id: 'nope' })).status, 400)
  assert.equal((await send({ title: 'x' })).status, 400)
  assert.equal(net.calls.length, 0)
})

Deno.test('401 without a JWT or with one auth rejects', async () => {
  const { send, net } = setup()
  assert.equal((await send({ id: ID }, {})).status, 401)
  assert.equal((await send({ id: ID }, { Authorization: 'Bearer forged' })).status, 401)
  assert.equal(net.calls.length, 0)
})

Deno.test('emails a fresh row the caller owns, to the configured destination', async () => {
  const { send, net, db } = setup()
  const res = await send()
  assert.deepEqual(res, { status: 200, body: { sent: true } })
  assert.deepEqual(db.jwts, ['user-jwt'])
  const [call] = net.calls
  assert.equal(new Headers(call.init?.headers).get('Authorization'), `Bearer ${RESEND_KEY}`)
  const payload = call.body as { to: string[]; subject: string; reply_to?: string }
  assert.deepEqual(payload.to, [DEFAULT_FEEDBACK_EMAIL])
  assert.equal(payload.reply_to, 'pat@example.com')
  assert.match(payload.subject, /Calendar skips a day/)
})

Deno.test("someone else's row is refused before anything is sent", async () => {
  const { send, net } = setup({ row: row({ user_id: '55555555-5555-4555-8555-555555555555' }) })
  assert.equal((await send()).status, 403)
  assert.equal(net.calls.length, 0)
})

Deno.test('a missing row is 404', async () => {
  const { send } = setup({ row: null })
  assert.equal((await send()).status, 404)
})

Deno.test('a row older than 15 minutes is 410', async () => {
  const { send, net } = setup({ row: row({ created_at: new Date(NOW - 16 * 60_000).toISOString() }) })
  assert.equal((await send()).status, 410)
  assert.equal(net.calls.length, 0)
})

Deno.test('already emailed by this instance is 409', async () => {
  const { send, net } = setup()
  assert.equal((await send()).status, 200)
  assert.equal((await send()).status, 409)
  assert.equal(net.calls.length, 1)
})

Deno.test('more than 5 submissions in the last hour is 429', async () => {
  const { send, net } = setup({ recent: 6 })
  assert.equal((await send()).status, 429)
  assert.equal(net.calls.length, 0)
})

Deno.test('no RESEND_API_KEY is 503 and nothing is sent', async () => {
  const { send, net } = setup({ env: { RESEND_API_KEY: undefined } })
  assert.deepEqual(await send(), { status: 503, body: { error: 'email not configured' } })
  assert.equal(net.calls.length, 0)
})

Deno.test('Resend rejecting is 502, and a retry may try again', async () => {
  let reject = true
  const { send, net } = setup({ respond: () => (reject ? new Response('bad', { status: 422 }) : Response.json({ id: 'e' })) })
  assert.equal((await send()).status, 502)
  reject = false
  assert.equal((await send()).status, 200)
  assert.equal(net.calls.length, 2)
})

Deno.test('client setup failure is a 500', async () => {
  const handler = createHandler(testDeps({ db: null, env: { RESEND_API_KEY: RESEND_KEY } }))
  const { result } = await quietly(() => handler(webhookRequest({ id: ID }, { Authorization: 'Bearer user-jwt' })))
  assert.equal(result.status, 500)
})
