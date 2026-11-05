import assert from 'node:assert/strict'
import { createHandler, type LoginTiming } from './handler.ts'
import { fakeSupabase, type FetchCall, quietly, type ScriptedResult, stubFetch, testDeps } from '../_shared/testing.ts'
import { GENERIC_LOGIN_ERROR, LOGIN_LIMITS, MIN_RESPONSE_MS, TOO_MANY_ATTEMPTS } from '../_shared/usernameLogin.ts'

const SUPABASE_URL = 'https://proj.supabase.test'
const TOKEN_URL = `${SUPABASE_URL}/auth/v1/token?grant_type=password`
const EMAIL = 'player@example.test'
const SESSION = { access_token: 'at', refresh_token: 'rt', expires_in: 3600, expires_at: 1_800_000_000, token_type: 'bearer' }

function setup(opts: {
  results?: Record<string, ScriptedResult>
  env?: Record<string, string | undefined>
  auth?: (call: FetchCall) => Response
} = {}) {
  const db = fakeSupabase({
    results: {
      'check_rate_limit.rpc': { data: true },
      'get_email_by_username.rpc': { data: EMAIL },
      ...opts.results,
    },
  })
  const net = stubFetch([{ url: TOKEN_URL, respond: opts.auth ?? (() => Response.json(SESSION)) }])
  const sleeps: number[] = []
  const timing: LoginTiming = { sleep: (ms) => (sleeps.push(ms), Promise.resolve()), jitterMs: () => 0 }
  const env = { SUPABASE_URL, SUPABASE_ANON_KEY: 'anon-key', ...opts.env }
  const handler = createHandler(testDeps({ db, net, env }), timing)
  const send = async (body: unknown, init: { method?: string; headers?: Record<string, string> } = {}) => {
    const method = init.method ?? 'POST'
    const req = new Request('https://fn.test/', {
      method,
      headers: { 'Content-Type': 'application/json', ...init.headers },
      body: method === 'POST' ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
    })
    return (await quietly(() => handler(req))).result
  }
  return { db, net, sleeps, send }
}

const login = { username: '  Player1 ', password: 'hunter22' }

Deno.test('OPTIONS answers the CORS preflight, GET is 405', async () => {
  const { send, db } = setup()
  const pre = await send(undefined, { method: 'OPTIONS' })
  assert.equal(pre.status, 200)
  assert.equal(pre.headers.get('Access-Control-Allow-Origin'), '*')
  assert.equal((await send(undefined, { method: 'GET' })).status, 405)
  assert.equal(db.calls.length, 0)
})

Deno.test('ALLOWED_ORIGINS: only listed browser origins are echoed', async () => {
  const { send } = setup({ env: { ALLOWED_ORIGINS: 'https://a.test, https://b.test' } })
  const ok = await send(login, { headers: { Origin: 'https://a.test' } })
  assert.equal(ok.headers.get('Access-Control-Allow-Origin'), 'https://a.test')
  const evil = await send(login, { headers: { Origin: 'https://evil.test' } })
  assert.equal(evil.headers.get('Access-Control-Allow-Origin'), null)
})

Deno.test('success: returns only the session, never the email', async () => {
  const { send, db, net } = setup()
  const res = await send(login)
  assert.equal(res.status, 200)
  const text = await res.text()
  assert.deepEqual(JSON.parse(text), SESSION)
  assert.ok(!text.includes(EMAIL))
  const [lookup] = db.callsTo('get_email_by_username', 'rpc')
  assert.deepEqual(lookup.values, { p_username: 'player1' })
  assert.deepEqual(net.calls[0].body, { email: EMAIL, password: 'hunter22' })
})

Deno.test('unknown username, wrong password and Auth 429 all get the same 401', async () => {
  const unknown = setup({ results: { 'get_email_by_username.rpc': { data: null } } })
  const wrong = setup({ auth: () => Response.json({ error_code: 'invalid_credentials' }, { status: 400 }) })
  const limited = setup({ auth: () => Response.json({ error_code: 'over_request_rate_limit' }, { status: 429 }) })
  for (const { send } of [unknown, wrong, limited]) {
    const res = await send(login)
    assert.equal(res.status, 401)
    assert.deepEqual(await res.json(), { error: GENERIC_LOGIN_ERROR })
  }
  assert.equal(unknown.net.calls.length, 0, 'Auth is never asked about an unknown username')
})

