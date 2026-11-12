/**
 * The RLS matrix (#186): one probe per expectation in e2e/rls/matrix.ts,
 * against beta with the anon key and the e2e account. No browser. Read-only in
 * the same sense as e2e/rls.spec.ts: every write attempted is one that RLS (or
 * a grant, or a guard trigger) must reject, and the probe rows carry nothing
 * but an owner id, so nothing could be written even if a policy were wrong
 * (every table has required columns the probe leaves out).
 */
import { test, expect } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './env'
import { signInE2eClient } from './eventsFixtures'
import { withNetworkRetry } from './retry'
import { RLS_MATRIX, type TableName } from './rls/matrix'

const BUDDY_ID = 'b0dd1e00-0000-4000-8000-0000000e2e02'
const RLS_DENIED = '42501'
/** A guard trigger's "not found" (tournament_team_before_insert / tournament_member_before_insert). */
const TRIGGER_REJECTED = 'P0002'

type Res = { data: unknown[] | null; error: { message: string; code?: string } | null }

async function run(label: string, fn: () => PromiseLike<Res>): Promise<Res> {
  return withNetworkRetry(async () => {
    const res = await fn()
    if (res.error && /fetch failed|Failed to fetch/i.test(res.error.message)) throw new Error(res.error.message)
    return res
  }, { label })
}

const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } })
let me: SupabaseClient
let myId: string

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  ;({ supabase: me, userId: myId } = await signInE2eClient())
})

test.afterAll(async () => {
  await me?.auth.signOut({ scope: 'local' })
})

/** No rows came back: an empty result, or a grant/RLS error. */
function expectNoRows(res: Res, what: string) {
  if (res.error) expect(res.error.code, `${what}: ${res.error.message}`).toBe(RLS_DENIED)
  else expect(res.data ?? [], `${what} returned rows`).toHaveLength(0)
}

const tables = Object.keys(RLS_MATRIX) as TableName[]

for (const table of tables) {
  const spec = RLS_MATRIX[table]

  test(`${table}: guest reads ${spec.anonSelect}`, async () => {
    const res = await run(`anon select ${table}`, () => anon.from(table).select(spec.anonColumns ?? '*').limit(1) as unknown as PromiseLike<Res>)
    if (spec.anonSelect === 'none') expectNoRows(res, `anon can read ${table}: expected none`)
    else expect(res.error, `anon select on ${table} (expected ${spec.anonSelect})`).toBeNull()
  })

  if (spec.anonInsert === 'none') {
    test(`${table}: guest cannot insert`, async () => {
      const res = await run(`anon insert ${table}`, () => anon.from(table).insert({} as never) as unknown as PromiseLike<Res>)
      const allowed = spec.insertRejectedBy === 'trigger' ? [RLS_DENIED, TRIGGER_REJECTED] : [RLS_DENIED]
      expect(res.error, `anon insert into ${table} was not rejected`).not.toBeNull()
      expect(allowed, `anon insert into ${table}: ${res.error?.message}`).toContain(res.error?.code)
    })
  }

  if (spec.signedInSelect === 'none') {
    test(`${table}: signed-in user reads none`, async () => {
      const res = await run(`me select ${table}`, () => me.from(table).select('*').limit(1) as unknown as PromiseLike<Res>)
      expectNoRows(res, `a signed-in user can read ${table}: expected none`)
    })
  }

  const owner = spec.owner
  if (owner?.ownRowsOnly) {
    test(`${table}: a signed-in user reads only their own rows`, async () => {
      const res = await run(`me select others ${table}`, () =>
        me.from(table).select(owner.column).neq(owner.column, myId).limit(5) as unknown as PromiseLike<Res>)
      expectNoRows(res, `the e2e account can read another user's ${table} rows`)
    })
  }
  if (owner?.noInsertAsOther) {
    test(`${table}: a signed-in user cannot insert as someone else`, async () => {
      const res = await run(`me insert as buddy ${table}`, () =>
        me.from(table).insert({ [owner.column]: BUDDY_ID } as never) as unknown as PromiseLike<Res>)
      expect(res.error, `inserting into ${table} as another user was not rejected`).not.toBeNull()
      expect(res.error?.code, `insert into ${table} as another user: ${res.error?.message}`).toBe(RLS_DENIED)
    })
  }
}
