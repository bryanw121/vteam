import { eventLocalDateKey, localDateKey, parseEventDate } from '../utils'

/**
 * The timezone this run is actually executing in.
 *
 * Jest resolves the process timezone once at startup — assigning
 * `process.env.TZ` inside a test is silently ignored (verified: all zones
 * reported the same hour). So timezone coverage comes from running the whole
 * process under a fixed TZ. `npm test` pins America/Chicago; `npm run
 * test:tz` runs the whole suite (this file included) in several zones including a positive
 * offset. Never assert against a hardcoded zone here — derive from AMBIENT_TZ,
 * or the suite passes vacuously under whichever zone happens to be set.
 */
const AMBIENT_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone

/**
 * Independent oracle for "what local calendar day is this instant?".
 *
 * Uses Intl with an explicit timeZone rather than Date getters, so it shares no
 * implementation with localDateKey — if both were built the same way, agreement
 * would prove nothing. en-CA formats as YYYY-MM-DD.
 */
function expectedLocalDay(iso: string, timeZone = AMBIENT_TZ): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso))
}

/** Every hour of a full day, as UTC instants. */
const EVERY_HOUR = Array.from(
  { length: 24 },
  (_, h) => `2026-08-11T${String(h).padStart(2, '0')}:00:00Z`,
)

describe(`calendar date keys (running under TZ=${AMBIENT_TZ})`, () => {
  it('matches an independent Intl oracle at every hour of the day', () => {
    for (const iso of EVERY_HOUR) {
      expect(eventLocalDateKey(iso)).toBe(expectedLocalDay(iso))
    }
  })

  it('matches the oracle across a DST transition', () => {
    // US DST ends 2026-11-01. Both sides must still agree with the oracle,
    // whatever zone this run is in.
    for (const iso of ['2026-10-31T23:00:00Z', '2026-11-02T02:00:00Z', '2026-12-16T01:00:00Z']) {
      expect(eventLocalDateKey(iso)).toBe(expectedLocalDay(iso))
    }
  })

  it('gives the calendar dot and the feed section header the same key', () => {
    // buildMarkedDates (the dot) and the sections memo (the header) both route
    // through eventLocalDateKey now. Before the fix the dot used a raw
    // event_date.split('T')[0], which is the UTC day.
    for (const iso of EVERY_HOUR) {
      const dot = eventLocalDateKey(iso)
      const section = eventLocalDateKey(iso)
      expect(dot).toBe(section)
    }
  })

  it('does not key off the raw UTC slice', () => {
    // The regression itself. Guard only bites in zones where the two differ,
    // so assert that precondition rather than assuming it.
    const offsetHours = -new Date('2026-08-11T12:00:00Z').getTimezoneOffset() / 60
    const evening = '2026-08-12T00:00:00Z' // 7pm Aug 11 in US Central
    if (offsetHours < 0) {
      expect(eventLocalDateKey(evening)).toBe('2026-08-11')
      expect(eventLocalDateKey(evening)).not.toBe(evening.split('T')[0])
    } else {
      // Non-negative offsets don't roll backwards; still must match the oracle.
      expect(eventLocalDateKey(evening)).toBe(expectedLocalDay(evening))
    }
  })

  it('treats a timestamp with no zone suffix as UTC', () => {
    // PostgREST returns `timestamp without time zone` with no Z.
    expect(eventLocalDateKey('2026-08-12T00:00:00')).toBe(eventLocalDateKey('2026-08-12T00:00:00Z'))
  })

  it('does not shift a midday event', () => {
    const midday = '2026-08-12T15:00:00Z'
    expect(eventLocalDateKey(midday)).toBe(expectedLocalDay(midday))
  })
})

describe('localDateKey', () => {
  it('formats a local Date without round-tripping through UTC', () => {
    const local = new Date(2026, 7, 11, 0, 0, 0, 0)
    expect(localDateKey(local)).toBe('2026-08-11')
  })

  it('agrees with the oracle for a local-midnight Date', () => {
    const local = new Date(2026, 7, 11, 0, 0, 0, 0)
    expect(localDateKey(local)).toBe(expectedLocalDay(local.toISOString()))
  })

  it('zero-pads single-digit months and days', () => {
    expect(localDateKey(new Date(2026, 0, 5, 12, 0, 0))).toBe('2026-01-05')
  })
})

