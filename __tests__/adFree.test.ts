import { adFreeView } from '../utils/adFree'
import type { AdFreeStatus } from '../types'

const DAY = 86_400_000
const now = Date.parse('2026-10-28T12:00:00Z')
const status = (over: Partial<AdFreeStatus> = {}): AdFreeStatus => ({ cost: 100, days: 30, balance: 0, ad_free_until: null, ...over })

describe('adFreeView', () => {
  it('not enough points: cannot redeem, says how many are missing', () => {
    const v = adFreeView(status({ balance: 42 }), now)
    expect(v).toMatchObject({ active: false, canRedeem: false, shortBy: 58, untilDate: null })
  })

  it('exactly enough points: can redeem, 30 days from now', () => {
    const v = adFreeView(status({ balance: 100 }), now)
    expect(v.canRedeem).toBe(true)
    expect(v.shortBy).toBe(0)
    expect(v.nextUntilDate.getTime()).toBe(now + 30 * DAY)
  })

  it('active period: renewal extends from the current expiry', () => {
    const until = new Date(now + 10 * DAY).toISOString()
    const v = adFreeView(status({ balance: 150, ad_free_until: until }), now)
    expect(v.active).toBe(true)
    expect(v.untilDate?.toISOString()).toBe(until)
    expect(v.nextUntilDate.getTime()).toBe(now + 40 * DAY)
  })

  it('expired period: treated as not active, renewal starts now', () => {
    const v = adFreeView(status({ balance: 100, ad_free_until: new Date(now - DAY).toISOString() }), now)
    expect(v.active).toBe(false)
    expect(v.untilDate).toBeNull()
    expect(v.nextUntilDate.getTime()).toBe(now + 30 * DAY)
  })
})
