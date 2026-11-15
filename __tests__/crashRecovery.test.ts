jest.mock('react-native', () => ({
  Platform: { OS: 'web' },
  AppState: { addEventListener: () => ({ remove: () => {} }) },
  Dimensions: { get: () => ({ width: 390, height: 844 }) },
}))
jest.mock('expo-router', () => ({ useFocusEffect: () => {} }))
jest.mock('expo-constants', () => ({ expoConfig: { version: '1.4.0' } }))
jest.mock('../lib/supabase', () => ({ supabase: { from: () => ({ insert: async () => ({ error: null }) }) } }))

import { __resetQueryCache, getQueryData, setQueryData } from '../lib/query'
import { __resetQuerySnapshot, startQuerySnapshot } from '../lib/querySnapshot'
import { __resetCrashRecovery, isSafeStart, noteCrash, prepareCrashReport, recoverFromCrash, takeCrashReport } from '../lib/crashRecovery'
import { CRASH_REPEAT_MS, SAFE_START_MS, crashAttemptAfter, crashedRecently, crashReportTime, parseCrashMarker, parseCrashReport } from '../utils/crashRecovery'

const local = new Map<string, string>()
const tab = new Map<string, string>()
const stub = (m: Map<string, string>) => ({
  getItem: (k: string) => m.get(k) ?? null,
  setItem: (k: string, v: string) => { m.set(k, v) },
  removeItem: (k: string) => { m.delete(k) },
})
;(globalThis as unknown as { window: unknown }).window = { localStorage: stub(local), sessionStorage: stub(tab) }

const NOW = Date.UTC(2026, 10, 15, 18, 0)

beforeEach(() => {
  jest.useFakeTimers()
  jest.setSystemTime(NOW)
  local.clear()
  tab.clear()
  __resetQueryCache()
  __resetQuerySnapshot()
  __resetCrashRecovery()
})
afterEach(() => jest.useRealTimers())

describe('pure rules', () => {
  it('counts a crash within 30 s of a recovery as a repeat, the same crash seen twice once, anything later as a first', () => {
    const prev = { at: NOW, count: 1, screen: 'profile', recovered: true }
    expect(crashAttemptAfter(null, NOW)).toEqual({ attempt: 1, duplicate: false })
    expect(crashAttemptAfter(prev, NOW + 5_000)).toEqual({ attempt: 2, duplicate: false })
    expect(crashAttemptAfter({ ...prev, recovered: false }, NOW + 5_000)).toEqual({ attempt: 1, duplicate: true })
    expect(crashAttemptAfter({ ...prev, count: 2 }, NOW + CRASH_REPEAT_MS)).toEqual({ attempt: 3, duplicate: false })
    expect(crashAttemptAfter(prev, NOW + CRASH_REPEAT_MS + 1)).toEqual({ attempt: 1, duplicate: false })
    expect(crashAttemptAfter(prev, NOW - 1)).toEqual({ attempt: 1, duplicate: false })
  })

  it('starts safe for 10 minutes after a crash', () => {
    const m = { at: NOW, count: 1, screen: 'x' }
    expect(crashedRecently(null, NOW)).toBe(false)
    expect(crashedRecently(m, NOW + SAFE_START_MS - 1)).toBe(true)
    expect(crashedRecently(m, NOW + SAFE_START_MS)).toBe(false)
  })

  it('rejects stored values that are not a marker or a report', () => {
    expect(parseCrashMarker({ at: 'x', count: 1 })).toBeNull()
    expect(parseCrashMarker({ at: NOW, count: 0 })).toBeNull()
    expect(parseCrashMarker({ at: NOW, count: 2 })).toEqual({ at: NOW, count: 2, screen: 'unknown', recovered: false })
    expect(parseCrashReport({ screen: 'a', at: NOW, version: '1', platform: 'Fridge' })).toBeNull()
    expect(parseCrashReport({ screen: 'a', at: NOW, version: '1', platform: 'iOS' })).toEqual({ screen: 'a', at: NOW, version: '1', platform: 'iOS' })
  })

  it('writes the time in the club time zone', () => {
    expect(crashReportTime(NOW)).toBe('Nov 15, 12:00 PM CST')
  })
})

describe('on the device', () => {
  it('a crash after Try again within 30 s is the second; the same crash remounting is not; a later one starts over', () => {
    expect(noteCrash()).toBe(1)
    expect(noteCrash()).toBe(1) // remounted error screen, nothing tried yet
    recoverFromCrash()
    jest.setSystemTime(NOW + 10_000)
    expect(noteCrash()).toBe(2)
    jest.setSystemTime(NOW + 10_000 + CRASH_REPEAT_MS + 1)
    expect(noteCrash()).toBe(1)
  })

  it('recovering drops every cached read and both saved copies', () => {
    local.set('vteam.querySnapshot', '{}')
    local.set('vteam.feedSnapshot', '{}')
    setQueryData('badges:me', { bad: true })
    setQueryData('feed:2026-11', [])
    recoverFromCrash()
    expect(local.has('vteam.querySnapshot')).toBe(false)
    expect(local.has('vteam.feedSnapshot')).toBe(false)
    expect(getQueryData('badges:me')).toBeUndefined()
    expect(getQueryData('feed:2026-11')).toBeUndefined()
  })

  it('shortly after a crash the next open seeds nothing and forgets the old copy', () => {
    local.set('vteam.querySnapshot', JSON.stringify({ v: 2, savedAt: NOW, owner: 'u', entries: { 'badges:u': { bad: 1 } } }))
    noteCrash()
    expect(isSafeStart()).toBe(true)
    startQuerySnapshot({ seed: !isSafeStart() })
    expect(getQueryData('badges:u')).toBeUndefined()
    expect(local.has('vteam.querySnapshot')).toBe(false)
    jest.setSystemTime(NOW + SAFE_START_MS)
    expect(isSafeStart()).toBe(false)
  })

  it('hands the bug report prefill over once, across a page reload', () => {
    noteCrash()
    prepareCrashReport()
    const saved = tab.get('vteam.crashReport')
    expect(saved).toBeDefined()
    // A reload empties memory but keeps the tab's storage.
    __resetCrashRecovery()
    tab.set('vteam.crashReport', saved!)
    expect(takeCrashReport()).toEqual({ screen: 'unknown', at: NOW, version: '1.4.0', platform: 'Mobile web' })
    expect(takeCrashReport()).toBeNull()
  })
})
