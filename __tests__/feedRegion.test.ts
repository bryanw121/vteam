/**
 * Which city's outside games a viewer sees (#339): the pure rules, the `/api/where` Edge
 * function and the device store.
 */
import handler from '../api/where'
import { FEED_REGIONS, DEFAULT_FEED_REGION } from '../constants/feedRegions'
import { feedRegionName, isFeedRegion, kmBetween, nearestFeedRegion, parseStoredRegion, resolveFeedRegion } from '../utils/feedRegion'

describe('nearestFeedRegion', () => {
  it('picks the covered city within about 100 miles', () => {
    expect(nearestFeedRegion(30.27, -97.74)).toBe('austin')
    expect(nearestFeedRegion(33.02, -96.70)).toBe('dallas') // Plano
    expect(nearestFeedRegion(29.79, -95.82)).toBe('houston') // Katy
    expect(nearestFeedRegion(30.51, -97.68)).toBe('austin') // Round Rock
  })
  it('is null far from every city, or for nonsense', () => {
    expect(nearestFeedRegion(40.71, -74.0)).toBeNull()
    expect(nearestFeedRegion(NaN, -97)).toBeNull()
    expect(nearestFeedRegion('30', '-97')).toBeNull()
    expect(nearestFeedRegion(120, -97)).toBeNull()
  })
  it('measures real distances', () => {
    expect(Math.round(kmBetween([30.2672, -97.7431], [32.7767, -96.797]))).toBeGreaterThan(280)
  })
})

describe('resolveFeedRegion', () => {
  it('a pick on this device wins, then a covered home city, then the network, then Austin', () => {
    expect(resolveFeedRegion({ picked: 'houston', homeCity: 'Dallas', located: 'austin' })).toEqual({ region: 'houston', source: 'picked' })
    expect(resolveFeedRegion({ homeCity: 'Dallas', located: 'austin' })).toEqual({ region: 'dallas', source: 'home' })
    expect(resolveFeedRegion({ homeCity: 'Plano', located: 'dallas' })).toEqual({ region: 'dallas', source: 'network' })
    expect(resolveFeedRegion({ homeCity: 'Plano' })).toEqual({ region: DEFAULT_FEED_REGION, source: 'default' })
    expect(resolveFeedRegion({ picked: 'atlantis', located: 'nowhere' })).toEqual({ region: 'austin', source: 'default' })
  })
})

describe('stored pick and names', () => {
  it('keeps only covered cities', () => {
    expect(parseStoredRegion('{"region":"dallas"}')).toBe('dallas')
    expect(parseStoredRegion('{"region":"miami"}')).toBeNull()
    expect(parseStoredRegion('not json')).toBeNull()
    expect(parseStoredRegion(null)).toBeNull()
    expect(FEED_REGIONS.every(r => isFeedRegion(r.id))).toBe(true)
    expect(feedRegionName('houston')).toBe('Houston')
    expect(feedRegionName('san-antonio')).toBe('San Antonio')
  })
})

describe('api/where', () => {
  const ask = async (headers: Record<string, string>, method = 'GET') => handler(new Request('https://vteam.test/api/where', { method, headers }))
  it('answers only a region id from the request location headers, never cached', async () => {
    const res = await ask({ 'x-vercel-ip-latitude': '32.78', 'x-vercel-ip-longitude': '-96.80', 'x-vercel-ip-city': 'Dallas' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ region: 'dallas' })
    expect(res.headers.get('cache-control')).toBe('private, no-store')
  })
  it('null without a location, or far away', async () => {
    expect(await (await ask({})).json()).toEqual({ region: null })
    expect(await (await ask({ 'x-vercel-ip-latitude': '', 'x-vercel-ip-longitude': 'x' })).json()).toEqual({ region: null })
    expect(await (await ask({ 'x-vercel-ip-latitude': '47.6', 'x-vercel-ip-longitude': '-122.3' })).json()).toEqual({ region: null })
  })
  it('refuses other methods', async () => {
    expect((await ask({}, 'POST')).status).toBe(405)
  })
})
