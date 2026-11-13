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

Deno.test('push prefs come from user_settings, not the legacy profiles column', async () => {
  const { send, net, db } = setup({ prefs: { push: { event_reminder: false } }, legacyPrefs: { push: { event_reminder: true } } })
  assert.equal(await (await send()).text(), 'Not pushed for this type')
  assert.equal(net.calls.length, 0)
  assert.equal(filterValue(db.callsTo('user_settings', 'select')[0], 'eq'), USER)
})

Deno.test('no user_settings prefs: falls back to the legacy profiles column', async () => {
  const { send, net } = setup({ legacyPrefs: { push: { event_reminder: false } } })
  assert.equal(await (await send()).text(), 'Not pushed for this type')
  assert.equal(net.calls.length, 0)
})

Deno.test('500 when the user_settings lookup fails', async () => {
  const { send, net } = setup({ results: { 'user_settings.select': { error: { message: 'boom' } } } })
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

// ─── Web Push (#189) ─────────────────────────────────────────────────────────
import { b64urlDecode, b64urlEncode, type Bytes, encryptPayload, vapidAuthorization, webPushBody, WEB_PUSH_MAX_PAYLOAD } from '../_shared/webpush.ts'

const ENDPOINT = 'https://push.example.test/send/abc'

async function browserSubscription() {
  const ua = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']) as CryptoKeyPair
  const p256dh = b64urlEncode(new Uint8Array(await crypto.subtle.exportKey('raw', ua.publicKey)))
  const auth = b64urlEncode(crypto.getRandomValues(new Uint8Array(16)))
  return { ua, keys: { p256dh, auth } }
}

async function vapidKeys() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']) as CryptoKeyPair
  const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey)
  const publicKey = b64urlEncode(new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey)))
  return { pair, env: { VAPID_PUBLIC_KEY: publicKey, VAPID_PRIVATE_KEY: jwk.d!, VAPID_SUBJECT: 'https://vteam.test' } }
}

/** What a browser does with an aes128gcm body (RFC 8291), to prove we encrypt correctly. */
async function decrypt(ua: CryptoKeyPair, authB64: string, body: Bytes): Promise<string> {
  const salt = body.slice(0, 16)
  const idlen = body[20]
  const asPublic = body.slice(21, 21 + idlen)
  const sealed = body.slice(21 + idlen)
  const uaPublic = new Uint8Array(await crypto.subtle.exportKey('raw', ua.publicKey))
  const asKey = await crypto.subtle.importKey('raw', asPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: asKey }, ua.privateKey, 256))
  const enc = (s: string) => new TextEncoder().encode(s)
  const hk = async (salt: Bytes, ikm: Bytes, info: Bytes, n: number) => {
    const k = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits'])
    return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, k, n * 8))
  }
  const info = new Uint8Array([...enc('WebPush: info\0'), ...uaPublic, ...asPublic])
  const ikm = await hk(b64urlDecode(authB64), shared, info, 32)
  const cek = await hk(salt, ikm, enc('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hk(salt, ikm, enc('Content-Encoding: nonce\0'), 12)
  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt'])
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, aes, sealed))
  assert.equal(plain[plain.length - 1], 2, 'last-record delimiter')
  return new TextDecoder().decode(plain.slice(0, -1))
}

Deno.test('web push: the payload decrypts with the browser keys', async () => {
  const { ua, keys } = await browserSubscription()
  const body = await encryptPayload(keys, new TextEncoder().encode('{"title":"hi"}'))
  assert.equal(await decrypt(ua, keys.auth, body), '{"title":"hi"}')
})

Deno.test('web push: the VAPID JWT is signed for the push origin', async () => {
  const { pair, env } = await vapidKeys()
  const header = await vapidAuthorization({ publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY, subject: env.VAPID_SUBJECT }, ENDPOINT, 1_800_000_000_000)
  const m = header.match(/^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/)
  assert.ok(m)
  const claims = JSON.parse(new TextDecoder().decode(b64urlDecode(m[2])))
  assert.equal(claims.aud, 'https://push.example.test')
  assert.equal(claims.sub, 'https://vteam.test')
  assert.equal(claims.exp, 1_800_000_000 + 12 * 3600)
  assert.equal(m[4], env.VAPID_PUBLIC_KEY)
  const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pair.publicKey, b64urlDecode(m[3]), new TextEncoder().encode(`${m[1]}.${m[2]}`))
  assert.ok(ok)
})

