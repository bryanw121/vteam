import assert from 'node:assert/strict'
import { createHandler, LOGIN_UNAVAILABLE } from './handler.ts'
import { GENERIC_LOGIN_ERROR, LOGIN_LIMITS, MIN_RESPONSE_MS, TOO_MANY_ATTEMPTS } from '../_shared/usernameLogin.ts'
import { fakeSupabase, type FakeSupabase, type FetchCall, NOW, quietly, stubFetch, testDeps } from '../_shared/testing.ts'

const URL_ = 'https://proj.supabase.test'
const TOKEN_URL = `${URL_}/auth/v1/token?grant_type=password`
const SECRET = 'sb_secret_abc'
const SESSION = { access_token: 'at', refresh_token: 'rt', expires_in: 3600, expires_at: 1_800_000_000, token_type: 'bearer' }

function setup(opts: {
  email?: unknown
  allowed?: boolean | ((key: string) => boolean)
  limitError?: boolean
  /** The username's failed-attempt row in rate_limits (null: none yet). */
  failures?: { hits: number; window_start: string } | null
  failuresError?: boolean
  lookupError?: boolean
  auth?: (call: FetchCall) => Response
  env?: Record<string, string | undefined>
  db?: FakeSupabase | null
} = {}) {
  const db = opts.db === null ? null : opts.db ?? fakeSupabase({
    results: {
      'rate_limits.select': opts.failuresError ? { error: { message: 'db down' } } : { data: opts.failures ?? null },
    },
    rpc: {
      check_rate_limit: (call) => opts.limitError
        ? { error: { message: 'limiter down' } }
        : { data: typeof opts.allowed === 'function' ? opts.allowed(String(call.args?.p_key)) : opts.allowed ?? true },
      get_email_by_username: opts.lookupError ? { error: { message: 'db down' } } : { data: opts.email === undefined ? 'e2e@example.test' : opts.email },
    },
  })
  const net = stubFetch([{ url: TOKEN_URL, respond: opts.auth ?? (() => Response.json(SESSION)) }])
  const delays: number[] = []
  const handler = createHandler(
    testDeps({ db, net, env: { SUPABASE_URL: URL_, SUPABASE_SECRET_KEYS: JSON.stringify({ default: SECRET }), ...opts.env } }),
    { sleep: (ms) => { delays.push(ms); return Promise.resolve() }, jitterMs: () => 0 },
  )
  const send = async (body: unknown = { username: ' E2EBot ', password: 'pw' }, headers: Record<string, string> = { 'x-forwarded-for': '203.0.113.7, 10.0.0.1' }, method = 'POST') =>
    (await quietly(() =>
      handler(new Request('https://fn.test/', {
        method,
        headers: { 'Content-Type': 'application/json', ...headers },
        body: method === 'POST' ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
      }))
    )).result
  return { db: db as FakeSupabase, net, send, delays }
}

Deno.test('OPTIONS answers the CORS preflight; GET is 405', async () => {
  const { send, net } = setup()
  const pre = await send(undefined, {}, 'OPTIONS')
  assert.equal(pre.status, 200)
  assert.equal(pre.headers.get('Access-Control-Allow-Origin'), '*')
  assert.equal((await send(undefined, {}, 'GET')).status, 405)
  assert.equal(net.calls.length, 0)
})

Deno.test('a valid sign-in returns only the session, padded to the minimum time', async () => {
  const { send, net, delays } = setup()
  const res = await send()
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.deepEqual(body, SESSION)
  assert.equal(JSON.stringify(body).includes('@'), false, 'never returns the email')
  assert.equal(net.calls.length, 1)
  assert.deepEqual(net.calls[0].body, { email: 'e2e@example.test', password: 'pw' })
  assert.deepEqual(delays, [MIN_RESPONSE_MS])
})

Deno.test('forwards the caller IP with the secret key', async () => {
  const { send, net } = setup()
  await send()
  const headers = net.calls[0].init?.headers as Record<string, string>
  assert.equal(headers.apikey, SECRET)
  assert.equal(headers['Sb-Forwarded-For'], '203.0.113.7')
  assert.equal(headers.Authorization, undefined)
})

Deno.test('without a secret key falls back to the anon key and does not forward', async () => {
  const { send, net } = setup({ env: { SUPABASE_SECRET_KEYS: undefined, SUPABASE_ANON_KEY: 'anon' } })
  assert.equal((await send()).status, 200)
  const headers = net.calls[0].init?.headers as Record<string, string>
  assert.equal(headers.apikey, 'anon')
  assert.equal(headers.Authorization, 'Bearer anon')
  assert.equal(headers['Sb-Forwarded-For'], undefined)
})

Deno.test('unknown username and wrong password get the same generic 401', async () => {
  const unknown = setup({ email: null })
  const a = await unknown.send()
  assert.equal(a.status, 401)
  assert.deepEqual(await a.json(), { error: GENERIC_LOGIN_ERROR })
  assert.equal(unknown.net.calls.length, 0)

  const wrong = setup({ auth: () => Response.json({ error: 'invalid_grant' }, { status: 400 }) })
  const b = await wrong.send()
  assert.equal(b.status, 401)
  assert.deepEqual(await b.json(), { error: GENERIC_LOGIN_ERROR })
})

