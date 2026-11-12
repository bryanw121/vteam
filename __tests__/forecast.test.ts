/**
 * Weather on outdoor games (#165): utils/forecast.ts, pure.
 */
import {
  courtId,
  eventCourt,
  forecastEmoji,
  forecastSummary,
  forecastWindow,
  heatIndexF,
  pickForecastHours,
  shouldShowForecast,
} from '../utils/forecast'
import { FORECAST_HEAT_WARN_F, FORECAST_RAIN_WARN_POP } from '../constants/weather'
import type { ForecastHour } from '../types'

const NOW = Date.parse('2026-11-04T16:00:00Z')
const H = 3600_000

const outdoor = {
  event_date: '2026-11-05T15:00:00', // naive UTC, as PostgREST returns it
  surface: 'sand',
  cancelled_at: null,
  latitude: 30.26204,
  longitude: -97.75196,
}

const hour = (t: string, f: Partial<ForecastHour> = {}): ForecastHour => ({
  t, tempF: 75, pop: 10, windMph: 5, short: 'Sunny', icon: 'day/skc', rh: 40, ...f,
})

describe('forecastWindow / shouldShowForecast', () => {
  it('shows for a sand or grass event with coordinates within 7 days', () => {
    expect(shouldShowForecast(outdoor, NOW)).toBe(true)
    expect(shouldShowForecast({ ...outdoor, surface: 'grass' }, NOW)).toBe(true)
  })

  it('never for indoor or unset surfaces', () => {
    expect(forecastWindow({ ...outdoor, surface: 'indoor' }, NOW)).toBeNull()
    expect(forecastWindow({ ...outdoor, surface: null }, NOW)).toBeNull()
    expect(forecastWindow({ ...outdoor, surface: undefined }, NOW)).toBeNull()
  })

  it('never for outside sessions or outside tournaments (no events row to read coordinates from)', () => {
    expect(forecastWindow({ ...outdoor, _external: {} }, NOW)).toBeNull()
    expect(forecastWindow({ ...outdoor, _program: {} }, NOW)).toBeNull()
    expect(forecastWindow({ ...outdoor, _isTournament: true }, NOW)).toBeNull()
  })

  it('needs coordinates', () => {
    expect(shouldShowForecast({ ...outdoor, latitude: null }, NOW)).toBe(false)
    expect(shouldShowForecast({ ...outdoor, longitude: undefined }, NOW)).toBe(false)
    expect(shouldShowForecast({ ...outdoor, latitude: 0, longitude: 0 }, NOW)).toBe(false)
  })

  it('not for cancelled events, outside sessions or tournaments', () => {
    expect(forecastWindow({ ...outdoor, cancelled_at: '2026-11-04T10:00:00Z' }, NOW)).toBeNull()
    expect(forecastWindow({ ...outdoor, _external: {} }, NOW)).toBeNull()
    expect(forecastWindow({ ...outdoor, _isTournament: true }, NOW)).toBeNull()
  })

  it('not once the event has started or ended', () => {
    expect(forecastWindow({ ...outdoor, event_date: '2026-11-04T16:00:00Z' }, NOW)).toBeNull()
    expect(forecastWindow({ ...outdoor, event_date: '2026-11-01T16:00:00Z' }, NOW)).toBeNull()
  })

  it('is "later" beyond 7 days', () => {
    expect(forecastWindow({ ...outdoor, event_date: new Date(NOW + 7 * 24 * H).toISOString() }, NOW)).toBe('show')
    expect(forecastWindow({ ...outdoor, event_date: new Date(NOW + 7 * 24 * H + 60_000).toISOString() }, NOW)).toBe('later')
    expect(shouldShowForecast({ ...outdoor, event_date: '2026-11-20T15:00:00' }, NOW)).toBe(false)
  })
})

describe('eventCourt / courtId', () => {
  it('rounds to 2 decimals so one court shares one request', () => {
    expect(eventCourt(outdoor)).toEqual({ lat: 30.26, lng: -97.75 })
    expect(courtId(eventCourt({ latitude: 30.2649, longitude: -97.7501 })!)).toBe('30.26,-97.75')
    expect(courtId({ lat: 30.3, lng: -97 })).toBe('30.30,-97.00')
  })
})