Deno.test('a malformed body gets the generic 401 without touching the database', async () => {
  const { send, db } = setup()
  for (const body of ['{nope', { username: 'a@b.test', password: 'x' }, { username: 'a' }]) {
    const res = await send(body)
    assert.equal(res.status, 401)
    assert.deepEqual(await res.json(), { error: GENERIC_LOGIN_ERROR })
  }
  assert.equal(db.calls.length, 0)
})

Deno.test('rate limits are counted per username and per IP before the lookup', async () => {
  const { send, db } = setup()
  await send(login, { headers: { 'x-forwarded-for': '203.0.113.7, 10.0.0.1' } })
  const rpcs = db.calls.filter((c) => c.op === 'rpc')
  assert.deepEqual(rpcs.map((c) => c.table), ['check_rate_limit', 'check_rate_limit', 'get_email_by_username'])
  assert.deepEqual(rpcs[0].values, { p_key: 'login_user:player1', p_max: LOGIN_LIMITS.perUsername, p_window_seconds: LOGIN_LIMITS.windowSeconds })
  assert.deepEqual(rpcs[1].values, { p_key: 'login_ip:203.0.113.7', p_max: LOGIN_LIMITS.perIp, p_window_seconds: LOGIN_LIMITS.windowSeconds })
})

Deno.test('over the limit: 429 before the lookup', async () => {
  const { send, db, net } = setup({ results: { 'check_rate_limit.rpc': { data: false } } })
  const res = await send(login)
  assert.equal(res.status, 429)
  assert.deepEqual(await res.json(), { error: TOO_MANY_ATTEMPTS })
  assert.equal(db.callsTo('get_email_by_username').length, 0)
  assert.equal(net.calls.length, 0)
})

Deno.test('a broken limiter does not lock people out', async () => {
  const { send } = setup({ results: { 'check_rate_limit.rpc': { error: { message: 'db down' } } } })
  assert.equal((await send(login)).status, 200)
})

Deno.test('a lookup error is a 500 with a generic message', async () => {
  const { send, net } = setup({ results: { 'get_email_by_username.rpc': { error: { message: 'boom' } } } })
  const res = await send(login)
  assert.equal(res.status, 500)
  assert.ok(!(await res.text()).includes('boom'))
  assert.equal(net.calls.length, 0)
})

Deno.test('with a secret key: forwards the caller IP and sends no bearer', async () => {
  const { send, net } = setup({ env: { SUPABASE_SECRET_KEYS: JSON.stringify({ default: 'sb_secret_x' }) } })
  await send(login, { headers: { 'x-forwarded-for': '198.51.100.4' } })
  const headers = net.calls[0].init?.headers as Record<string, string>
  assert.equal(headers.apikey, 'sb_secret_x')
  assert.equal(headers['Sb-Forwarded-For'], '198.51.100.4')
  assert.equal(headers.Authorization, undefined)
})

Deno.test('without a secret key: falls back to the anon key, no forwarding', async () => {
  const { send, net } = setup()
  await send(login, { headers: { 'x-forwarded-for': '198.51.100.4' } })
  const headers = net.calls[0].init?.headers as Record<string, string>
  assert.equal(headers.apikey, 'anon-key')
  assert.equal(headers.Authorization, 'Bearer anon-key')
  assert.equal(headers['Sb-Forwarded-For'], undefined)
})

Deno.test('every answer is padded to the minimum response time', async () => {
  const ok = setup()
  await ok.send(login)
  const bad = setup({ results: { 'get_email_by_username.rpc': { data: null } } })
  await bad.send(login)
  // The fixed test clock does not move, so the full floor is waited each time.
  assert.deepEqual([...ok.sleeps, ...bad.sleeps], [MIN_RESPONSE_MS, MIN_RESPONSE_MS])
})

Deno.test('client setup failure is a 500', async () => {
  const handler = createHandler(testDeps({ db: null, env: { SUPABASE_URL } }), { sleep: () => Promise.resolve(), jitterMs: () => 0 })
  const req = new Request('https://fn.test/', { method: 'POST', body: JSON.stringify(login) })
  const { result } = await quietly(() => handler(req))
  assert.equal(result.status, 500)
})
