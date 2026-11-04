/**
 * `api/forecast.ts` + `api/_lib/forecast.ts` (#165): the Edge proxy in front of
 * the National Weather Service. NWS is mocked; nothing hits the network.
 */
import handler from '../api/forecast'
import { fetchNwsForecast, nwsUserAgent, parseCourt, parseIcon, parseWindMph, trimForecast, NWS_TIMEOUT_MS } from '../api/_lib/forecast'
import { FORECAST_CACHE_CONTROL, FORECAST_EMPTY_CACHE_CONTROL } from '../constants/weather'

const POINTS = {
  properties: { forecastHourly: 'https://api.weather.gov/gridpoints/EWX/156,91/forecast/hourly' },
}
const period = (i: number, f: Record<string, unknown> = {}) => ({
  number: i + 1,
  startTime: `2026-11-05T${String(9 + i).padStart(2, '0')}:00:00-06:00`,
  endTime: `2026-11-05T${String(10 + i).padStart(2, '0')}:00:00-06:00`,
  isDaytime: true,
  temperature: 63 + i,
  temperatureUnit: 'F',
  probabilityOfPrecipitation: { unitCode: 'wmoUnit:percent', value: 40 + 10 * i },
  dewpoint: { unitCode: 'wmoUnit:degC', value: 12 },
  relativeHumidity: { unitCode: 'wmoUnit:percent', value: 80 },
  windSpeed: i === 1 ? '10 to 12 mph' : '8 mph',
  windDirection: 'S',
  icon: 'https://api.weather.gov/icons/land/day/rain_showers,40?size=small',
  shortForecast: 'Chance Rain Showers',
  detailedForecast: '',
  ...f,
})
const HOURLY = {
  type: 'Feature',
  properties: { updateTime: '2026-11-04T21:40:00+00:00', generatedAt: '2026-11-04T22:00:00+00:00', units: 'us', periods: [period(0), period(1), period(2)] },
}

type Reply = { status: number; body?: unknown } | 'hang' | 'throw'
let calls: { url: string; headers: Record<string, string> }[]

function mockNws(points: Reply, hourly: Reply = { status: 200, body: HOURLY }) {
  calls = []
  const reply = (r: Reply, init?: RequestInit) => {
    if (r === 'throw') return Promise.reject(new TypeError('fetch failed'))
    if (r === 'hang') {
      return new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))
      })
    }
    return Promise.resolve(new Response(r.body === undefined ? null : JSON.stringify(r.body), { status: r.status }))
  }
  const fetchMock = jest.fn((url: string, init?: RequestInit) => {
    calls.push({ url, headers: (init?.headers ?? {}) as Record<string, string> })
    return reply(url.includes('/points/') ? points : hourly, init)
  })
  global.fetch = fetchMock as unknown as typeof fetch
  return fetchMock
}

const get = (qs: string, method = 'GET') =>
  handler({ method, url: `https://vteamvolleyball.com/api/forecast${qs}` } as Request)

const realFetch = global.fetch
afterEach(() => {
  global.fetch = realFetch
  delete process.env.NWS_CONTACT
  jest.useRealTimers()
})

describe('parseCourt', () => {
  it('validates and rounds to 2 decimals', () => {
    expect(parseCourt('30.26204', '-97.75196')).toEqual({ lat: 30.26, lng: -97.75 })
    expect(parseCourt('30.265', '-97.7')).toEqual({ lat: 30.27, lng: -97.7 })
  })
  it.each([[null, '1'], ['1', null], ['', '1'], ['abc', '1'], ['91', '0'], ['0', '-181'], ['NaN', '1'], ['Infinity', '1']])('rejects lat=%s lng=%s', (lat, lng) => {
    expect(parseCourt(lat, lng)).toBeNull()
  })
})

describe('parsers', () => {
  it('reads wind ranges as their top', () => {
    expect(parseWindMph('5 mph')).toBe(5)
    expect(parseWindMph('10 to 15 mph')).toBe(15)
    expect(parseWindMph(undefined)).toBe(0)
  })
  it('keeps the condition from an icon URL', () => {
    expect(parseIcon('https://api.weather.gov/icons/land/night/tsra_hi,20?size=small')).toBe('night/tsra_hi')
    expect(parseIcon('https://api.weather.gov/icons/land/day/rain_showers,40/tsra,60?size=small')).toBe('day/rain_showers')
    expect(parseIcon(null)).toBe('')
  })
  it('identifies vteam with the NWS_CONTACT contact', () => {
    expect(nwsUserAgent({ NWS_CONTACT: 'ops@example.com' })).toBe('vteam (vteamvolleyball.com, ops@example.com)')
    expect(nwsUserAgent({})).toBe('vteam (vteamvolleyball.com)')
  })
})

