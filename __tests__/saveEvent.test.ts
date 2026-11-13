/**
 * #188 part 4: a host form save is one `save_event` call. Replaces the old
 * eventTagWiring guards: the tag diff, the waitlist promotion and the "saved but
 * tags failed" outcomes are gone from the client because the database does it
 * all in one transaction.
 */
import { readFileSync } from 'fs'
import { join } from 'path'

const mockRpc = jest.fn()
jest.mock('../lib/supabase', () => ({ supabase: { rpc: (...a: unknown[]) => mockRpc(...a) } }))

import { saveEvent, saveEventArgs } from '../hooks/host/useSaveEvent'
import { emptyForm } from '../utils/hostForm'
import { localDate } from './helpers/clock'
import type { HostRecurrence, SaveEventInput } from '../types'

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8')
const start = localDate(2026, 11, 17, 18)
const form = { ...emptyForm(start), title: 'Tuesday 6s', date: start, priceText: '5', venmoHandle: 'ana', maxAttendees: 12 }
const single: HostRecurrence = { enabled: false, days: [], cadence: 'weekly', endDate: localDate(2026, 12, 31) }
const input = (f: Partial<SaveEventInput> = {}): SaveEventInput => ({ editId: null, form, recurrence: single, tagIds: ['t1'], clubId: 'c1', ...f })

describe('saveEventArgs', () => {
  it('a create sends one date, the columns, tags and club', () => {
    const args = saveEventArgs(input())
    expect(args.p_edit_id).toBeNull()
    expect(args.p_dates).toEqual([start.toISOString()])
    expect(args.p_tag_ids).toEqual(['t1'])
    expect(args.p_event).toMatchObject({ title: 'Tuesday 6s', price: 5, venmo_handle: 'ana', max_attendees: 12, club_id: 'c1' })
    expect(args.p_event).not.toHaveProperty('created_by')
  })

  it('a recurring create sends every date of the series', () => {
    const weekly = { ...single, enabled: true, days: [start.getDay()], endDate: localDate(2026, 12, 8, 23) }
    const args = saveEventArgs(input({ recurrence: weekly }))
    expect(args.p_dates.length).toBe(4)
    expect(args.p_dates[0]).toBe(start.toISOString())
  })

  it('an edit sends the one start time, whatever Repeat says', () => {
    const args = saveEventArgs(input({ editId: 'e1', recurrence: { ...single, enabled: true, days: [1, 3] } }))
    expect(args.p_edit_id).toBe('e1')
    expect(args.p_dates).toEqual([start.toISOString()])
  })
})

describe('saveEvent', () => {
  beforeEach(() => mockRpc.mockReset())

  it('calls save_event once and returns the ids', async () => {
    mockRpc.mockResolvedValue({ data: ['e1', 'e2'], error: null })
    await expect(saveEvent(input())).resolves.toEqual(['e1', 'e2'])
    expect(mockRpc).toHaveBeenCalledTimes(1)
    expect(mockRpc.mock.calls[0][0]).toBe('save_event')
  })

  it('throws on an RPC error (nothing was written)', async () => {
    mockRpc.mockResolvedValue({ data: null, error: new Error('nope') })
    await expect(saveEvent(input())).rejects.toThrow('nope')
  })

  it('refuses a series with no dates without calling the server', async () => {
    const none = { ...single, enabled: true, days: [], endDate: localDate(2026, 11, 1) }
    await expect(saveEvent(input({ recurrence: none }))).rejects.toThrow(/no dates/)
    expect(mockRpc).not.toHaveBeenCalled()
  })
})

describe('the host screen saves through save_event only', () => {
  const host = read('app/(app)/host.tsx')

  it('never writes events, event_tags or event_attendees itself', () => {
    expect(host).not.toMatch(/from\('events'\)\s*\.(insert|update)/)
    expect(host).not.toMatch(/from\('event_tags'\)/)
    expect(host).not.toMatch(/from\('event_attendees'\)/)
    expect(host).toMatch(/saveMutation\.mutate\(/)
  })

  it('has two outcomes: saved, or nothing saved', () => {
    expect(host).not.toMatch(/TagWriteError|tags-failed|tags-uncertain/)
    expect(read('components/host/HostResultModal.tsx')).toMatch(/Nothing was saved/)
  })
})

describe('save_event migration', () => {
  const sql = read('supabase/migrations/20261113200000_save_event.sql')

  it('runs as the caller, so RLS decides every write', () => {
    expect(sql).toMatch(/security invoker/)
    expect(sql).toMatch(/revoke all on function public\.save_event\(uuid, jsonb, timestamptz\[\], uuid\[\]\) from public, anon/)
    expect(sql).toMatch(/grant execute on function public\.save_event\(uuid, jsonb, timestamptz\[\], uuid\[\]\) to authenticated/)
  })

  it('diffs tags instead of deleting every tag', () => {
    expect(sql).toMatch(/tag_id <> all\(coalesce\(p_tag_ids, '\{\}'\)\)/)
    expect(sql).toMatch(/on conflict do nothing/)
  })

  it('promotes the oldest waitlisted under the capacity lock, never past the cap', () => {
    expect(sql).toMatch(/pg_advisory_xact_lock\(hashtextextended\('event_capacity:'/)
    expect(sql).toMatch(/order by w\.joined_at\s+limit free\s+for update skip locked/)
    expect(sql).toMatch(/event_guests/)
  })

  it('caps a series at 52 dates', () => {
    expect(sql).toMatch(/not between 1 and 52/)
  })
})