Deno.test("Auth's own 429 is answered with the generic 401 (it would reveal the username exists)", async () => {
  const { send } = setup({ auth: () => Response.json({ error: 'over_request_rate_limit' }, { status: 429 }) })
  const res = await send()
  assert.equal(res.status, 401)
  assert.deepEqual(await res.json(), { error: GENERIC_LOGIN_ERROR })
})

Deno.test('a bad body is a generic 401 without touching the database', async () => {
  for (const body of ['not json', { username: 'a@b.c', password: 'x' }, { username: 'bob' }]) {
    const { send, db, net } = setup()
    const res = await send(body)
    assert.equal(res.status, 401)
    assert.equal(db.rpcCalls.length, 0)
    assert.equal(net.calls.length, 0)
  }
})

const NOW_ISO = () => new Date(NOW).toISOString()
const countedKeys = (db: FakeSupabase) => db.rpcCalls.filter((c) => c.fn === 'check_rate_limit').map((c) => c.args?.p_key)

Deno.test('checks the IP limit and reads the username lockout before the lookup; a success counts nothing for the username', async () => {
  const { send, db } = setup()
  assert.equal((await send()).status, 200)
  assert.deepEqual(db.rpcCalls.map((c) => c.fn), ['check_rate_limit', 'get_email_by_username'])
  assert.deepEqual(db.rpcCalls[0].args, { p_key: 'login_ip:203.0.113.7', p_max: LOGIN_LIMITS.perIp, p_window_seconds: LOGIN_LIMITS.windowSeconds })
  assert.deepEqual(db.rpcCalls[1].args, { p_username: 'e2ebot' })
  const read = db.callsTo('rate_limits', 'select')
  assert.equal(read.length, 1)
  assert.deepEqual(read[0].filters, [['eq', 'key', 'login_user:e2ebot']])
})

Deno.test('a wrong password and an unknown username each count one failure for the username', async () => {
  const wrong = setup({ auth: () => Response.json({ error: 'invalid_grant' }, { status: 400 }) })
  assert.equal((await wrong.send()).status, 401)
  assert.deepEqual(countedKeys(wrong.db), ['login_ip:203.0.113.7', 'login_user:e2ebot'])
  const last = wrong.db.rpcCalls.at(-1)
  assert.deepEqual(last?.args, { p_key: 'login_user:e2ebot', p_max: LOGIN_LIMITS.perUsername, p_window_seconds: LOGIN_LIMITS.windowSeconds })

  const unknown = setup({ email: null })
  assert.equal((await unknown.send()).status, 401)
  assert.deepEqual(countedKeys(unknown.db), ['login_ip:203.0.113.7', 'login_user:e2ebot'])
})

Deno.test('no IP header: no IP limit, the username lockout still applies', async () => {
  const { send, db } = setup()
  await send(undefined, {})
  assert.deepEqual(countedKeys(db), [])
  assert.equal(db.callsTo('rate_limits', 'select').length, 1)
})

Deno.test('over the IP limit: 429 before the lookup, nothing sent to Auth', async () => {
  const { send, db, net } = setup({ allowed: (key) => !key.startsWith('login_ip:') })
  const res = await send()
  assert.equal(res.status, 429)
  assert.deepEqual(await res.json(), { error: TOO_MANY_ATTEMPTS })
  assert.equal(db.rpcCalls.some((c) => c.fn === 'get_email_by_username'), false)
  assert.equal(net.calls.length, 0)
})

Deno.test('a username out of failed attempts is refused before the lookup, even with the right password', async () => {
  const { send, db, net } = setup({ failures: { hits: LOGIN_LIMITS.perUsername, window_start: NOW_ISO() } })
  const res = await send()
  assert.equal(res.status, 429)
  assert.deepEqual(await res.json(), { error: TOO_MANY_ATTEMPTS })
  assert.equal(db.rpcCalls.some((c) => c.fn === 'get_email_by_username'), false)
  assert.equal(net.calls.length, 0)
  assert.deepEqual(countedKeys(db), ['login_ip:203.0.113.7'])
})

Deno.test('failed attempts under the limit, or from an expired window, do not lock out', async () => {
  const under = setup({ failures: { hits: LOGIN_LIMITS.perUsername - 1, window_start: NOW_ISO() } })
  assert.equal((await under.send()).status, 200)
  const expired = new Date(NOW - (LOGIN_LIMITS.windowSeconds + 60) * 1000).toISOString()
  const old = setup({ failures: { hits: LOGIN_LIMITS.perUsername + 5, window_start: expired } })
  assert.equal((await old.send()).status, 200)
})

Deno.test('a failed lockout read does not lock anyone out', async () => {
  const { send } = setup({ failuresError: true })
  assert.equal((await send()).status, 200)
})

Deno.test('a broken limiter does not lock everyone out', async () => {
  const { send } = setup({ limitError: true })
  assert.equal((await send()).status, 200)
})

Deno.test('lookup failure or missing client: 500 with no detail', async () => {
  const failed = await setup({ lookupError: true }).send()
  assert.equal(failed.status, 500)
  assert.deepEqual(await failed.json(), { error: LOGIN_UNAVAILABLE })
  const noClient = await setup({ db: null }).send()
  assert.equal(noClient.status, 500)
})
