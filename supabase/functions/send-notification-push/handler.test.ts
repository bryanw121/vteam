import assert from 'node:assert/strict'
import { createHandler } from './handler.ts'
import { EXPO_PUSH_URL } from '../_shared/expo.ts'
import {
  fakeSupabase,
  filterValue,
  type FetchCall,
  quietly,
  type ScriptedResult,
  stubFetch,
  testDeps,
  webhookRequest,
  WEBHOOK_SECRET,
} from '../_shared/testing.ts'

const USER = '11111111-1111-4111-8111-111111111111'
const NOTIFICATION = '22222222-2222-4222-8222-222222222222'

const webhook = (record: Record<string, unknown> = {}) => ({
  type: 'INSERT',
  table: 'notifications',
  record: {
    id: NOTIFICATION,
    user_id: USER,
    notification_type: 'event_reminder',
    title: 'Open play at 4:00 PM',
    body: 'Starts in 2 hours',
    data: { deep_link: '/event/abc' },
    ...record,
  },
})

type Msg = { to: string }
/** Expo answers one ticket per message: ok unless the token is listed as dead. */
const expo = (dead: string[] = []) => (call: FetchCall) =>
  Response.json({
    data: (call.body as Msg[]).map((m) =>
      dead.includes(m.to)
        ? { status: 'error', message: 'not registered', details: { error: 'DeviceNotRegistered' } }
        : { status: 'ok', id: `ticket-${m.to}` }
    ),
  })

function setup(opts: {
  tokens?: string[]
  prefs?: unknown
  legacyPrefs?: unknown
  results?: Record<string, ScriptedResult>
  respond?: (call: FetchCall, index: number) => Response | Promise<Response>
} = {}) {
  const db = fakeSupabase({
    results: {
      'user_settings.select': { data: opts.prefs === undefined ? null : { notification_prefs: opts.prefs } },
      'profiles.select': { data: { notification_prefs: opts.legacyPrefs ?? { push: {}, in_app: {} } } },
      'push_tokens.select': { data: (opts.tokens ?? ['tok-a']).map((token) => ({ token })) },
      ...opts.results,
    },
  })
  const net = stubFetch([{ url: EXPO_PUSH_URL, respond: opts.respond ?? expo() }])
  const handler = createHandler(testDeps({ db, net }))
  const send = async (body: unknown = webhook(), headers?: Record<string, string>, method?: string) =>
    (await quietly(() => handler(webhookRequest(body, headers, method)))).result
  return { db, net, send }
}

Deno.test('405 on GET', async () => {
  const { send, net } = setup()
  assert.equal((await send(undefined, undefined, 'GET')).status, 405)
  assert.equal(net.calls.length, 0)
})

Deno.test('401 without auth, or with the wrong bearer or secret', async () => {
  const { send, db, net } = setup()
  assert.equal((await send(webhook(), {})).status, 401)
  assert.equal((await send(webhook(), { Authorization: 'Bearer nope' })).status, 401)
  assert.equal((await send(webhook(), { 'x-webhook-secret': 'nope' })).status, 401)
  assert.equal(db.calls.length, 0)
  assert.equal(net.calls.length, 0)
})

Deno.test('accepts the x-webhook-secret header', async () => {
  const { send } = setup()
  assert.equal((await send(webhook(), { 'x-webhook-secret': WEBHOOK_SECRET })).status, 200)
})

Deno.test('400 on bad JSON and on a payload that is not a notifications INSERT', async () => {
  const { send, db } = setup()
  assert.equal((await send('{not json')).status, 400)
  assert.equal((await send({ type: 'UPDATE', table: 'notifications', record: webhook().record })).status, 400)
  assert.equal((await send({ type: 'INSERT', record: { id: 'not-a-uuid', user_id: USER, notification_type: 'x' } })).status, 400)
  assert.equal((await send({})).status, 400)
  assert.equal(db.calls.length, 0)
})

Deno.test('pushes the row with its deep link and stores a receipt per ok ticket', async () => {
  const { send, db, net } = setup({ tokens: ['tok-a', 'tok-b'] })
  const res = await send()
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), { sent: 2, removedTokens: 0 })
  assert.equal(net.calls.length, 1)
  const [first] = net.calls[0].body as { to: string; title: string; data: Record<string, string> }[]
  assert.equal(first.title, 'Open play at 4:00 PM')
  assert.equal(first.data.deep_link, '/event/abc')
  assert.equal(first.data.notification_id, NOTIFICATION)
  const [insert] = db.callsTo('push_receipts', 'insert')
  assert.deepEqual(insert.values, [
    { ticket_id: 'ticket-tok-a', token: 'tok-a' },
    { ticket_id: 'ticket-tok-b', token: 'tok-b' },
  ])
  assert.equal(filterValue(db.callsTo('push_tokens', 'select')[0], 'eq'), USER)
})

