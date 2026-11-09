import { sessionConfirmation } from '../utils/externalFreshness'

const TODAY = '2026-11-09'

describe('sessionConfirmation: how recently Schelagg confirmed an outside session', () => {
  it('trusts scraped sessions checked in the last two days, labels older ones, hides a week-old source', () => {
    expect(sessionConfirmation({ source_id: 'volleyworld', verified_at: '2026-11-08' }, TODAY)).toEqual({ state: 'ok', note: null })
    expect(sessionConfirmation({ source_id: 'volleyworld', verified_at: '2026-11-07' }, TODAY).state).toBe('ok')
    expect(sessionConfirmation({ source_id: 'volleyworld', verified_at: '2026-11-06' }, TODAY)).toEqual({ state: 'unconfirmed', note: "Couldn't recheck with the venue since Nov 6" })
    expect(sessionConfirmation({ source_id: 'reclub', verified_at: '2026-11-02' }, TODAY).state).toBe('unconfirmed')
    expect(sessionConfirmation({ source_id: 'reclub', verified_at: '2026-11-01' }, TODAY)).toEqual({ state: 'hidden', note: null })
  })
  it('gives hand-checked sessions three weeks and never hides them for age', () => {
    expect(sessionConfirmation({ source_id: 'manual', verified_at: '2026-10-20' }, TODAY).state).toBe('ok')
    expect(sessionConfirmation({ source_id: 'manual', verified_at: '2026-10-18' }, TODAY)).toEqual({ state: 'unconfirmed', note: 'Last checked Oct 18: confirm with the venue' })
    expect(sessionConfirmation({ source_id: 'manual', verified_at: '2026-01-01' }, TODAY).state).toBe('unconfirmed')
  })
  it('has nothing to say without a date', () => {
    expect(sessionConfirmation({ source_id: 'volleyworld', verified_at: null }, TODAY).state).toBe('ok')
    expect(sessionConfirmation({ source_id: 'volleyworld', verified_at: 'soon' }, TODAY).state).toBe('ok')
  })
})
