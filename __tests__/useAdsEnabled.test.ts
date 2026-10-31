import { useAdsEnabled } from '../hooks/useAdsEnabled'

const mockSession = { userId: null as string | null }
const mockStatus: { data: unknown; error: Error | null } = { data: undefined, error: null }

jest.mock('../contexts/session', () => ({ useSession: () => mockSession }))
jest.mock('../hooks/useAdFree', () => ({ useAdFreeStatus: () => mockStatus }))

const future = new Date(Date.now() + 86_400_000).toISOString()
const past = new Date(Date.now() - 86_400_000).toISOString()

describe('useAdsEnabled', () => {
  beforeEach(() => { mockSession.userId = null; mockStatus.data = undefined; mockStatus.error = null })

  it('guests always see ads', () => {
    expect(useAdsEnabled()).toBe(true)
  })
  it('hides ads while a signed-in mockStatus is loading, shows them if it fails', () => {
    mockSession.userId = 'u1'
    expect(useAdsEnabled()).toBe(false)
    mockStatus.error = new Error('offline')
    expect(useAdsEnabled()).toBe(true)
  })
  it('follows ad_free_until', () => {
    mockSession.userId = 'u1'
    mockStatus.data = { cost: 100, days: 30, balance: 0, ad_free_until: null }
    expect(useAdsEnabled()).toBe(true)
    mockStatus.data = { cost: 100, days: 30, balance: 0, ad_free_until: future }
    expect(useAdsEnabled()).toBe(false)
    mockStatus.data = { cost: 100, days: 30, balance: 0, ad_free_until: past }
    expect(useAdsEnabled()).toBe(true)
  })
})