Deno.test('a duplicate delivery of the same id is ignored', async () => {
  const { send, net } = setup()
  assert.equal((await send()).status, 200)
  const again = await send()
  assert.equal(again.status, 200)
  assert.equal(await again.text(), 'Duplicate delivery ignored')
  assert.equal(net.calls.length, 1)
})

Deno.test('push turned off for the type: 200, nothing sent', async () => {
  const { send, net } = setup({ prefs: { push: { event_reminder: false } } })
  const res = await send()
  assert.equal(res.status, 200)
  assert.equal(await res.text(), 'Not pushed for this type')
  assert.equal(net.calls.length, 0)
})

Deno.test('the private user_settings copy wins over the legacy profiles column', async () => {
  const { send, net, db } = setup({ prefs: { push: { event_reminder: false } }, legacyPrefs: { push: { event_reminder: true } } })
  assert.equal(await (await send()).text(), 'Not pushed for this type')
  assert.equal(net.calls.length, 0)
  assert.equal(filterValue(db.callsTo('user_settings', 'select')[0], 'eq'), USER)
})

Deno.test('no private copy yet: falls back to the legacy profiles column', async () => {
  const { send, net } = setup({ legacyPrefs: { push: { event_reminder: false } } })
  assert.equal(await (await send()).text(), 'Not pushed for this type')
  assert.equal(net.calls.length, 0)
})

Deno.test('a prefs lookup error is a 500 before anything is sent', async () => {
  const { send, net } = setup({ results: { 'user_settings.select': { error: { message: 'db down' } } } })
  assert.equal((await send()).status, 500)
  assert.equal(net.calls.length, 0)
})

Deno.test('chat_mention rows are skipped (send-chat-push already pushed the message)', async () => {
  const { send, net } = setup()
  const res = await send(webhook({ notification_type: 'chat_mention' }))
  assert.equal(res.status, 200)
  assert.equal(net.calls.length, 0)
})

Deno.test('no tokens: 200, nothing sent', async () => {
  const { send, net } = setup({ tokens: [] })
  const res = await send()
  assert.equal(res.status, 200)
  assert.equal(await res.text(), 'No tokens')
  assert.equal(net.calls.length, 0)
})

Deno.test('DeviceNotRegistered tickets delete exactly those tokens', async () => {
  const { send, db } = setup({ tokens: ['tok-a', 'tok-dead'], respond: expo(['tok-dead']) })
  const res = await send()
  assert.deepEqual(await res.json(), { sent: 1, removedTokens: 1 })
  const deletes = db.callsTo('push_tokens', 'delete')
  assert.equal(deletes.length, 1)
  assert.deepEqual(filterValue(deletes[0], 'in'), ['tok-dead'])
})

Deno.test('Expo HTTP 500: still 200, nothing deleted, no receipts', async () => {
  const { send, db } = setup({ respond: () => new Response('boom', { status: 500 }) })
  const res = await send()
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), { sent: 0, removedTokens: 0 })
  assert.equal(db.callsTo('push_tokens', 'delete').length, 0)
  assert.equal(db.callsTo('push_receipts', 'insert').length, 0)
})

Deno.test('Expo request throws: still 200, nothing deleted', async () => {
  const { send, db } = setup({ respond: () => { throw new TypeError('network down') } })
  const res = await send()
  assert.equal(res.status, 200)
  assert.equal(db.callsTo('push_tokens', 'delete').length, 0)
})

Deno.test('more than 100 tokens go out in two batches', async () => {
  const tokens = Array.from({ length: 101 }, (_, i) => `tok-${i}`)
  const { send, net, db } = setup({ tokens })
  const res = await send()
  assert.deepEqual(await res.json(), { sent: 101, removedTokens: 0 })
  assert.deepEqual(net.calls.map((c) => (c.body as unknown[]).length), [100, 1])
  assert.equal((db.callsTo('push_receipts', 'insert')[0].values as unknown[]).length, 101)
})

Deno.test('a lookup error before sending is a 500, and the retry is processed', async () => {
  let fail = true
  const { send, net } = setup({
    results: { 'push_tokens.select': () => (fail ? { error: { message: 'db down' } } : { data: [{ token: 'tok-a' }] }) },
  })
  assert.equal((await send()).status, 500)
  assert.equal(net.calls.length, 0)
  fail = false
  assert.equal((await send()).status, 200)
  assert.equal(net.calls.length, 1)
})

Deno.test('client setup failure is a 500', async () => {
  const handler = createHandler(testDeps({ db: null }))
  const { result } = await quietly(() => handler(webhookRequest(webhook())))
  assert.equal(result.status, 500)
})
