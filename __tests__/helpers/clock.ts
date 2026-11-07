/**
 * Clock helpers for tests that depend on "now" (#195). The suite runs in
 * America/Chicago (`npm test`) and again in UTC, Asia/Tokyo and
 * America/Los_Angeles (`npm run test:tz`), so a test either builds its times
 * in the device's zone (`localDate`) or pins an instant (`Date.parse('...Z')`)
 * and asserts zone-independent output. Never write a bare "2026-08-20T19:00:00"
 * and expect a particular local hour.
 */

/** A Date at this wall-clock time in the zone the tests run in (month is 1-based). */
export function localDate(y: number, month: number, d: number, h = 0, min = 0): Date {
  return new Date(y, month - 1, d, h, min)
}

/** Fake timers with the clock set to `at`. Pair with `jest.useRealTimers()` in afterEach. */
export function travelTo(at: Date | number): void {
  jest.useFakeTimers()
  jest.setSystemTime(at)
}

/** The next local midnight after `from` (the moment the date key changes). */
export function nextLocalMidnight(from: Date): Date {
  return new Date(from.getFullYear(), from.getMonth(), from.getDate() + 1)
}

/** US daylight-saving changes in 2026 (America/Chicago and America/Los_Angeles): spring forward, fall back. */
export const DST_DAYS = { springForward: '2026-03-08', fallBack: '2026-11-01' } as const
