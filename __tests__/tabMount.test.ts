import { nextMountedTabs, prefetchNeighbor } from '../utils/tabMount'
import { EVENTS_TAB_INDEX, PROFILE_TAB_INDEX, TABS } from '../constants/navigation'

describe('nextMountedTabs (#224)', () => {
  it('starts with only the tab the page opened on', () => {
    expect([...nextMountedTabs(new Set(), PROFILE_TAB_INDEX)]).toEqual([PROFILE_TAB_INDEX])
    expect(nextMountedTabs(new Set(), PROFILE_TAB_INDEX).has(EVENTS_TAB_INDEX)).toBe(false)
  })

  it('adds a tab once and keeps the earlier ones', () => {
    const first = nextMountedTabs(new Set(), PROFILE_TAB_INDEX)
    const both = nextMountedTabs(first, EVENTS_TAB_INDEX)
    expect([...both].sort()).toEqual([EVENTS_TAB_INDEX, PROFILE_TAB_INDEX].sort())
    expect(nextMountedTabs(both, EVENTS_TAB_INDEX)).toBe(both)
  })
})

describe('prefetchNeighbor', () => {
  it('prefers the next tab, else the previous one', () => {
    expect(prefetchNeighbor(0, 4)).toBe(1)
    expect(prefetchNeighbor(3, 4)).toBe(2)
    expect(prefetchNeighbor(0, 1)).toBeNull()
    expect(prefetchNeighbor(TABS.length - 1)).toBe(TABS.length - 2)
  })
})
