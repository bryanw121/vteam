import assert from 'node:assert/strict'
import { createHandler } from './handler.ts'
import { EXPO_PUSH_URL } from '../_shared/expo.ts'
import { b64urlEncode } from '../_shared/webpush.ts'
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

const SENDER = 'sender-id'
const CONVERSATION = 'conversation-id'

const webhook = (record: Record<string, unknown> = {}) => ({
  type: 'INSERT',
  table: 'messages',
  record: { id: 'message-1', conversation_id: CONVERSATION, sender_id: SENDER, content: 'see you at 6', image_url: null, ...record },
})

type Msg = { to: string; title: string; body: string }
const expo = (dead: string[] = []) => (call: FetchCall) =>
  Response.json({
    data: (call.body as Msg[]).map((m) =>
      dead.includes(m.to)
        ? { status: 'error', message: 'not registered', details: { error: 'DeviceNotRegistered' } }
        : { status: 'ok', id: `ticket-${m.to}` }
    ),
  })

function setup(opts: {
  members?: string[]
  silenced?: string[]
  conversation?: unknown
  results?: Record<string, ScriptedResult>
  dead?: string[]
} = {}) {
  const members = opts.members ?? ['alice', 'bob']
  const db = fakeSupabase({
    results: {
      'profiles.select': { data: { username: 'pat', first_name: 'Pat', last_name: 'Lee' } },
      'conversations.select': { data: opts.conversation ?? { type: 'dm', clubs: null } },
      'conversation_members.select': { data: members.map((user_id) => ({ user_id })) },
      'chat_silences.select': { data: (opts.silenced ?? []).map((user_id) => ({ user_id })) },
      // One token per recipient the handler asked for, so the test sees who was targeted.
      'push_tokens.select': (call) => ({ data: (filterValue(call, 'in') as string[]).map((u) => ({ token: `tok-${u}` })) }),
      ...opts.results,
    },
  })
  const net = stubFetch([{ url: EXPO_PUSH_URL, respond: expo(opts.dead) }])
  const handler = createHandler(testDeps({ db, net }))
  const send = async (body: unknown = webhook(), headers?: Record<string, string>, method?: string) =>
    (await quietly(() => handler(webhookRequest(body, headers, method)))).result
  const pushed = () => net.calls.flatMap((c) => c.body as Msg[])
  return { db, net, send, pushed }
}

Deno.test('405 on GET', async () => {
  const { send } = setup()
  assert.equal((await send(undefined, undefined, 'GET')).status, 405)
})

Deno.test('401 without auth, or with the wrong bearer or secret', async () => {
  const { send, db } = setup()
  assert.equal((await send(webhook(), {})).status, 401)
  assert.equal((await send(webhook(), { Authorization: 'Bearer nope' })).status, 401)
  assert.equal((await send(webhook(), { 'x-webhook-secret': 'nope' })).status, 401)
  assert.equal(db.calls.length, 0)
})

Deno.test('accepts the x-webhook-secret header', async () => {
  const { send } = setup()
  assert.equal((await send(webhook(), { 'x-webhook-secret': WEBHOOK_SECRET })).status, 200)
})

Deno.test('400 on bad JSON and on a payload without conversation or sender', async () => {
  const { send, db } = setup()
  assert.equal((await send('nope{')).status, 400)
  assert.equal((await send({ record: { conversation_id: CONVERSATION } })).status, 400)
  assert.equal((await send({})).status, 400)
  assert.equal(db.calls.length, 0)
})

Deno.test('the sender is excluded from the member lookup', async () => {
  const { send, db } = setup()
  await send()
  const [members] = db.callsTo('conversation_members', 'select')
  assert.deepEqual(members.filters, [['eq', 'conversation_id', CONVERSATION], ['neq', 'user_id', SENDER]])
})

Deno.test('members who silenced the sender get no push', async () => {
  const { send, db, pushed } = setup({ members: ['alice', 'bob', 'carol'], silenced: ['bob'] })
  const res = await send()
  assert.deepEqual(await res.json(), { sent: 2, removedTokens: 0, muted: 1 })
  assert.equal(filterValue(db.callsTo('chat_silences')[0], 'eq'), SENDER)
  assert.deepEqual(filterValue(db.callsTo('push_tokens', 'select')[0], 'in'), ['alice', 'carol'])
  assert.deepEqual(pushed().map((m) => m.to), ['tok-alice', 'tok-carol'])
})

