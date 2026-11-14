import { isStartupConfig } from '../utils/startupConfig'
import { sentryEnvironment } from '../utils/sentryEnvironment'

// Nov 13: a saved `ads:feed` copy from before #280 ({ banners, sponsoredEventIds })
// reached feedAdsFrom and crashed the Events feed on open.
describe('stale snapshot shapes', () => {
  it('the pre-#280 ads copy is not a startup config, so the hook treats it as not loaded', () => {
    expect(isStartupConfig({ banners: [], sponsoredEventIds: ['e1'] })).toBe(false)
    expect(isStartupConfig({ appConfig: [], banners: [], sponsored: [] })).toBe(true)
  })
})

describe('sentryEnvironment', () => {
  it('follows the database, whatever the build variable says', () => {
    expect(sentryEnvironment('https://rmelsdqgrpfjzqisycdl.supabase.co', 'beta')).toBe('production')
    expect(sentryEnvironment('https://uifolvbwtrbcmfrvelnl.supabase.co', 'production')).toBe('beta')
  })
  it('keeps the build label elsewhere', () => {
    expect(sentryEnvironment('https://shotsmock.supabase.co', 'development')).toBe('development')
    expect(sentryEnvironment(undefined, undefined)).toBe('development')
  })
})