describe('pickForecastHours', () => {
  const series = Array.from({ length: 12 }, (_, i) => hour(new Date(Date.parse('2026-11-05T12:00:00Z') + i * H).toISOString()))

  it('takes one hour before the start through the end, marking game hours', () => {
    // 15:00Z for 2h: 14 (lead), 15 + 16 (game), 17 (the hour that starts at the end)
    const cells = pickForecastHours(series, '2026-11-05T15:00:00', 120)
    expect(cells.map(c => [c.t.slice(11, 13), c.inGame])).toEqual([['14', false], ['15', true], ['16', true], ['17', false]])
  })

  it('counts an hour the game only partly overlaps', () => {
    const cells = pickForecastHours(series, '2026-11-05T15:30:00Z', 60)
    expect(cells.map(c => [c.t.slice(11, 13), c.inGame])).toEqual([['14', false], ['15', true], ['16', true]])
  })

  it('defaults to a 2-hour game', () => {
    expect(pickForecastHours(series, '2026-11-05T15:00:00Z', null).filter(c => c.inGame)).toHaveLength(2)
  })

  it('works across midnight (NWS local offsets)', () => {
    const night = ['2026-07-10T22:00:00-05:00', '2026-07-10T23:00:00-05:00', '2026-07-11T00:00:00-05:00', '2026-07-11T01:00:00-05:00', '2026-07-11T02:00:00-05:00']
      .map(t => hour(t))
    // 23:00 CDT = 04:00Z the next day
    const cells = pickForecastHours(night, '2026-07-11T04:00:00Z', 120)
    expect(cells.map(c => [c.t, c.inGame])).toEqual([
      ['2026-07-10T22:00:00-05:00', false],
      ['2026-07-10T23:00:00-05:00', true],
      ['2026-07-11T00:00:00-05:00', true],
      ['2026-07-11T01:00:00-05:00', false],
    ])
  })

  it('works across the fall-back DST change (two 1 AM hours)', () => {
    const dst = ['2026-11-01T00:00:00-05:00', '2026-11-01T01:00:00-05:00', '2026-11-01T01:00:00-06:00', '2026-11-01T02:00:00-06:00', '2026-11-01T03:00:00-06:00']
      .map(t => hour(t))
    // 1:00 CDT = 06:00Z, two hours = until 08:00Z (02:00 CST)
    const cells = pickForecastHours(dst, '2026-11-01T06:00:00Z', 120)
    expect(cells.map(c => [c.t, c.inGame])).toEqual([
      ['2026-11-01T00:00:00-05:00', false],
      ['2026-11-01T01:00:00-05:00', true],
      ['2026-11-01T01:00:00-06:00', true],
      ['2026-11-01T02:00:00-06:00', false],
    ])
  })

  it('is empty when the forecast does not reach the game', () => {
    expect(pickForecastHours(series, '2026-11-09T15:00:00Z', 120)).toEqual([])
  })
})

describe('heatIndexF (NWS heat index chart)', () => {
  // Values from the NWS heat index chart (https://www.weather.gov/safety/heat-index), ±1°F.
  it.each([
    [80, 40, 80],
    [90, 50, 95],
    [96, 40, 101],
    [100, 40, 109],
    [94, 60, 110],
    [86, 90, 105],
  ])('%i°F at %i%% → %i', (t, rh, expected) => {
    expect(Math.abs(heatIndexF(t, rh) - expected)).toBeLessThanOrEqual(1)
  })

  it('uses the simple formula when it is cool', () => {
    expect(heatIndexF(70, 50)).toBeCloseTo(0.5 * (70 + 61 + 2 * 1.2 + 50 * 0.094), 5)
  })

  it('applies the dry-air adjustment', () => {
    expect(heatIndexF(100, 10)).toBeLessThan(100)
  })
})

describe('forecastEmoji', () => {
  it('maps NWS icon codes', () => {
    expect(forecastEmoji('day/skc')).toBe('☀️')
    expect(forecastEmoji('night/skc')).toBe('🌙')
    expect(forecastEmoji('day/rain')).toBe('🌧')
    expect(forecastEmoji('day/whatever')).toBe('🌡')
    expect(forecastEmoji('')).toBe('🌡')
  })
})

describe('forecastSummary', () => {
  const at = (i: number, f: Partial<ForecastHour> = {}) => ({ ...hour(`2026-11-05T1${i}:00:00Z`, f), inGame: true })

  it('is quiet grey with the icon and the first game hour temperature', () => {
    const s = forecastSummary([{ ...at(4, { tempF: 60 }), inGame: false }, at(5, { tempF: 78 }), at(6, { tempF: 80, windMph: 9 })])!
    expect(s.tone).toBe('neutral')
    expect(s.chipLabel).toBe('☀️ 78°')
    expect(s.headline).toBe('Sunny')
    expect(s.detail).toBe('78–80°F · wind 9 mph · 10% chance of rain')
    expect(s.a11yLabel).toBe('Forecast: sunny, 78 degrees')
  })

  it(`warns about rain at ${FORECAST_RAIN_WARN_POP}% or more`, () => {
    expect(forecastSummary([at(5, { pop: FORECAST_RAIN_WARN_POP - 1 })])!.tone).toBe('neutral')
    const s = forecastSummary([at(5, { pop: 40, tempF: 64 }), at(6, { pop: 70, tempF: 64, windMph: 12 })])!
    expect(s.tone).toBe('rain')
    expect(s.chipLabel).toBe('🌧 70% rain')
    expect(s.headline).toBe('Rain likely during the game')
    expect(s.detail).toBe('64°F · wind 12 mph · 70% chance of rain')
    expect(s.a11yLabel).toBe('Forecast: 70 percent chance of rain')
  })

  it(`warns about heat at a heat index of ${FORECAST_HEAT_WARN_F}°F or more, ahead of rain`, () => {
    const s = forecastSummary([at(5, { tempF: 93, rh: 40 }), at(6, { tempF: 96, rh: 40, pop: 50 })])!
    expect(s.tone).toBe('heat')
    expect(s.chipLabel).toBe('🔥 101°')
    expect(s.headline).toBe('Hot: feels like 101°F')
    expect(s.detail).toMatch(/Bring water and shade\.$/)
    expect(s.a11yLabel).toBe('Forecast: hot, feels like 101 degrees')
  })

  it('warns on dry heat whose heat index is under the air temperature', () => {
    expect(forecastSummary([at(5, { tempF: 99, rh: 5 })])!.chipLabel).toBe('🔥 99°')
  })

  it('stays neutral just under the heat threshold', () => {
    expect(forecastSummary([at(5, { tempF: 88, rh: 40 })])!.tone).toBe('neutral')
  })

  it('is null without hours', () => {
    expect(forecastSummary([])).toBeNull()
  })
})
