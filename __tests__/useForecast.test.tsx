/**
 * hooks/useForecast (#165): the feed asks the proxy once per distinct court,
 * reads coordinates in one query for the feed rows that lack them, and hides
 * the chip on any failure.
 */
import React from 'react'
import { Text } from 'react-native'
import { render, act } from '@testing-library/react-native'
import { __resetQueryCache } from '../lib/query'
import { fetchForecast, forecastUrl, useFeedForecasts, useForecast } from '../hooks/useForecast'
import type { EventWithDetails, Forecast, ForecastSummary } from '../types'

jest.mock('expo-router', () => ({ useFocusEffect: () => {} }))

let mockCoordCalls: string[][]
let mockCoordRows: { id: string; latitude: number | null; longitude: number | null }[]
jest.mock('../lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      if (table !== 'events') throw new Error(`unexpected table ${table}`)
      return {
        select: (cols: string) => {
          if (cols !== 'id, latitude, longitude') throw new Error(`unexpected select ${cols}`)
          return {
            in: (_col: string, ids: string[]) => {
              mockCoordCalls.push(ids)
              return Promise.resolve({ data: mockCoordRows.filter(r => ids.includes(r.id)), error: null })
            },
          }
        },
      }
    },
  },
}))

const NOW = Date.parse('2026-11-04T16:00:00Z')
const START = '2026-11-05T15:00:00'

const FORECAST: Forecast = {
  updatedAt: '2026-11-04T15:40:00Z',
  hours: [14, 15, 16, 17].map(h => ({ t: `2026-11-05T${h}:00:00Z`, tempF: 64, pop: h === 15 ? 70 : 20, windMph: 12, short: 'Rain Showers', icon: 'day/rain', rh: 80 })),
}

const ev = (id: string, f: Partial<EventWithDetails> = {}) =>
  ({ id, title: id, event_date: START, duration_minutes: 120, surface: 'sand', ...f }) as EventWithDetails

let fetchCalls: string[]
function mockProxy(reply: (url: string) => Response | Promise<Response>) {
  fetchCalls = []
  global.fetch = jest.fn((url: string) => {
    fetchCalls.push(url)
    return Promise.resolve(reply(url))
  }) as unknown as typeof fetch
}
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })

let result: Map<string, ForecastSummary>
function FeedProbe({ events }: { events: EventWithDetails[] }) {
  result = useFeedForecasts(events)
  return <Text>{result.size}</Text>
}

async function flush() {
  await act(async () => {
    for (let i = 0; i < 12; i++) await Promise.resolve()
  })
}

const realFetch = global.fetch
beforeEach(() => {
  __resetQueryCache()
  mockCoordCalls = []
  mockCoordRows = []
  jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] })
})
afterEach(() => {
  global.fetch = realFetch
  jest.useRealTimers()
})

describe('fetchForecast', () => {
  it('hits the proxy on the web origin with rounded coordinates', () => {
    expect(forecastUrl({ lat: 30.26, lng: -97.75 })).toMatch(/\/api\/forecast\?lat=30\.26&lng=-97\.75$/)
  })

  it('null on 204, non-JSON (a static host) or a network error', async () => {
    mockProxy(() => new Response(null, { status: 204 }))
    await expect(fetchForecast({ lat: 1, lng: 2 })).resolves.toBeNull()
    mockProxy(() => new Response('<!doctype html>', { status: 200, headers: { 'content-type': 'text/html' } }))
    await expect(fetchForecast({ lat: 1, lng: 2 })).resolves.toBeNull()
    global.fetch = jest.fn(() => Promise.reject(new TypeError('Failed to fetch'))) as unknown as typeof fetch
    await expect(fetchForecast({ lat: 1, lng: 2 })).resolves.toBeNull()
  })
})

describe('useFeedForecasts', () => {
  it('one request per distinct court, coordinates read in one query', async () => {
    mockProxy(() => json(FORECAST))
    mockCoordRows = [
      { id: 'a', latitude: 30.26204, longitude: -97.75196 },
      { id: 'b', latitude: 30.2649, longitude: -97.7501 }, // same court as a after rounding
      { id: 'c', latitude: 30.2669, longitude: -97.7729 },
      { id: 'd', latitude: null, longitude: null },
    ]
    const events = [
      ev('a'), ev('b'), ev('c'), ev('d'),
      ev('indoor', { surface: 'indoor' }),
      ev('far', { event_date: '2026-11-20T15:00:00' }),
      ev('cancelled', { cancelled_at: '2026-11-04T10:00:00Z' }),
    ]
    render(<FeedProbe events={events} />)
    await flush()
    expect(mockCoordCalls).toEqual([['a', 'b', 'c', 'd']])
    expect(fetchCalls.map(u => u.replace(/^.*\?/, '')).sort()).toEqual(['lat=30.26&lng=-97.75', 'lat=30.27&lng=-97.77'])
    expect([...result.keys()].sort()).toEqual(['a', 'b', 'c'])
    expect(result.get('a')).toMatchObject({ tone: 'rain', chipLabel: '🌧 70% rain' })
  })

  it('uses coordinates already on the row without a query', async () => {
    mockProxy(() => json(FORECAST))
    render(<FeedProbe events={[ev('a', { latitude: 30.26, longitude: -97.75 })]} />)
    await flush()
    expect(mockCoordCalls).toEqual([])
    expect(fetchCalls).toHaveLength(1)
    expect(result.has('a')).toBe(true)
  })

  it('no chips (and no error) when the proxy has nothing', async () => {
    mockProxy(() => new Response(null, { status: 204 }))
    render(<FeedProbe events={[ev('a', { latitude: 30.26, longitude: -97.75 })]} />)
    await flush()
    expect(result.size).toBe(0)
  })

  it('makes no request when nothing is outdoor', async () => {
    mockProxy(() => json(FORECAST))
    render(<FeedProbe events={[ev('x', { surface: 'indoor', latitude: 1, longitude: 1 })]} />)
    await flush()
    expect(fetchCalls).toEqual([])
    expect(mockCoordCalls).toEqual([])
  })

  it('shares the court cache with the event page', async () => {
    mockProxy(() => json(FORECAST))
    let detail: Forecast | null | undefined
    function DetailProbe() {
      detail = useForecast({ lat: 30.26, lng: -97.75 })
      return null
    }
    render(<><FeedProbe events={[ev('a', { latitude: 30.26, longitude: -97.75 })]} /><DetailProbe /></>)
    await flush()
    expect(fetchCalls).toHaveLength(1)
    expect(detail?.hours).toHaveLength(4)
  })
})
