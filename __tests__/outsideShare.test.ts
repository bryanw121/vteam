import type { ExternalProgram } from '../types'
import {
  programPreviewMeta, programShareText, sessionPreviewMeta, sessionShareText, shareToday,
} from '../utils/outsideShare'
import { GENERIC_PREVIEW } from '../utils/eventShare'

const TODAY = '2026-11-25'

const prog = (extra: Partial<ExternalProgram> = {}): ExternalProgram => ({
  id: 'nagva-lone-star', kind: 'tournament', surface: 'indoor', region: null, state: 'TX', series: 'nagva', org: 'NAGVA',
  title: 'NAGVA Lone Star Classic', venue: null, city: 'Houston', address: null, format: null, divisions: [],
  starts_on: '2026-12-05', ends_on: '2026-12-06', weekdays: [], registration_opens: null, registration_deadline: '2026-11-30',
  waitlist_on: null, team_price: null, individual_price: '$65', price_note: null, price_changes_on: null,
  status: 'open', signup_url: 'https://example.test/x', source_url: 'https://example.test/x', checked_at: '2026-11-25T13:00:00Z',
  ...extra,
})

// 10:00 AM in Austin on Sat, Nov 28 2026 (UTC-6).
const session = {
  title: 'Sand open play', venue: 'Zilker Park', city: 'Austin',
  starts_at: '2026-11-28T16:00:00Z', ends_at: '2026-11-28T18:00:00Z', price: '$8', level: 'All levels',
}

describe('sharing outside games', () => {
  it('writes one line for a session, in Austin time whatever the device zone', () => {
    expect(sessionShareText(session)).toBe('Sand open play at Zilker Park, Sat, Nov 28 at 10:00 AM. $8 · All levels.')
    expect(sessionShareText({ ...session, price: null, level: null })).toBe('Sand open play at Zilker Park, Sat, Nov 28 at 10:00 AM.')
  })

  it('writes one line for a tournament and a league', () => {
    expect(programShareText(prog(), TODAY)).toBe('NAGVA Lone Star Classic in Houston, Sat, Dec 5 – Sun, Dec 6. Sign up by Mon, Nov 30.')
    expect(programShareText(prog({ kind: 'league', title: 'Winter 6s', city: null, weekdays: ['Sunday'], starts_on: '2026-12-06', ends_on: '2027-02-07', status: 'full' }), TODAY))
      .toBe('Winter 6s, Sundays · Dec 6 – Feb 7. Full.')
  })

  it('previews a session, an ended one and a missing one', () => {
    const before = new Date('2026-11-25T12:00:00Z')
    const up = sessionPreviewMeta(session, before)
    expect(up.state).toBe('upcoming')
    expect(up.title).toBe('Sand open play at Zilker Park')
    expect(up.description).toContain('Sat, Nov 28 at 10:00 AM')
    expect(sessionPreviewMeta(session, new Date('2026-11-29T00:00:00Z')).title).toBe('Sand open play at Zilker Park (ended)')
    expect(sessionPreviewMeta(null, before)).toBe(GENERIC_PREVIEW)
  })

  it('previews a program, an ended one and a missing one', () => {
    const up = programPreviewMeta(prog(), TODAY)
    expect(up).toMatchObject({ state: 'upcoming', title: 'NAGVA Lone Star Classic' })
    expect(up.description.startsWith('Tournament run by NAGVA. ')).toBe(true)
    expect(programPreviewMeta(prog(), '2026-12-07').state).toBe('ended')
    expect(programPreviewMeta(null, TODAY)).toBe(GENERIC_PREVIEW)
  })

  it('takes today in Austin time', () => {
    // 1 AM UTC on the 26th is still the 25th in Austin.
    expect(shareToday(new Date('2026-11-26T01:00:00Z'))).toBe('2026-11-25')
  })
})
