/**
 * The scheduled integration suite (e2e/integration, .github/workflows/integration.yml):
 * every feature's server side, exercised the way the app calls it, against the
 * vteam beta project with the e2e account. No browser.
 *
 * Every row a test creates is named with RUN (`[int <run tag>] …`) and removed in
 * afterAll; `sweepStale` also clears rows older than STALE_FIXTURE_HOURS that a
 * crashed run left behind. Nothing here touches live.
 */
import { expect } from '@playwright/test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { E2E_RUN_TAG, STALE_FIXTURE_HOURS } from '../env'
import { signInE2eClient } from '../eventsFixtures'
import { withNetworkRetry } from '../retry'

/** Prefix for everything this run creates; starts with "[int" so the stale sweep finds it. */
export const RUN = `[int ${E2E_RUN_TAG}]`

/** e2ebuddy: a second profile on beta that can't sign in (see e2e/rls.spec.ts). */
export const BUDDY_ID = 'b0dd1e00-0000-4000-8000-0000000e2e02'
/** The e2e account's seed DM with e2ebuddy. */
export const SEED_DM_ID = '1e473b01-c06a-48b0-9308-21b3f593f603'

export type Me = { db: SupabaseClient; id: string }

export async function signIn(): Promise<Me> {
  const { supabase, userId } = await signInE2eClient()
  return { db: supabase, id: userId }
}

type Res<T> = { data: T | null; error: { message: string; code?: string; details?: string } | null }

/**
 * Run a call; retry network flakes only, then fail with the server's own message.
 * Returns the data untyped: each test states the shape it expects.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function ok(label: string, run: () => PromiseLike<Res<unknown>>): Promise<any> {
  const res = await withNetworkRetry(async () => {
    const r = await run()
    if (r.error && /fetch failed|Failed to fetch/i.test(r.error.message)) throw new Error(r.error.message)
    return r
  }, { label })
  expect(res.error, `${label}: ${res.error?.code ?? ''} ${res.error?.message ?? ''}`).toBeNull()
  return res.data
}

/** A call the server must refuse; returns the error code. */
export async function refused(label: string, run: () => PromiseLike<Res<unknown>>): Promise<string> {
  const res = await withNetworkRetry(async () => {
    const r = await run()
    if (r.error && /fetch failed|Failed to fetch/i.test(r.error.message)) throw new Error(r.error.message)
    return r
  }, { label })
  expect(res.error, `${label} should have been refused`).not.toBeNull()
  return res.error?.code ?? ''
}

export const daysFromNow = (d: number, hour = 18) => {
  const t = new Date(Date.now() + d * 86_400_000)
  t.setUTCHours(hour, 0, 0, 0)
  return t.toISOString()
}

const staleBefore = () => new Date(Date.now() - STALE_FIXTURE_HOURS * 3600_000).toISOString()

/**
 * Delete rows named with `prefix` (one file's own, e.g. `${RUN} events`: files run at
 * the same time, so a sweep must never reach another file's rows), plus any "[int"
 * row past the stale age, that the account owns.
 */
export async function sweep(me: Me, table: 'events' | 'clubs' | 'user_event_templates', column: 'title' | 'name', ownerColumn: 'created_by' | 'user_id', prefix: string, staleToo = true) {
  await me.db.from(table).delete().eq(ownerColumn, me.id).like(column, `${prefix}%`)
  if (staleToo) await me.db.from(table).delete().eq(ownerColumn, me.id).like(column, '[int%').lt('created_at', staleBefore())
}
