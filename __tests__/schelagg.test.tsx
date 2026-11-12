import { act, renderHook } from '@testing-library/react-native'
import fixture from './fixtures/courts.json'
import { checkSession, decideSessionLink, describeNewTime, fetchCourts, isCourtsResponse } from '../lib/schelagg'
import { useOutsideSessionLink } from '../hooks/useOutsideSessionLink'
import { SCHELAGG_API_BASE, SCHELAGG_SITE_BASE } from '../constants'

jest.mock('../lib/openExternalUrl', () => ({ openExternalUrl: jest.fn(async () => true) }))
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { openExternalUrl } = require('../lib/openExternalUrl') as { openExternalUrl: jest.Mock }

const json = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body })

/** A fetch that never answers until aborted, like a hung server. */
const hangingFetch = (_url: string, init?: { signal?: AbortSignal }) => new Promise<never>((_, reject) => {
  init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))
})

describe('fetchCourts', () => {
  it('uses the live API first', async () => {
    const fetchImpl = jest.fn(async () => json(200, fixture))
    const data = await fetchCourts({ fetchImpl })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect((fetchImpl.mock.calls[0] as unknown[])[0]).toBe(`${SCHELAGG_API_BASE}/api/courts?days=7`)
    expect(data.source).toBe('live')
    expect(data.venues).toHaveLength(2)
  })

  it('falls back to the static file when the API errors or returns junk', async () => {
    for (const first of [json(500, {}), json(200, { nope: true })]) {
      const fetchImpl = jest.fn()
        .mockResolvedValueOnce(first)
        .mockResolvedValueOnce(json(200, fixture))
      const data = await fetchCourts({ fetchImpl })
      expect(fetchImpl.mock.calls[1][0]).toBe(`${SCHELAGG_SITE_BASE}/data/courts.json`)
      expect(data.source).toBe('static')
    }
  })

  it('falls back when the API hangs past the timeout, and throws when both fail', async () => {
    const fetchImpl = jest.fn()
      .mockImplementationOnce(hangingFetch)
      .mockResolvedValueOnce(json(200, fixture))
    await expect(fetchCourts({ fetchImpl, timeoutMs: 20 })).resolves.toMatchObject({ source: 'static' })
    const failing = jest.fn(async () => json(503, {}))
    await expect(fetchCourts({ fetchImpl: failing })).rejects.toThrow()
  })

  it('checks the shape', () => {
    expect(isCourtsResponse(fixture)).toBe(true)
    expect(isCourtsResponse({ from: 'today', fetchedAt: '', venues: [] })).toBe(false)
    expect(isCourtsResponse(null)).toBe(false)
  })
})

describe('checkSession', () => {
  it('asks /api/check for the id and returns a known status', async () => {
    const fetchImpl = jest.fn(async () => json(200, { id: 'reclub-VONMM8', status: 'scheduled' }))
    await expect(checkSession('volleyworld-2026-10-25-19:30-pflugerville', { fetchImpl })).resolves.toMatchObject({ status: 'scheduled' })
    expect((fetchImpl.mock.calls[0] as unknown[])[0]).toBe(
      `${SCHELAGG_API_BASE}/api/check?session=volleyworld-2026-10-25-19%3A30-pflugerville`,
    )
  })

  it('returns null (open as usual) for 400, 5xx, odd bodies, network errors and timeouts', async () => {
    await expect(checkSession('x-1', { fetchImpl: async () => json(400, { error: 'unknown session id' }) })).resolves.toBeNull()
    await expect(checkSession('x-1', { fetchImpl: async () => json(502, {}) })).resolves.toBeNull()
    await expect(checkSession('x-1', { fetchImpl: async () => json(200, { status: 'maybe' }) })).resolves.toBeNull()
    await expect(checkSession('x-1', { fetchImpl: async () => { throw new TypeError('Network request failed') } })).resolves.toBeNull()
    const started = Date.now()
    await expect(checkSession('x-1', { fetchImpl: hangingFetch, timeoutMs: 30 })).resolves.toBeNull()
    expect(Date.now() - started).toBeLessThan(1000)
  })
})