Deno.test('everyone silenced the sender: 200, nothing sent', async () => {
  const { send, net } = setup({ members: ['alice'], silenced: ['alice'] })
  const res = await send()
  assert.equal(res.status, 200)
  assert.equal(net.calls.length, 0)
})

Deno.test('a plain message pushes its text under the sender name', async () => {
  const { send, pushed } = setup()
  await send()
  assert.deepEqual(pushed().map(({ title, body }) => ({ title, body }))[0], { title: 'Pat Lee', body: 'see you at 6' })
})

Deno.test('a message with a mention pushes the same text (the mention row itself is not pushed again)', async () => {
  const { send, pushed } = setup()
  await send(webhook({ content: '@alice bring the net' }))
  assert.equal(pushed()[0].body, '@alice bring the net')
})

Deno.test('an image-only message and a club chat title', async () => {
  const { send, pushed } = setup({ conversation: { type: 'club', clubs: { name: 'Sand Sharks' } } })
  await send(webhook({ content: null, image_url: 'https://img.test/x.jpg' }))
  assert.deepEqual({ title: pushed()[0].title, body: pushed()[0].body }, { title: 'Pat Lee in Sand Sharks', body: '📷 Image' })
})

Deno.test('a duplicate delivery of the same message id is ignored', async () => {
  const { send, net } = setup()
  await send()
  const again = await send()
  assert.equal(await again.text(), 'Duplicate delivery ignored')
  assert.equal(net.calls.length, 1)
})

Deno.test('DeviceNotRegistered tokens are deleted and ok tickets stored', async () => {
  const { send, db } = setup({ dead: ['tok-bob'] })
  const res = await send()
  assert.deepEqual(await res.json(), { sent: 1, removedTokens: 1, muted: 0 })
  assert.deepEqual(filterValue(db.callsTo('push_tokens', 'delete')[0], 'in'), ['tok-bob'])
  assert.deepEqual(db.callsTo('push_receipts', 'insert')[0].values, [{ ticket_id: 'ticket-tok-alice', token: 'tok-alice' }])
})

Deno.test('a mute lookup error is a 500 before anything is sent, and the retry is processed', async () => {
  let fail = true
  const { send, net } = setup({ results: { 'chat_silences.select': () => (fail ? { error: { message: 'db down' } } : { data: [] }) } })
  assert.equal((await send()).status, 500)
  assert.equal(net.calls.length, 0)
  fail = false
  assert.equal((await send()).status, 200)
  assert.equal(net.calls.length, 1)
})

Deno.test('web push (#189): browser subscriptions get the message with a link to the chat', async () => {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']) as CryptoKeyPair
  const ua = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']) as CryptoKeyPair
  const env = {
    VAPID_PUBLIC_KEY: b64urlEncode(new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))),
    VAPID_PRIVATE_KEY: (await crypto.subtle.exportKey('jwk', pair.privateKey)).d!,
    VAPID_SUBJECT: 'https://vteam.test',
  }
  const keys = { p256dh: b64urlEncode(new Uint8Array(await crypto.subtle.exportKey('raw', ua.publicKey))), auth: b64urlEncode(crypto.getRandomValues(new Uint8Array(16))) }
  const endpoint = 'https://push.example.test/send/bob'
  const db = fakeSupabase({
    results: {
      'profiles.select': { data: { username: 'pat', first_name: 'Pat', last_name: 'Lee' } },
      'conversations.select': { data: { type: 'dm', clubs: null } },
      'conversation_members.select': { data: [{ user_id: 'bob' }] },
      'chat_silences.select': { data: [] },
      'push_tokens.select': { data: [{ token: endpoint, platform: 'web', web_keys: keys }] },
    },
  })
  const net = stubFetch([{ url: 'https://push.example.test/', respond: () => new Response(null, { status: 201 }) }])
  const handler = createHandler(testDeps({ db, net, env }))
  const res = (await quietly(() => handler(webhookRequest(webhook())))).result
  assert.deepEqual(await res.json(), { sent: 0, webSent: 1, removedTokens: 0, muted: 0 })
  assert.equal(net.callsTo(endpoint).length, 1)
  assert.equal(net.callsTo(EXPO_PUSH_URL).length, 0)
})
