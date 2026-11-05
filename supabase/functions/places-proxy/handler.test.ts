import assert from 'node:assert/strict'
import { createHandler } from './handler.ts'
import { type FetchCall, quietly, stubFetch, testDeps, webhookRequest } from '../_shared/testing.ts'

const KEY = 'AIza-test-google-key'
const AUTOCOMPLETE = 'https://maps.googleapis.com/maps/api/place/autocomplete/json?'
const DETAILS = 'https://maps.googleapis.com/maps/api/place/details/json?'

function setup(opts: { env?: Record<string, string | undefined>; respond?: (call: FetchCall) => Response } = {}) {
  const respond = opts.respond ?? (() => Response.json({ status: 'OK', predictions: [{ place_id: 'p1' }] }))
  const net = stubFetch([{ url: AUTOCOMPLETE, respond }, { url: DETAILS, respond }])
  const handler = createHandler(testDeps({ net, env: { GOOGLE_MAPS_KEY: KEY, ...opts.env } }))
  const send = async (body: unknown, headers: Record<string, string> = {}, method?: string) => {
    const res = (await quietly(() => handler(webhookRequest(body, headers, method)))).result
    return { res, text: await res.text() }
  }
  return { net, send }
}

const params = (url: string) => new URL(url).searchParams

Deno.test('autocomplete: proxies to Google with the key and session token, no types filter', async () => {
  const { send, net } = setup()
  const { res, text } = await send({ action: 'autocomplete', input: '1100 Congress Ave', sessiontoken: 's1' })
  assert.equal(res.status, 200)
  assert.deepEqual(JSON.parse(text), { status: 'OK', predictions: [{ place_id: 'p1' }] })
  const p = params(net.calls[0].url)
  assert.equal(p.get('input'), '1100 Congress Ave')
  assert.equal(p.get('sessiontoken'), 's1')
  assert.equal(p.get('key'), KEY)
  assert.equal(p.get('components'), 'country:us')
  assert.equal(p.has('types'), false)
  assert.ok(!text.includes(KEY))
})

Deno.test('details: requests geometry only, with the same session token', async () => {
  const { send, net } = setup()
  const { res } = await send({ action: 'details', place_id: 'p1', sessiontoken: 's1' })
  assert.equal(res.status, 200)
  const p = params(net.calls[0].url)
  assert.equal(p.get('fields'), 'geometry')
  assert.equal(p.get('sessiontoken'), 's1')
})

Deno.test('400 on bad JSON, an unknown action, or a missing input / place_id', async () => {
  const { send, net } = setup()
  for (const body of ['{oops', { action: 'search', input: 'x' }, { action: 'autocomplete', sessiontoken: 's' }, { action: 'details', sessiontoken: 's' }]) {
    const { res, text } = await send(body)
    assert.equal(res.status, 400, `body ${JSON.stringify(body)}`)
    assert.ok(!text.includes(KEY))
  }
  assert.equal(net.calls.length, 0)
})

Deno.test('500 when GOOGLE_MAPS_KEY is not set, without calling Google', async () => {
  const { send, net } = setup({ env: { GOOGLE_MAPS_KEY: undefined } })
  const { res, text } = await send({ action: 'autocomplete', input: 'gym', sessiontoken: 's' })
  assert.equal(res.status, 500)
  assert.match(text, /Missing GOOGLE_MAPS_KEY/)
  assert.equal(net.calls.length, 0)
})

Deno.test('the key never appears in a response body, even when the request to Google fails', async () => {
  // Deno's fetch errors name the URL ("error sending request for url (https://...&key=...)").
  const failures: ((call: FetchCall) => Response)[] = [
    (call) => { throw new TypeError(`error sending request for url (${call.url}): connection refused`) },
    () => new Response('<html>not json</html>', { status: 502 }),
  ]
  for (const respond of failures) {
    const { send } = setup({ respond })
    const { res, text } = await send({ action: 'autocomplete', input: 'gym', sessiontoken: 's' })
    assert.equal(res.status, 500)
    assert.ok(!text.includes(KEY), `response leaked the key: ${text}`)
  }
})

Deno.test('OPTIONS preflight: ok, with * unless ALLOWED_ORIGINS is set', async () => {
  const open = setup()
  const { res } = await open.send(undefined, { Origin: 'https://evil.test' }, 'OPTIONS')
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), '*')

  const locked = setup({ env: { ALLOWED_ORIGINS: 'https://vteamvolleyball.com' } })
  const allowed = await locked.send(undefined, { Origin: 'https://vteamvolleyball.com' }, 'OPTIONS')
  assert.equal(allowed.res.headers.get('Access-Control-Allow-Origin'), 'https://vteamvolleyball.com')
  const other = await locked.send(undefined, { Origin: 'https://evil.test' }, 'OPTIONS')
  assert.equal(other.res.headers.get('Access-Control-Allow-Origin'), null)
})
