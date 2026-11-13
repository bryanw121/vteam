import React from 'react'
import { act, fireEvent, render } from '@testing-library/react-native'
import {
  classifyRequest, DOWN_AFTER_SECOND_FAILURE_MS, HEALTHY, nextHealth, nextProbeDelay, offlineHealth,
  READ_TIMEOUT_MS, requestTimeoutMs, WRITE_TIMEOUT_MS,
} from '../utils/serverHealth'
import {
  __resetServerHealth, isServerDown, onServerRecovered, reportRequest, serverHealth, timedFetch, TIMEOUT_MESSAGE,
} from '../lib/serverHealth'
import { failedWriteMessage } from '../lib/toast'
import { GENERIC_ERROR_MESSAGE, NETWORK_ERROR_MESSAGE, SERVER_DOWN_COPY, SERVER_DOWN_MESSAGE } from '../constants/copy'
import { ServerStatusBar } from '../components/ServerStatusBar'
import { ScreenState } from '../components/ui/ScreenState'

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }))

const T0 = Date.UTC(2026, 10, 13, 0, 0)

beforeEach(() => {
  __resetServerHealth()
  jest.useFakeTimers()
  jest.setSystemTime(T0)
})
afterEach(() => {
  __resetServerHealth()
  jest.useRealTimers()
})

describe('utils/serverHealth (#289)', () => {
  it('classifies outcomes: timeouts and gateway errors are the server, 4xx is an answer', () => {
    expect(classifyRequest({ status: 200 })).toBe('ok')
    expect(classifyRequest({ status: 401 })).toBe('client')
    expect(classifyRequest({ status: 500 })).toBe('client')
    expect(classifyRequest({ status: 522 })).toBe('server')
    expect(classifyRequest({ status: 503 })).toBe('server')
    expect(classifyRequest({ status: null })).toBe('network')
    expect(classifyRequest({ status: null, timedOut: true })).toBe('timeout')
  })

  it('goes degraded on one failure, down on a second within a minute, ok on any answer', () => {
    const one = nextHealth(HEALTHY, 'timeout', T0)
    expect(one).toMatchObject({ status: 'degraded', cause: 'server', since: T0 })
    const two = nextHealth(one, 'server', T0 + 10_000)
    expect(two).toMatchObject({ status: 'down', cause: 'server', since: T0 })
    expect(nextHealth(two, 'timeout', T0 + 20_000)).toMatchObject({ status: 'down', since: T0 })
    expect(nextHealth(two, 'client', T0 + 30_000)).toBe(HEALTHY)
    expect(nextHealth(two, 'ok', T0 + 30_000)).toBe(HEALTHY)
  })

  it('a second failure long after the first starts over as degraded', () => {
    const one = nextHealth(HEALTHY, 'timeout', T0)
    expect(nextHealth(one, 'timeout', T0 + DOWN_AFTER_SECOND_FAILURE_MS + 1)).toMatchObject({ status: 'degraded', since: T0 + DOWN_AFTER_SECOND_FAILURE_MS + 1 })
  })

  it('network failures and going offline are the connection, not the server', () => {
    expect(nextHealth(nextHealth(HEALTHY, 'network', T0), 'network', T0 + 1)).toMatchObject({ status: 'down', cause: 'network' })
    expect(offlineHealth(HEALTHY, T0)).toMatchObject({ status: 'down', cause: 'network' })
  })

  it('backs the probe off from 15 s to 5 min', () => {
    expect([0, 1, 2, 3, 4, 9].map(nextProbeDelay)).toEqual([15_000, 30_000, 60_000, 120_000, 300_000, 300_000])
  })

  it('limits reads to 15 s, writes and token refreshes to 20 s, and never Storage uploads', () => {
    expect(requestTimeoutMs('https://x.supabase.co/rest/v1/events?select=id', 'GET')).toBe(READ_TIMEOUT_MS)
    expect(requestTimeoutMs('https://x.supabase.co/rest/v1/rpc/get_feed_span', 'POST')).toBe(WRITE_TIMEOUT_MS)
    expect(requestTimeoutMs('https://x.supabase.co/auth/v1/token?grant_type=refresh_token', 'POST')).toBe(WRITE_TIMEOUT_MS)
    expect(requestTimeoutMs('https://x.supabase.co/storage/v1/object/avatars/a.png', 'POST')).toBeNull()
    expect(requestTimeoutMs('https://x.supabase.co/storage/v1/object/public/avatars/a.png', 'GET')).toBe(READ_TIMEOUT_MS)
  })
})

