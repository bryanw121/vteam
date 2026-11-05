import { BADGE_ARTWORK } from '../constants/badgeArtwork'
import { BADGE_DEFINITIONS } from '../constants/badges'

it('bundles art for every catalog tier, including locked previews and Vex', () => {
  expect(BADGE_DEFINITIONS.length).toBeGreaterThan(0)
  let tiers = 0
  for (const def of BADGE_DEFINITIONS) {
    for (const tier of def.tiers) {
      expect(BADGE_ARTWORK[def.type]?.[tier.tier]).toBeDefined()
      tiers++
    }
  }
  expect(tiers).toBe(36)
})