Deno.test('web push: long text is clipped under the payload cap', () => {
  const bytes = webPushBody({ title: 't'.repeat(500), body: 'b'.repeat(5000), deep_link: '/event/x' })
  assert.ok(bytes.length <= WEB_PUSH_MAX_PAYLOAD)
})

function webSetup(opts: { env?: Record<string, string>; status?: number; tokens: { token: string; platform: string; web_keys?: unknown }[] }) {
  const db = fakeSupabase({
    results: {
      'user_settings.select': { data: null },
      'profiles.select': { data: { notification_prefs: { push: {}, in_app: {} } } },
      'push_tokens.select': { data: opts.tokens },
    },
  })
  const net = stubFetch([
    { url: EXPO_PUSH_URL, respond: expo() },
    { url: 'https://push.example.test/', respond: () => new Response(null, { status: opts.status ?? 201 }) },
  ])
  const handler = createHandler(testDeps({ db, net, env: opts.env }))
  const send = async () => (await quietly(() => handler(webhookRequest(webhook())))).result
  return { db, net, send }
}

Deno.test('web push: web tokens get an encrypted POST, Expo tokens still go to Expo', async () => {
  const { ua, keys } = await browserSubscription()
  const { env } = await vapidKeys()
  const { send, net } = webSetup({ env, tokens: [{ token: 'tok-a', platform: 'ios' }, { token: ENDPOINT, platform: 'web', web_keys: keys }] })
  const res = await send()
  assert.deepEqual(await res.json(), { sent: 1, webSent: 1, removedTokens: 0 })
  const [web] = net.callsTo(ENDPOINT)
  const headers = web.init?.headers as Record<string, string>
  assert.equal(headers['Content-Encoding'], 'aes128gcm')
  assert.match(headers.Authorization, /^vapid t=/)
  const payload = JSON.parse(await decrypt(ua, keys.auth, web.init?.body as Bytes))
  assert.deepEqual(payload, { title: 'Open play at 4:00 PM', body: 'Starts in 2 hours', deep_link: '/event/abc', tag: 'event_reminder' })
  assert.equal((net.callsTo(EXPO_PUSH_URL)[0].body as Msg[]).length, 1)
})

Deno.test('web push: a 410 deletes the subscription', async () => {
  const { keys } = await browserSubscription()
  const { env } = await vapidKeys()
  const { send, db } = webSetup({ env, status: 410, tokens: [{ token: ENDPOINT, platform: 'web', web_keys: keys }] })
  assert.deepEqual(await (await send()).json(), { sent: 0, webSent: 0, removedTokens: 1 })
  assert.deepEqual(filterValue(db.callsTo('push_tokens', 'delete')[0], 'in'), [ENDPOINT])
})

Deno.test('web push: skipped without VAPID secrets, nothing deleted', async () => {
  const { keys } = await browserSubscription()
  const { send, net, db } = webSetup({ tokens: [{ token: ENDPOINT, platform: 'web', web_keys: keys }] })
  assert.equal((await send()).status, 200)
  assert.equal(net.calls.length, 0)
  assert.equal(db.callsTo('push_tokens', 'delete').length, 0)
})

Deno.test('web push: prefs off sends nothing', async () => {
  const { keys } = await browserSubscription()
  const { env } = await vapidKeys()
  const db = fakeSupabase({
    results: {
      'user_settings.select': { data: { notification_prefs: { push: { event_reminder: false } } } },
      'push_tokens.select': { data: [{ token: ENDPOINT, platform: 'web', web_keys: keys }] },
    },
  })
  const net = stubFetch([])
  const handler = createHandler(testDeps({ db, net, env }))
  const res = (await quietly(() => handler(webhookRequest(webhook())))).result
  assert.equal(res.status, 200)
  assert.equal(net.calls.length, 0)
})