describe('lib/serverHealth (#289)', () => {
  const realFetch = global.fetch
  afterEach(() => { global.fetch = realFetch })

  it('timedFetch gives up at the limit with TIMEOUT_MESSAGE and reports it', async () => {
    global.fetch = jest.fn((_input: unknown, init?: RequestInit) => new Promise<Response>((_, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))
    })) as unknown as typeof fetch
    const p = timedFetch('https://x.supabase.co/rest/v1/events', { method: 'GET' })
    const assertion = expect(p).rejects.toThrow(TIMEOUT_MESSAGE)
    await act(async () => { jest.advanceTimersByTime(READ_TIMEOUT_MS) })
    await assertion
    expect(serverHealth()).toMatchObject({ status: 'degraded', cause: 'server' })
  })

  it("the caller's own abort is not an outage", async () => {
    const controller = new AbortController()
    global.fetch = jest.fn((_input: unknown, init?: RequestInit) => new Promise<Response>((_, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))
    })) as unknown as typeof fetch
    const p = timedFetch('https://x.supabase.co/rest/v1/events', { method: 'GET', signal: controller.signal })
    controller.abort()
    await expect(p).rejects.toThrow('aborted')
    expect(serverHealth()).toBe(HEALTHY)
  })

  it('reports a gateway error and an answer', async () => {
    global.fetch = jest.fn(async () => ({ status: 522 }) as Response) as unknown as typeof fetch
    await timedFetch('https://x.supabase.co/rest/v1/events')
    await timedFetch('https://x.supabase.co/rest/v1/events')
    expect(isServerDown()).toBe(true)
    global.fetch = jest.fn(async () => ({ status: 200 }) as Response) as unknown as typeof fetch
    await timedFetch('https://x.supabase.co/rest/v1/events')
    expect(isServerDown()).toBe(false)
  })

  it('tells recovery listeners how long it was down', () => {
    const seen: [number, string | null][] = []
    onServerRecovered((ms, cause) => seen.push([ms, cause]))
    reportRequest('timeout')
    reportRequest('timeout')
    jest.setSystemTime(T0 + 90_000)
    reportRequest('ok')
    expect(seen).toEqual([[90_000, 'server']])
  })

  it('a failed write blames the server when it is the server, the connection when it is the connection', () => {
    expect(failedWriteMessage(new Error(TIMEOUT_MESSAGE))).toBe(SERVER_DOWN_MESSAGE)
    expect(failedWriteMessage(new Error('Failed to fetch'))).toBe(NETWORK_ERROR_MESSAGE)
    expect(failedWriteMessage({ message: 'duplicate key' })).toBe(GENERIC_ERROR_MESSAGE)
    reportRequest('server')
    expect(failedWriteMessage({ message: 'whatever' })).toBe(SERVER_DOWN_MESSAGE)
  })
})

describe('ServerStatusBar and ScreenState (#289)', () => {
  it('shows nothing while the server answers, and the bar with Retry once it is down', () => {
    const { queryByTestId, getByText } = render(<ServerStatusBar />)
    expect(queryByTestId('server-status-bar')).toBeNull()
    act(() => { reportRequest('timeout'); reportRequest('timeout') })
    expect(queryByTestId('server-status-bar')).not.toBeNull()
    expect(getByText(SERVER_DOWN_COPY.barTitle)).toBeTruthy()
    expect(getByText('Trying again in 15 s')).toBeTruthy()
    act(() => { reportRequest('ok') })
    expect(queryByTestId('server-status-bar')).toBeNull()
  })

  it('says offline when the connection is the problem', () => {
    const { getByText } = render(<ServerStatusBar />)
    act(() => { reportRequest('network'); reportRequest('network') })
    expect(getByText(SERVER_DOWN_COPY.barOffline)).toBeTruthy()
  })

  it('ScreenState replaces the generic error with the server-down state and Try again', () => {
    const onRetry = jest.fn()
    const { getByTestId, getByText, rerender } = render(<ScreenState error="Could not load." onRetry={onRetry} />)
    expect(getByTestId('screen-state-error')).toBeTruthy()
    act(() => { reportRequest('timeout'); reportRequest('timeout') })
    rerender(<ScreenState error="Could not load." onRetry={onRetry} />)
    expect(getByText(SERVER_DOWN_COPY.stateTitle)).toBeTruthy()
    fireEvent.press(getByText('Try again'))
    expect(onRetry).toHaveBeenCalled()
  })
})
