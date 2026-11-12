import { PROFILE_BORDERS, isBorderUnlocked } from '../constants/badges'
import { pickerItemsFor } from '../components/profile/BadgeSlotSheet'
import { shortPositionLabel } from '../components/profile/options'
import type { UserBadge } from '../types'

jest.mock('expo-router', () => ({ useFocusEffect: () => {} }))

function badge(type: string, tier: number, displayOrder: number | null = null): UserBadge {
  return { id: type, user_id: 'u1', badge_type: type, tier, awarded_at: 'x', display_order: displayOrder, display_tier: null } as unknown as UserBadge
}

describe('PROFILE_BORDERS drive the swatches', () => {
  it('every border has gradient stops for its swatch', () => {
    expect(PROFILE_BORDERS.length).toBeGreaterThan(0)
    for (const border of PROFILE_BORDERS) {
      expect(border.ringColors.length).toBeGreaterThanOrEqual(2)
    }
  })

  it('unlocks a border from an earned badge tier', () => {
    const bronze = PROFILE_BORDERS.find(b => b.type === 'bronze')!
    expect(isBorderUnlocked(bronze, [{ badge_type: 'event_attendee', tier: 3 }])).toBe(true)
    expect(isBorderUnlocked(bronze, [{ badge_type: 'event_attendee', tier: 2 }])).toBe(false)
  })

  it('unlocks the elemental borders only at the top skill tier', () => {
    const storm = PROFILE_BORDERS.find(b => b.type === 'storm')!
    const aether = PROFILE_BORDERS.find(b => b.type === 'aether')!

    expect(isBorderUnlocked(storm, [{ badge_type: 'communication_cheer', tier: 3 }])).toBe(true)
    expect(isBorderUnlocked(storm, [{ badge_type: 'communication_cheer', tier: 2 }])).toBe(false)
    expect(isBorderUnlocked(aether, [{ badge_type: 'set_cheer', tier: 3 }])).toBe(true)
    expect(isBorderUnlocked(aether, [{ badge_type: 'set_cheer', tier: 2 }])).toBe(false)
  })
})

describe('pickerItemsFor (badge slot sheet)', () => {
  it('expands a multi-tier badge into one item per earned tier', () => {
    const items = pickerItemsFor([badge('event_attendee', 3)], 1)
    expect(items.map(i => i.displayTier)).toEqual([1, 2, 3])
  })

  it('offers a single-tier badge once', () => {
    expect(pickerItemsFor([badge('beta_tester', 1)], 1).map(i => i.displayTier)).toEqual([1])
  })

  it('skips unearned badges and the one already in this slot', () => {
    const items = pickerItemsFor([badge('event_attendee', 0), badge('beta_tester', 1, 2), badge('profile_complete', 1, 1)], 2)
    expect(items.map(i => i.badge.badge_type)).toEqual(['profile_complete'])
  })

  it('ignores badge types without a definition', () => {
    expect(pickerItemsFor([badge('not_a_badge', 2)], 1)).toEqual([])
  })
})

describe('shortPositionLabel', () => {
  it('abbreviates long position names for the hero chips', () => {
    expect(shortPositionLabel('outside_hitter')).toBe('OH')
    expect(shortPositionLabel('defensive_specialist')).toBe('DS')
    expect(shortPositionLabel('setter')).toBe('Setter')
  })
})
