import assert from 'node:assert/strict'
import { createHandler } from './handler.ts'
import { EXPO_RECEIPTS_URL } from '../_shared/expo.ts'
import { fakeSupabase, filterValue, NOW, quietly, stubFetch, testDeps, webhookRequest, WEBHOOK_SECRET } from '../_shared/testing.ts'

const tickets = [
  { ticket_id: 't-ok', token: 'tok-ok' },
  { ticket_id: 't-dead', token: 'tok-dead' },
  { ticket_id: 't-other', token: 'tok-other' },
  { ticket_id: 't-pending', token: 'tok-pending' },
]

/** Expo has receipts for three of the four tickets (t-pending is not ready yet). */
const receipts = {
  't-ok': { status: 'ok' },
  't-dead': { status: 'error', message: 'gone', details: { error: 'DeviceNotRegistered' } },
  't-other': { status: 'error', message: 'too big', details: { error: 'MessageTooBig' } },
}

function setup(respond: () => Response = () => Response.json({ data: receipts }), rows: unknown[] = tickets) {
  const db = fakeSupabase({ results: { 'push_receipts.select': { data: rows } } })
  const net = stubFetch([{ url: EXPO_RECEIPTS_URL, respond }])
  const handler = createHandler(testDeps({ db, net }))
  const run = async (headers?: Record<string, string>, method?: string) =>
    (await quietly(() => handler(webhookRequest({}, headers, method)))).result
  return { db, net, run }
}

Deno.test('401 without auth, or with the wrong bearer or secret (any method)', async () => {
  const { run, db } = setup()
  assert.equal((await run({})).status, 401)
  assert.equal((await run({ Authorization: 'Bearer nope' })).status, 401)
  assert.equal((await run({ 'x-webhook-secret': 'nope' })).status, 401)
  assert.equal((await run({}, 'GET')).status, 401)
  assert.equal(db.calls.length, 0)
})

Deno.test('accepts the x-webhook-secret header', async () => {
  const { run } = setup()
  assert.equal((await run({ 'x-webhook-secret': WEBHOOK_SECRET })).status, 200)
})

Deno.test('reads only tickets older than 15 minutes, at most 1000', async () => {
  const { run, db } = setup()
  await run()
  const [lookup] = db.callsTo('push_receipts', 'select')
  assert.deepEqual(lookup.filters, [['lt', 'created_at', new Date(NOW - 15 * 60_000).toISOString()], ['limit', 1000]])
})

Deno.test('a DeviceNotRegistered receipt deletes its token; other errors do not', async () => {
  const { run, db, net } = setup()
  const res = await run()
  assert.deepEqual(await res.json(), { checked: 4, errors: 2, removedTokens: 1 })
  assert.deepEqual((net.calls[0].body as { ids: string[] }).ids, ['t-ok', 't-dead', 't-other', 't-pending'])
  const deletes = db.callsTo('push_tokens', 'delete')
  assert.equal(deletes.length, 1)
  assert.deepEqual(filterValue(deletes[0], 'in'), ['tok-dead'])
})

Deno.test('processed receipts are removed, pending ones kept, expired ones cleared', async () => {
  const { run, db } = setup()
  await run()
  const [done, expired] = db.callsTo('push_receipts', 'delete')
  assert.deepEqual(done.filters, [['in', 'ticket_id', ['t-ok', 't-dead', 't-other']]])
  assert.deepEqual(expired.filters, [['lt', 'created_at', new Date(NOW - 24 * 3600_000).toISOString()]])
})

Deno.test('no tickets to check: nothing fetched', async () => {
  const { run, net } = setup(undefined, [])
  const res = await run()
  assert.deepEqual(await res.json(), { checked: 0 })
  assert.equal(net.calls.length, 0)
})

Deno.test('Expo HTTP error or network failure: 502 and every row left in place', async () => {
  for (const respond of [() => new Response('no', { status: 503 }), () => { throw new TypeError('network down') }]) {
    const { run, db } = setup(respond)
    assert.equal((await run()).status, 502)
    assert.equal(db.callsTo('push_tokens', 'delete').length, 0)
    assert.equal(db.callsTo('push_receipts', 'delete').length, 0)
  }
})

Deno.test('a receipt lookup error is a 500', async () => {
  const db = fakeSupabase({ results: { 'push_receipts.select': { error: { message: 'db down' } } } })
  const handler = createHandler(testDeps({ db }))
  const { result } = await quietly(() => handler(webhookRequest({})))
  assert.equal(result.status, 500)
})
