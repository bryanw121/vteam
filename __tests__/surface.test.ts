import { isSurface, surfaceOf } from '../utils'

describe('surface helpers', () => {
  it('only accepts the three surfaces', () => {
    expect(['indoor', 'sand', 'grass'].every(isSurface)).toBe(true)
    expect(isSurface('outdoor')).toBe(false)
    expect(isSurface(null)).toBe(false)
  })

  it('reads the host choice for club events and the venue surface for outside sessions', () => {
    expect(surfaceOf({ surface: 'indoor' })).toBe('indoor')
    expect(surfaceOf({ surface: null })).toBeNull()
    expect(surfaceOf({ surface: 'indoor', _external: { surface: 'sand' } })).toBe('sand')
    expect(surfaceOf({ _external: { surface: null } })).toBeNull()
    expect(surfaceOf({ surface: 'clay' })).toBeNull()
  })
})

import { regionSlug } from '../utils/feedRegion'

describe('regionSlug', () => {
  it('turns a city name into a Schelagg region slug', () => {
    expect(regionSlug('Austin')).toBe('austin')
    expect(regionSlug('San Antonio')).toBe('san-antonio')
    expect(regionSlug(' St. Louis ')).toBe('st-louis')
  })
})
