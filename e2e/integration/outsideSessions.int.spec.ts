/**
 * Outside sessions' "Also on" (#421), the way a guest's phone reads it: in the last week of a
 * month the feed holds only that month, so the session sheet reads the source's later dates
 * itself (readAlsoOnRows, the same function the app calls). Read-only; nothing is written.
 */
import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../env'
import { withNetworkRetry } from '../retry'
import { EXTERNAL_SESSION_SELECT } from '../../constants/events'
import { readAlsoOnRows } from '../../utils/alsoOnQuery'
import { mergeAlsoOn } from '../../utils/outsideSession'
import type { ExternalSession } from '../../types'

const guest = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } })
const localDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

test('a guest reads a session\'s later dates past the loaded month, with the feed\'s filters', async () => {
  // Beta has its own hourly Skelly import (CLAUDE.md, "Environments").
  const upcoming = await withNetworkRetry(async () => {
    const { data, error } = await guest.from('external_sessions').select(EXTERNAL_SESSION_SELECT)
      .gt('starts_at', new Date().toISOString()).eq('canceled', false).order('starts_at', { ascending: true }).limit(500)
    if (error) throw new Error(`external_sessions: ${error.message}`)
    return (data ?? []) as ExternalSession[]
  })
  // A weekly session: the first occurrence of a source + title + venue that has a later one.
  const key = (s: ExternalSession) => `${s.source_id}|${s.title.trim().toLowerCase()}|${(s.venue ?? '').trim().toLowerCase()}`
  const first = upcoming.find(s => upcoming.some(o => o.id !== s.id && key(o) === key(s) && o.starts_at > s.starts_at))
  expect(first, `beta has no outside session with a later date (${upcoming.length} upcoming rows): is beta's ingest-schelagg-feed running?`).toBeTruthy()
  const session = first as ExternalSession

  const rows = await withNetworkRetry(() => readAlsoOnRows(guest, session, Date.now()))
  expect(rows.length, 'the read returns later rows of that source').toBeGreaterThan(0)
  for (const r of rows) {
    expect(r.source_id).toBe(session.source_id)
    expect(Date.parse(r.starts_at)).toBeGreaterThan(Date.parse(session.starts_at))
  }
  expect(rows.map(r => r.starts_at), 'soonest first').toEqual([...rows.map(r => r.starts_at)].sort())

  // With nothing else loaded (a phone at month end, or a link), the sheet still lists them.
  const listed = mergeAlsoOn(session, [session], rows, localDay(new Date()))
  expect(listed.length, 'Also on lists the later dates').toBeGreaterThan(0)
  expect(listed.every(s => key(s) === key(session))).toBe(true)
})
