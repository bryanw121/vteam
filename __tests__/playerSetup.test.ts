import { PLAYER_SETUP_MARKER, shouldShowPlayerSetup } from '../utils/playerSetup'
import { routes } from '../utils/routes'
import { isProtectedPath } from '../utils/authGate'
import { SKILL_LEVEL_HINTS } from '../constants/copy'
import { VOLLEYBALL_SKILL_LEVEL_OPTIONS } from '../components/profile/options'
import { ANALYTICS_EVENTS } from '../constants/analytics'

const empty = { position: [], skill_level: null }
const noSettings = { home_city_id: null, seen_banners: [] }
const none = new Set<string>()

describe('shouldShowPlayerSetup (#156)', () => {
  it('offers setup to a signed-in player with no position, level or city', () => {
    expect(shouldShowPlayerSetup({ signedIn: true, profile: empty, settings: noSettings, seenOnDevice: none })).toBe(true)
    expect(shouldShowPlayerSetup({ signedIn: true, profile: empty, settings: null, seenOnDevice: none })).toBe(true)
  })

  it('not when any of the three is set', () => {
    expect(shouldShowPlayerSetup({ signedIn: true, profile: { position: ['setter'], skill_level: null }, settings: noSettings, seenOnDevice: none })).toBe(false)
    expect(shouldShowPlayerSetup({ signedIn: true, profile: { position: [], skill_level: 'bb' }, settings: noSettings, seenOnDevice: none })).toBe(false)
    expect(shouldShowPlayerSetup({ signedIn: true, profile: empty, settings: { home_city_id: 'c1', seen_banners: [] }, seenOnDevice: none })).toBe(false)
  })

  it('never again once finished or skipped, on this device or the account', () => {
    expect(shouldShowPlayerSetup({ signedIn: true, profile: empty, settings: noSettings, seenOnDevice: new Set([PLAYER_SETUP_MARKER]) })).toBe(false)
    expect(shouldShowPlayerSetup({ signedIn: true, profile: empty, settings: { home_city_id: null, seen_banners: [PLAYER_SETUP_MARKER] }, seenOnDevice: none })).toBe(false)
  })

  it('never for guests, and undecided while the profile or settings load', () => {
    expect(shouldShowPlayerSetup({ signedIn: false, profile: empty, settings: noSettings, seenOnDevice: none })).toBe(false)
    expect(shouldShowPlayerSetup({ signedIn: true, profile: undefined, settings: noSettings, seenOnDevice: none })).toBeNull()
    expect(shouldShowPlayerSetup({ signedIn: true, profile: empty, settings: undefined, seenOnDevice: none })).toBeNull()
  })
})

describe('/welcome', () => {
  it('has a route builder that carries where to go next', () => {
    expect(routes.welcome()).toBe('/welcome')
    expect(routes.welcome('/event/abc?tab=1')).toBe('/welcome?next=%2Fevent%2Fabc%3Ftab%3D1')
  })

  it('needs an account', () => {
    expect(isProtectedPath('/welcome')).toBe(true)
  })

  it('has a hint for every level and analytics names for the flow', () => {
    for (const opt of VOLLEYBALL_SKILL_LEVEL_OPTIONS) expect(SKILL_LEVEL_HINTS[opt.value]).toBeTruthy()
    expect(ANALYTICS_EVENTS.playerSetupShown).toBe('player_setup_shown')
    expect(ANALYTICS_EVENTS.playerSetupCompleted).toBe('player_setup_completed')
  })
})