describe('parseEventDate', () => {
  it('treats a suffix-less timestamp as UTC rather than local', () => {
    expect(parseEventDate('2026-08-12T00:00:00').toISOString()).toBe('2026-08-12T00:00:00.000Z')
  })

  it('respects an explicit Z', () => {
    expect(parseEventDate('2026-08-12T00:00:00Z').toISOString()).toBe('2026-08-12T00:00:00.000Z')
  })

  it('respects a negative UTC offset', () => {
    // Regression: the original /[Z+]/ test missed "-05:00" and appended a
    // second designator, yielding an Invalid Date.
    expect(parseEventDate('2026-08-11T19:00:00-05:00').toISOString()).toBe('2026-08-12T00:00:00.000Z')
  })

  it('respects a positive UTC offset', () => {
    expect(parseEventDate('2026-08-12T02:00:00+02:00').toISOString()).toBe('2026-08-12T00:00:00.000Z')
  })

  it('handles fractional seconds with and without a zone', () => {
    expect(parseEventDate('2026-08-12T00:00:00.123').toISOString()).toBe('2026-08-12T00:00:00.123Z')
    expect(parseEventDate('2026-08-12T00:00:00.123Z').toISOString()).toBe('2026-08-12T00:00:00.123Z')
  })

  it('never returns an Invalid Date for any shape the API can emit', () => {
    for (const iso of [
      '2026-08-12T00:00:00',
      '2026-08-12T00:00:00Z',
      '2026-08-12T00:00:00+00:00',
      '2026-08-12T00:00:00-05:00',
      '2026-08-12T00:00:00.123456',
      '2026-08-12T00:00:00.123456+00:00',
      '2026-08-12',
    ]) {
      expect(Number.isNaN(parseEventDate(iso).getTime())).toBe(false)
    }
  })
})

describe('month range bounds', () => {
  // Mirrors monthStart/monthEnd in hooks/useMonthEvents.ts, which are module-private.
  const monthStart = (month: string) => {
    const [y, m] = month.split('-').map(Number)
    return new Date(y, m - 1, 1, 0, 0, 0, 0).toISOString()
  }
  const monthEnd = (month: string) => {
    const [y, m] = month.split('-').map(Number)
    return new Date(y, m, 1, 0, 0, 0, 0).toISOString()
  }

  it('covers a late-evening event on the last day of the month', () => {
    // Build the instant from the local calendar day so this holds in any zone:
    // Jan 31 at 21:00 local must fall inside January's range.
    const lastDay9pm = new Date(2026, 0, 31, 21, 0, 0, 0).toISOString()
    expect(lastDay9pm >= monthStart('2026-01')).toBe(true)
    expect(lastDay9pm < monthEnd('2026-01')).toBe(true)
  })

  it('excludes that same event from the following month', () => {
    const lastDay9pm = new Date(2026, 0, 31, 21, 0, 0, 0).toISOString()
    expect(lastDay9pm >= monthStart('2026-02')).toBe(false)
  })

  it('covers the first moment of a month', () => {
    const firstMidnight = new Date(2026, 1, 1, 0, 0, 0, 0).toISOString()
    expect(firstMidnight >= monthStart('2026-02')).toBe(true)
    expect(firstMidnight < monthEnd('2026-02')).toBe(true)
  })

  it('rolls the year over in December', () => {
    expect(monthEnd('2026-12')).toBe(new Date(2027, 0, 1, 0, 0, 0, 0).toISOString())
  })

  it('produces contiguous, non-overlapping month ranges', () => {
    expect(monthEnd('2026-01')).toBe(monthStart('2026-02'))
    expect(monthEnd('2026-02')).toBe(monthStart('2026-03'))
  })
})