describe('decideSessionLink', () => {
  it('opens for scheduled, unknown and no answer', () => {
    expect(decideSessionLink(null)).toEqual({ action: 'open' })
    expect(decideSessionLink({ id: 'a', status: 'scheduled' })).toEqual({ action: 'open' })
    expect(decideSessionLink({ id: 'a', status: 'unknown' })).toEqual({ action: 'open' })
  })

  it('asks first for canceled and gone', () => {
    expect(decideSessionLink({ id: 'a', status: 'canceled' })).toEqual({ action: 'confirm', kind: 'canceled' })
    expect(decideSessionLink({ id: 'a', status: 'scheduled', occurrence: { canceled: true } })).toEqual({ action: 'confirm', kind: 'canceled' })
    expect(decideSessionLink({ id: 'a', status: 'gone' })).toEqual({ action: 'confirm', kind: 'gone' })
  })

  it('takes the new time from the occurrence', () => {
    expect(decideSessionLink({
      id: 'a', status: 'changed', changes: ['start'],
      occurrence: { starts_at: '2026-10-26T01:30:00.000Z', ends_at: '2026-10-26T03:00:00.000Z', signup_url: 'https://x.test/new' },
    })).toEqual({
      action: 'confirm', kind: 'changed', changes: ['start'],
      startsAt: '2026-10-26T01:30:00.000Z', endsAt: '2026-10-26T03:00:00.000Z', signupUrl: 'https://x.test/new',
    })
  })

  it('reads session.start/end (Austin local) when there is no occurrence — the live Volleyworld case', () => {
    const decision = decideSessionLink({
      id: 'volleyworld-2026-10-25-19:30-pflugerville',
      status: 'changed',
      changes: ['start', 'end'],
      session: {
        id: 'volleyworld-2026-10-25-20:30-pflugerville', date: '2026-10-25', start: '20:30', end: '22:00',
        timezone: 'America/Chicago', signup: { url: 'javascript:alert(1)' },
      },
      occurrence: null,
    })
    expect(decision).toMatchObject({
      kind: 'changed', startsAt: '2026-10-26T01:30:00.000Z', endsAt: '2026-10-26T03:00:00.000Z', signupUrl: null,
    })
    if (decision.action === 'confirm' && decision.kind === 'changed') {
      // Shown in the device's zone: 8:30pm in Austin (`npm test` runs in America/Chicago).
      const label = describeNewTime(decision.startsAt, decision.endsAt)
      if (process.env.TZ === 'America/Chicago') expect(label).toBe('Sun, Oct 25 · 8:30–10pm')
      else expect(label).toMatch(/^\w{3}, \w{3} \d{1,2} · /)
    }
  })

  it('handles a session that runs past midnight', () => {
    const decision = decideSessionLink({ id: 'a', status: 'changed', session: { date: '2026-10-25', start: '23:00', end: '01:00' } })
    expect(decision).toMatchObject({ startsAt: '2026-10-26T04:00:00.000Z', endsAt: '2026-10-26T06:00:00.000Z' })
  })

  it('describes a missing time as null', () => {
    expect(describeNewTime(null, null)).toBeNull()
    expect(describeNewTime('nope', null)).toBeNull()
  })
})

describe('useOutsideSessionLink', () => {
  const session = { id: 'reclub-VONMM8', signup_url: 'https://reclub.co/m/VONMM8' }
  const realFetch = global.fetch
  afterEach(() => {
    global.fetch = realFetch
    openExternalUrl.mockClear()
    openExternalUrl.mockImplementation(async () => true)
  })

  it('opens straight away when the check says scheduled', async () => {
    global.fetch = jest.fn(async () => json(200, { id: session.id, status: 'scheduled' })) as unknown as typeof fetch
    const { result } = renderHook(() => useOutsideSessionLink(session))
    await act(async () => { await result.current.open() })
    expect(openExternalUrl).toHaveBeenCalledWith(session.signup_url)
    expect(result.current.notice).toBeNull()
    expect(result.current.checking).toBe(false)
  })

  it('opens anyway when the check times out', async () => {
    jest.useFakeTimers()
    global.fetch = jest.fn(hangingFetch) as unknown as typeof fetch
    const { result } = renderHook(() => useOutsideSessionLink(session))
    let pending: Promise<void> = Promise.resolve()
    act(() => { pending = result.current.open() })
    expect(result.current.checking).toBe(true)
    await act(async () => {
      jest.advanceTimersByTime(1500)
      await pending
    })
    jest.useRealTimers()
    expect(openExternalUrl).toHaveBeenCalledWith(session.signup_url)
    expect(result.current.checking).toBe(false)
  })

  it('does not open a cancelled session until asked to', async () => {
    global.fetch = jest.fn(async () => json(200, { id: session.id, status: 'canceled' })) as unknown as typeof fetch
    const { result } = renderHook(() => useOutsideSessionLink(session))
    await act(async () => { await result.current.open() })
    expect(openExternalUrl).not.toHaveBeenCalled()
    expect(result.current.notice).toEqual({ action: 'confirm', kind: 'canceled' })
    expect(result.current.finding).toEqual({ action: 'confirm', kind: 'canceled' })
    await act(async () => { result.current.openAnyway() })
    expect(openExternalUrl).toHaveBeenCalledWith(session.signup_url)
    expect(result.current.notice).toBeNull()
  })

  it('continues to the moved session\'s new link', async () => {
    global.fetch = jest.fn(async () => json(200, {
      id: session.id, status: 'changed', changes: ['start'],
      occurrence: { starts_at: '2026-10-26T01:30:00.000Z', ends_at: null, signup_url: 'https://reclub.co/m/NEW' },
    })) as unknown as typeof fetch
    const { result } = renderHook(() => useOutsideSessionLink(session))
    await act(async () => { await result.current.open() })
    expect(result.current.notice).toMatchObject({ kind: 'changed' })
    await act(async () => { result.current.openAnyway() })
    expect(openExternalUrl).toHaveBeenCalledWith('https://reclub.co/m/NEW')
  })

  it('offers a fresh tap when the browser blocks the new tab', async () => {
    openExternalUrl.mockImplementation(async () => false)
    global.fetch = jest.fn(async () => json(200, { id: session.id, status: 'unknown' })) as unknown as typeof fetch
    const { result } = renderHook(() => useOutsideSessionLink(session))
    await act(async () => { await result.current.open() })
    expect(result.current.notice).toEqual({ action: 'confirm', kind: 'blocked' })
  })
})
