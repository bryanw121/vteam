/**
 * Integration tests for row level security and key RPCs (#12), run against the
 * CI Supabase project (vteam beta) with its public anon key and the e2e
 * account. No browser. Nothing here writes: every insert is one RLS must
 * reject, `find_or_create_dm` finds the existing seed DM, and the reminder
 * lead-time check writes back the account's current value.
 *
 * Asserts the policies as they are on main; drafts that tighten them (#100+)
 * update these expectations in their own PRs.
 */
import { test, expect } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './env'
import { EVENT_PREVIEW_COLUMNS } from '../constants/selects'
import { signInE2eClient } from './eventsFixtures'
import { withNetworkRetry } from './retry'

const BUDDY_ID = 'b0dd1e00-0000-4000-8000-0000000e2e02'
/** The e2e account's DM with e2ebuddy (same seed as e2e/chat.spec.ts). */
const SEED_DM_ID = '1e473b01-c06a-48b0-9308-21b3f593f603'
/** Postgres "insufficient_privilege": what PostgREST returns when a policy rejects a row. */
const RLS_DENIED = '42501'
/** Postgres "check_violation". */
const CHECK_FAILED = '23514'

type Result<T> = { data: T | null; error: { message: string; code?: string } | null; count?: number | null }

/** Run a query; retry network flakes only (a returned PostgREST error is passed through). */
async function q<T>(run: () => PromiseLike<Result<T>>, label: string): Promise<Result<T>> {
  return withNetworkRetry(async () => {
    const res = await run()
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

test.describe('anon (guest browsing)', () => {
  test('reads public events, attendees, profiles, tags and clubs', async () => {
    for (const table of ['events', 'event_attendees', 'tags', 'clubs'] as const) {
      // head: true returns only the count, no rows.
      const res = await q(() => anon.from(table).select('*', { count: 'exact', head: true }), `anon ${table}`)
      expect(res.error, `anon SELECT on ${table}`).toBeNull()
    }
    const buddy = await q(() => anon.from('profiles').select('id, username').eq('id', BUDDY_ID), 'anon profile')
    expect(buddy.error).toBeNull()
    expect(buddy.data).toEqual([{ id: BUDDY_ID, username: 'e2ebuddy' }])
  })

  test('can read what an event link preview shows (#130)', async () => {
    // api/event-page.ts and api/og/event.tsx read these with the anon key; a
    // policy change that hides them would quietly turn every preview generic.
    const ev = await q(() => anon.from('events').select(EVENT_PREVIEW_COLUMNS).limit(1), 'anon event preview columns')
    expect(ev.error, 'anon SELECT of the preview columns').toBeNull()
    for (const view of ['event_attendees_attending', 'event_guests_attending'] as const) {
      const res = await q(() => anon.from(view).select('event_id', { count: 'exact', head: true }), `anon ${view} count`)
      expect(res.error, `anon count on ${view}`).toBeNull()
      expect(typeof res.count, `anon count on ${view}`).toBe('number')
    }
  })

  test('sees no rows of private tables', async () => {
    for (const table of ['notifications', 'user_settings', 'messages', 'conversations', 'conversation_members', 'push_tokens', 'feedback_submissions', 'app_events', 'app_events_daily'] as const) {
      // A GET (not head: a HEAD error has no body to read the code from).
      const res = await q(() => anon.from(table).select('*').limit(1), `anon ${table}`)
      // No grant: permission denied. Granted but no anon policy: zero rows. Never data.
      if (res.error) expect(res.error.code, `anon ${table}: ${res.error.message}`).toBe(RLS_DENIED)
      else expect(res.data, `anon rows visible in ${table}`).toEqual([])
    }
    const dm = await q(() => anon.from('messages').select('id').eq('conversation_id', SEED_DM_ID).limit(1), 'anon seed messages')
    expect(dm.data ?? []).toEqual([])
  })

  test('cannot run the reminder job or read its ledger (#129)', async () => {
    const run = await q(() => anon.rpc('send_event_reminders'), 'anon send_event_reminders')
    expect(run.error, 'anon may not run send_event_reminders').not.toBeNull()
    expect(run.data).toBeNull()
    const log = await q(() => anon.from('event_reminder_log').select('*').limit(1), 'anon event_reminder_log')
    if (log.error) expect(log.error.code).toBe(RLS_DENIED)
    else expect(log.data).toEqual([])
  })

  test('cannot write events or RSVPs', async () => {
    const ev = await q(() => anon.from('events').insert({ title: '[e2e rls] must fail', event_date: new Date().toISOString(), created_by: BUDDY_ID }).select('id'), 'anon insert event')
    expect(ev.error?.code).toBe(RLS_DENIED)
    const rsvp = await q(() => anon.from('event_attendees').insert({ event_id: crypto.randomUUID(), user_id: BUDDY_ID }), 'anon insert attendee')
    expect(rsvp.error?.code).toBe(RLS_DENIED)
  })

  test('cannot create a club', async () => {
    const club = await q(() => anon.from('clubs').insert({ name: '[e2e rls] must fail', created_by: BUDDY_ID }).select('id'), 'anon insert club')
    expect(club.error?.code).toBe(RLS_DENIED)
  })
})

test.describe('event_payments ("I\'ve paid", #6)', () => {
  test('anon reads nothing and cannot write', async () => {
    const res = await q(() => anon.from('event_payments').select('*').limit(1), 'anon event_payments')
    if (res.error) expect(res.error.code, `anon event_payments: ${res.error.message}`).toBe(RLS_DENIED)
    else expect(res.data).toEqual([])
    const ins = await q(() => anon.from('event_payments').insert({ event_id: crypto.randomUUID(), user_id: BUDDY_ID }), 'anon insert event_payments')
    expect(ins.error?.code).toBe(RLS_DENIED)
  })

  test('a signed-in user cannot mark someone else paid, and sees no one else\'s flags', async () => {
    const ins = await q(() => me.from('event_payments').insert({ event_id: crypto.randomUUID(), user_id: BUDDY_ID }), 'insert for buddy')
    expect(ins.error?.code).toBe(RLS_DENIED)
    const others = await q(() => me.from('event_payments').select('user_id').neq('user_id', myId).limit(1), 'others flags')
    expect(others.error).toBeNull()
    expect(others.data).toEqual([])
  })

  test('cannot mark yourself paid on an event you are not on', async () => {
    const ins = await q(() => me.from('event_payments').insert({ event_id: crypto.randomUUID(), user_id: myId }), 'insert self, no RSVP')
    expect(ins.error?.code).toBe(RLS_DENIED)
  })
})

test.describe('signed in as the e2e account', () => {
  test("reads its own DM, not other people's private rows", async () => {
    const msgs = await q(() => me.from('messages').select('id', { count: 'exact', head: true }).eq('conversation_id', SEED_DM_ID), 'my seed messages')
    expect(msgs.error).toBeNull()
    expect(msgs.count ?? 0).toBeGreaterThan(0)

    const members = await q(() => me.from('conversation_members').select('user_id').eq('conversation_id', SEED_DM_ID), 'seed members')
    expect((members.data ?? []).map(m => (m as { user_id: string }).user_id).sort()).toEqual([myId, BUDDY_ID].sort())

    const settings = await q(() => me.from('user_settings').select('user_id'), 'user_settings')
    expect(settings.error).toBeNull()
    for (const row of (settings.data ?? []) as { user_id: string }[]) expect(row.user_id).toBe(myId)
    const buddySettings = await q(() => me.from('user_settings').select('user_id').eq('user_id', BUDDY_ID), 'buddy settings')
    expect(buddySettings.data ?? []).toEqual([])

    const notifs = await q(() => me.from('notifications').select('user_id').neq('user_id', myId).limit(1), 'others notifications')
    expect(notifs.data ?? []).toEqual([])
  })

  test("cannot RSVP someone else, or send as them", async () => {
    const event = await q(() => me.from('events').select('id').limit(1), 'any event')
    const eventId = (event.data as { id: string }[] | null)?.[0]?.id ?? crypto.randomUUID()
    const rsvp = await q(() => me.from('event_attendees').insert({ event_id: eventId, user_id: BUDDY_ID }), 'insert attendee for buddy')
    expect(rsvp.error?.code).toBe(RLS_DENIED)

    const spoof = await q(() => me.from('messages').insert({ conversation_id: SEED_DM_ID, sender_id: BUDDY_ID, content: '[e2e rls] must fail' }), 'spoofed message')
    expect(spoof.error?.code).toBe(RLS_DENIED)

    // Any signed-in user may create a club, but only as themselves.
    const club = await q(() => me.from('clubs').insert({ name: '[e2e rls] must fail', created_by: BUDDY_ID }).select('id'), 'club created as buddy')
    expect(club.error?.code).toBe(RLS_DENIED)

    // Writes buddy's current name back, so even a broken policy changes nothing.
    const profile = await q(() => me.from('profiles').update({ first_name: 'E2E' }).eq('id', BUDDY_ID).select('id'), "update buddy's profile")
    // UPDATE with a USING policy filters the row out: no error, zero rows changed.
    expect(profile.data ?? []).toEqual([])
  })

  test('event reminders (#129): the job and its ledger are server-only', async () => {
    const run = await q(() => me.rpc('send_event_reminders'), 'send_event_reminders')
    expect(run.error, 'a signed-in user may not run send_event_reminders').not.toBeNull()
    expect(run.data).toBeNull()

    const log = await q(() => me.from('event_reminder_log').select('*').limit(1), 'event_reminder_log')
    if (log.error) expect(log.error.code).toBe(RLS_DENIED)
    else expect(log.data).toEqual([])
    const event = await q(() => me.from('events').select('id').limit(1), 'any event')
    const eventId = (event.data as { id: string }[] | null)?.[0]?.id ?? crypto.randomUUID()
    const logInsert = await q(() => me.from('event_reminder_log').insert({ event_id: eventId, user_id: myId }), 'insert reminder log')
    expect(logInsert.error?.code).toBe(RLS_DENIED)

    // Clients still never insert notifications, the new types included.
    const fake = await q(() => me.from('notifications').insert({
      user_id: myId, notification_type: 'event_reminder', title: '[e2e rls] must fail', body: 'x', data: { event_id: eventId },
    }), 'insert event_reminder notification')
    expect(fake.error?.code).toBe(RLS_DENIED)
  })

  test('reminder lead time (#129): only 1h / 2h / a day, own row only', async () => {
    const mine = await q(() => me.from('user_settings').select('reminder_lead_minutes').eq('user_id', myId).maybeSingle(), 'my lead time')
    expect(mine.error).toBeNull()
    const current = (mine.data as { reminder_lead_minutes: number } | null)?.reminder_lead_minutes ?? 120
    expect([60, 120, 1440]).toContain(current)

    // An insert-or-update of an invalid value fails the check, so nothing is written either way.
    const bad = await q(() => me.from('user_settings').upsert({ user_id: myId, reminder_lead_minutes: 5 }, { onConflict: 'user_id' }), 'lead 5')
    expect(bad.error?.code).toBe(CHECK_FAILED)

    // A valid value is accepted (writes back the current one: no change).
    const ok = await q(() => me.from('user_settings').update({ reminder_lead_minutes: current }).eq('user_id', myId), 'lead valid')
    expect(ok.error).toBeNull()

    // Someone else's row: filtered out by RLS, zero rows changed.
    const buddy = await q(() => me.from('user_settings').update({ reminder_lead_minutes: 60 }).eq('user_id', BUDDY_ID).select('user_id'), "buddy's lead")
    expect(buddy.data ?? []).toEqual([])
  })

  test('find_or_create_dm returns the existing DM with e2ebuddy, every time', async () => {
    const first = await q(() => me.rpc('find_or_create_dm', { other_user_id: BUDDY_ID }), 'find_or_create_dm')
    expect(first.error).toBeNull()
    expect(first.data).toBe(SEED_DM_ID)
    const again = await q(() => me.rpc('find_or_create_dm', { other_user_id: BUDDY_ID }), 'find_or_create_dm again')
    expect(again.data).toBe(SEED_DM_ID)
  })

  test('get_my_conversations includes the seed DM', async () => {
    const res = await q(() => me.rpc('get_my_conversations'), 'get_my_conversations')
    expect(res.error).toBeNull()
    const ids = ((res.data ?? []) as Record<string, unknown>[]).map(r => r.conversation_id ?? r.id)
    expect(ids).toContain(SEED_DM_ID)
  })
})

test.describe('points (#4)', () => {
  test('anon reads point balances but no ledger rows', async () => {
    const balances = await q(() => anon.from('point_balances').select('user_id, balance').limit(1), 'anon point_balances')
    expect(balances.error).toBeNull()
    const ledger = await q(() => anon.from('point_events').select('id').limit(1), 'anon point_events')
    if (ledger.error) expect(ledger.error.code, `anon point_events: ${ledger.error.message}`).toBe(RLS_DENIED)
    else expect(ledger.data).toEqual([])
  })

  test('nobody writes points from the client', async () => {
    const own = await q(() => me.from('point_events').insert({ user_id: myId, amount: 1000, reason: 'e2e_rls' }), 'insert own points')
    expect(own.error?.code).toBe(RLS_DENIED)
    const bal = await q(() => me.from('point_balances').insert({ user_id: myId, balance: 1000 }), 'insert own balance')
    expect(bal.error?.code).toBe(RLS_DENIED)
    const ledger = await q(() => me.from('point_events').select('user_id').neq('user_id', myId).limit(1), "others' ledger")
    expect(ledger.data ?? []).toEqual([])
  })
})

/**
 * #111: signed-in RPCs are no longer executable by anon. Skips while the
 * migration is not on beta (anon can still call them then).
 * TODO(#111): drop the skip once 20261028160000_definer_search_path is applied.
 */
test.describe('definer hardening (#111)', () => {
  test('anon cannot call the chat and notification RPCs', async () => {
    const probe = await q(() => anon.rpc('get_my_conversations'), 'anon get_my_conversations')
    test.skip(!probe.error, 'TODO(#111): migration not on beta yet')
    expect(probe.error?.code).toBe(RLS_DENIED)
    for (const fn of ['get_chat_unread_count', 'mark_all_notifications_read'] as const) {
      const res = await q(() => anon.rpc(fn), `anon ${fn}`)
      expect(res.error?.code, `anon ${fn}`).toBe(RLS_DENIED)
    }
    const dm = await q(() => anon.rpc('find_or_create_dm', { other_user_id: BUDDY_ID }), 'anon find_or_create_dm')
    expect(dm.error?.code).toBe(RLS_DENIED)
  })
})
