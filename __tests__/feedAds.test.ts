import { adsEnabled, planFeedAds } from '../utils/feedAds'
import { FEED_ADS } from '../constants/ads'
import type { AdBanner, EventWithDetails, FeedAds } from '../types'

const item = (id: string, extra: Partial<EventWithDetails> = {}) => ({ id, ...extra }) as EventWithDetails
const feed = (n: number) => Array.from({ length: n }, (_, i) => item(`e${i}`))
const banner = (id: string): AdBanner => ({ id, title: id, body: null, image_url: null, link_url: 'https://example.com', display_order: 0 })

describe('adsEnabled', () => {
  const now = Date.parse('2026-10-28T12:00:00Z')
  it('is on by default', () => {
    expect(adsEnabled()).toBe(true)
    expect(adsEnabled({ adFreeUntil: null, now })).toBe(true)
  })
  it('is off while an ad-free period runs', () => {
    expect(adsEnabled({ adFreeUntil: '2026-11-27T12:00:00Z', now })).toBe(false)
  })
  it('is back on once it has expired, and ignores garbage', () => {
    expect(adsEnabled({ adFreeUntil: '2026-10-28T11:59:59Z', now })).toBe(true)
    expect(adsEnabled({ adFreeUntil: 'not a date', now })).toBe(true)
  })
})

describe('planFeedAds', () => {
  const ads = (over: Partial<FeedAds> = {}): FeedAds => ({ banners: [], sponsoredEventIds: [], ...over })

  it('places nothing when ads are off or missing', () => {
    expect(planFeedAds(feed(30), ads({ banners: [banner('b')], sponsoredEventIds: ['e9'] }), false).size).toBe(0)
    expect(planFeedAds(feed(30), null, true).size).toBe(0)
    expect(planFeedAds(feed(30), ads(), true).size).toBe(0)
  })

  it('puts banners after the 5th item, then every 10, rotating', () => {
    const plan = planFeedAds(feed(26), ads({ banners: [banner('a'), banner('b')] }), true)
    const first = FEED_ADS.bannerFirstAfter - 1
    expect([...plan.keys()]).toEqual([`e${first}`, `e${first + FEED_ADS.bannerEvery}`, `e${first + 2 * FEED_ADS.bannerEvery}`])
    expect(plan.get(`e${first}`)).toEqual([{ kind: 'banner', banner: banner('a') }])
    expect(plan.get(`e${first + FEED_ADS.bannerEvery}`)).toEqual([{ kind: 'banner', banner: banner('b') }])
    expect(plan.get(`e${first + 2 * FEED_ADS.bannerEvery}`)).toEqual([{ kind: 'banner', banner: banner('a') }])
  })

  it('shows no banner in a feed shorter than the first slot', () => {
    expect(planFeedAds(feed(FEED_ADS.bannerFirstAfter - 1), ads({ banners: [banner('a')] }), true).size).toBe(0)
  })

  it('promotes the soonest sponsored event below the slot, once', () => {
    const items = feed(12)
    const plan = planFeedAds(items, ads({ sponsoredEventIds: ['e8', 'e4'] }), true)
    expect(plan.get(`e${FEED_ADS.sponsoredAfter - 1}`)).toEqual([{ kind: 'sponsored', event: items[4] }])
    expect(plan.size).toBe(1)
  })

  it('does not promote one already at the top, outside sessions or tournaments', () => {
    const items = [item('e0'), item('e1'), item('e2'), item('x', { _isTournament: true }), item('e4')]
    expect(planFeedAds(items, ads({ sponsoredEventIds: ['e0', 'e2', 'x'] }), true).size).toBe(0)
  })

  it('places the sponsored slot and banners independently', () => {
    const items = feed(6)
    const plan = planFeedAds(items, ads({ banners: [banner('a')], sponsoredEventIds: ['e5'] }), true)
    expect(plan.get('e1')).toEqual([{ kind: 'sponsored', event: items[5] }])
    expect(plan.get('e4')).toEqual([{ kind: 'banner', banner: banner('a') }])
  })
})
