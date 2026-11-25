import { SPLASH_MIN_MS, splashHoldMs } from '../utils/splash'

describe('splashHoldMs', () => {
  it('holds a fast start until one bounce has played', () => {
    expect(splashHoldMs(300, false)).toBe(SPLASH_MIN_MS - 300)
    expect(splashHoldMs(0, false)).toBe(SPLASH_MIN_MS)
  })
  it('never adds to a slow start', () => {
    expect(splashHoldMs(SPLASH_MIN_MS, false)).toBe(0)
    expect(splashHoldMs(4000, false)).toBe(0)
  })
  it('does not hold with reduced motion', () => {
    expect(splashHoldMs(100, true)).toBe(0)
  })
})