describe('trimForecast', () => {
  it('keeps only what the app draws', () => {
    expect(trimForecast(HOURLY)).toEqual({
      updatedAt: '2026-11-04T21:40:00+00:00',
      hours: [
        { t: '2026-11-05T09:00:00-06:00', tempF: 63, pop: 40, windMph: 8, short: 'Chance Rain Showers', icon: 'day/rain_showers', rh: 80 },
        { t: '2026-11-05T10:00:00-06:00', tempF: 64, pop: 50, windMph: 12, short: 'Chance Rain Showers', icon: 'day/rain_showers', rh: 80 },
        { t: '2026-11-05T11:00:00-06:00', tempF: 65, pop: 60, windMph: 8, short: 'Chance Rain Showers', icon: 'day/rain_showers', rh: 80 },
      ],
    })
  })
  it('converts Celsius, treats a null chance of rain as 0 and drops broken periods', () => {
    const out = trimForecast({ properties: { periods: [period(0, { temperature: 30, temperatureUnit: 'C', probabilityOfPrecipitation: { value: null } }), { startTime: 'x' }, null] } })!
    expect(out.hours).toEqual([expect.objectContaining({ tempF: 86, pop: 0 })])
  })
  it('is null without periods', () => {
    expect(trimForecast({ properties: { periods: [] } })).toBeNull()
    expect(trimForecast({})).toBeNull()
    expect(trimForecast(null)).toBeNull()
  })
})

describe('GET /api/forecast', () => {
  it('calls /points then forecastHourly with the User-Agent, and caches 30 min on the CDN', async () => {
    process.env.NWS_CONTACT = 'ops@example.com'
    mockNws({ status: 200, body: POINTS })
    const res = await get('?lat=30.26204&lng=-97.75196')
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe(FORECAST_CACHE_CONTROL)
    expect(res.headers.get('content-type')).toMatch(/application\/json/)
    const body = await res.json()
    expect(body.updatedAt).toBe('2026-11-04T21:40:00+00:00')
    expect(body.hours).toHaveLength(3)
    expect(calls.map(c => c.url)).toEqual([
      'https://api.weather.gov/points/30.26,-97.75',
      'https://api.weather.gov/gridpoints/EWX/156,91/forecast/hourly',
    ])
    expect(calls[0].headers['User-Agent']).toBe('vteam (vteamvolleyball.com, ops@example.com)')
  })

  it('400 for bad coordinates, without calling NWS', async () => {
    const f = mockNws({ status: 200, body: POINTS })
    const res = await get('?lat=abc&lng=1')
    expect(res.status).toBe(400)
    expect(f).not.toHaveBeenCalled()
  })

  it.each([
    ['outside the US (points 404)', { status: 404, body: { title: 'Data Unavailable For Requested Point' } }, undefined],
    ['NWS 500 on points', { status: 500 }, undefined],
    ['NWS 500 on hourly', { status: 200, body: POINTS }, { status: 500 }],
    ['network error', 'throw', undefined],
    ['points without a forecastHourly link', { status: 200, body: { properties: {} } }, undefined],
    ['a forecastHourly link off NWS', { status: 200, body: { properties: { forecastHourly: 'https://evil.example/x' } } }, undefined],
  ] as [string, Reply, Reply | undefined][])('204 (cached 10 min) on %s', async (_label, points, hourly) => {
    mockNws(points, hourly)
    const res = await get('?lat=30.27&lng=-97.77')
    expect(res.status).toBe(204)
    expect(res.headers.get('cache-control')).toBe(FORECAST_EMPTY_CACHE_CONTROL)
    expect(calls.some(c => c.url.startsWith('https://evil.example'))).toBe(false)
  })

  it('204 when NWS times out', async () => {
    jest.useFakeTimers()
    mockNws('hang')
    const pending = get('?lat=30.27&lng=-97.77')
    await jest.advanceTimersByTimeAsync(NWS_TIMEOUT_MS + 1)
    expect((await pending).status).toBe(204)
  })

  it('405 for anything but GET / HEAD', async () => {
    mockNws({ status: 200, body: POINTS })
    expect((await get('?lat=30.27&lng=-97.77', 'POST')).status).toBe(405)
  })
})

describe('fetchNwsForecast', () => {
  it('returns null rather than throwing on garbage', async () => {
    mockNws({ status: 200, body: POINTS }, { status: 200, body: 'not geojson' })
    await expect(fetchNwsForecast({ lat: 30.27, lng: -97.77 }, global.fetch, {})).resolves.toBeNull()
  })
})
