import assert from 'node:assert/strict'
import { createHandler } from './handler.ts'
import { DELETE_CONFIRMATION, REAUTH_MAX_AGE_SECONDS } from '../_shared/accountDeletion.ts'
import { type DbError, type DbResult } from '../_shared/deps.ts'
import { fakeSupabase, NOW, quietly, testDeps } from '../_shared/testing.ts'

const USER = '11111111-1111-4111-8111-111111111111'
const OTHER = '33333333-3333-4333-8333-333333333333'
const CLUB_GONE = '44444444-4444-4444-8444-444444444444'
const CLUB_KEPT = '55555555-5555-4555-8555-555555555555'
const HASH = '0123456789abcdef0123456789abcdef'
const NOW_S = Math.floor(NOW / 1000)

const b64url = (v: unknown) => btoa(JSON.stringify(v)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
/** A JWT-shaped token whose `amr` says the person signed in `agoSeconds` ago (signature unchecked here). */
const token = (agoSeconds: number) => `${b64url({ alg: 'HS256' })}.${b64url({ sub: USER, amr: [{ method: 'password', timestamp: NOW_S - agoSeconds }] })}.sig`

const PLAN = {
  clubs: [{ id: CLUB_GONE, action: 'delete' }, { id: CLUB_KEPT, action: 'transfer' }],
  tournaments: [],
  events: [],
}

function setup(opts: {
  user?: string | null
  rpc?: Partial<DbResult>
  storageRemoveError?: DbError
} = {}) {
  const db = fakeSupabase({
    user: opts.user === null ? null : { id: opts.user ?? USER },
    rpc: { delete_account: opts.rpc ?? { data: PLAN } },
    storage: {
      avatars: [`${USER}/a.jpg`, `${OTHER}/b.jpg`],
      'chat-images': [`${USER}/1.jpg`, `${USER}/2.jpg`],
      'club-avatars': [`${CLUB_GONE}/logo.png`, `${CLUB_KEPT}/logo.png`],
    },
    storageRemoveError: opts.storageRemoveError,
  })
  const handler = createHandler(testDeps({ db }))
  const send = async (
    body: unknown = { confirm: DELETE_CONFIRMATION, planHash: HASH },
    auth: string | null = `Bearer ${token(60)}`,
    method = 'POST',
  ) =>
    (await quietly(() =>
      handler(
        new Request('https://fn.test/', {
          method,
          headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: auth } : {}) },
          body: method === 'POST' ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
        }),
      )
    )).result
  return { db, send }
}

Deno.test('OPTIONS answers the CORS preflight; GET is 405', async () => {
  const { send, db } = setup()
  assert.equal((await send(undefined, null, 'OPTIONS')).status, 200)
  assert.equal((await send(undefined, null, 'GET')).status, 405)
  assert.equal(db.rpcCalls.length, 0)
})

Deno.test('401 without a bearer token or with one auth.getUser rejects', async () => {
  const none = setup()
  assert.equal((await none.send(undefined, null)).status, 401)
  const bad = setup({ user: null })
  assert.equal((await bad.send()).status, 401)
  assert.equal(bad.db.rpcCalls.length, 0)
})

Deno.test('400 without the typed confirmation or a plan hash', async () => {
  const { send, db } = setup()
  for (const body of ['nope', { confirm: 'delete', planHash: HASH }, { confirm: DELETE_CONFIRMATION }, { confirm: DELETE_CONFIRMATION, planHash: 'xyz' }]) {
    assert.equal((await send(body)).status, 400)
  }
  assert.equal(db.rpcCalls.length, 0)
})

Deno.test('a sign-in older than 10 minutes must be renewed first: 403, nothing deleted', async () => {
  const { send, db } = setup()
  const res = await send(undefined, `Bearer ${token(REAUTH_MAX_AGE_SECONDS + 1)}`)
  assert.equal(res.status, 403)
  assert.equal((await res.json()).code, 'reauth_required')
  assert.equal(db.rpcCalls.length, 0)
  assert.deepEqual(db.removed, [])
})

Deno.test('the user comes from the JWT, never from the body', async () => {
  const { send, db } = setup()
  await send({ confirm: DELETE_CONFIRMATION, planHash: HASH, user_id: OTHER, user: OTHER })
  assert.deepEqual(db.rpcCalls[0], { fn: 'delete_account', args: { p_user: USER, p_plan_hash: HASH } })
})

Deno.test('success: one delete_account call, then the person\'s files and deleted clubs\' avatars', async () => {
  const { send, db } = setup()
  const res = await send()
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), { ok: true, plan: PLAN })
  assert.deepEqual(db.rpcCalls.map((c) => c.fn), ['delete_account'])
  assert.deepEqual(db.removed.sort(), [
    `avatars:${USER}/a.jpg`,
    `chat-images:${USER}/1.jpg`,
    `chat-images:${USER}/2.jpg`,
    `club-avatars:${CLUB_GONE}/logo.png`,
  ])
  assert.deepEqual(db.objects.avatars, [`${OTHER}/b.jpg`], 'other people\'s files stay')
  assert.deepEqual(db.objects['club-avatars'], [`${CLUB_KEPT}/logo.png`], 'handed-over clubs keep their avatar')
})

Deno.test('plan changed since the preview: 409, no files touched', async () => {
  const { send, db } = setup({ rpc: { error: { message: 'account_deletion_plan_changed', code: 'P0409' } } })
  const res = await send()
  assert.equal(res.status, 409)
  assert.equal((await res.json()).code, 'plan_changed')
  assert.deepEqual(db.removed, [])
})

Deno.test('any other database failure: 500, nothing changed, no files touched', async () => {
  const { send, db } = setup({ rpc: { error: { message: 'boom' } } })
  const res = await send()
  assert.equal(res.status, 500)
  assert.ok(!(await res.text()).includes('boom'))
  assert.deepEqual(db.removed, [])
})

Deno.test('file cleanup failing after the commit is only logged: still 200', async () => {
  const { send } = setup({ storageRemoveError: { message: 'storage down' } })
  assert.equal((await send()).status, 200)
})

Deno.test('client setup failure is a 500', async () => {
  const handler = createHandler(testDeps({ db: null }))
  const req = new Request('https://fn.test/', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token(60)}` },
    body: JSON.stringify({ confirm: DELETE_CONFIRMATION, planHash: HASH }),
  })
  assert.equal((await quietly(() => handler(req))).result.status, 500)
})
