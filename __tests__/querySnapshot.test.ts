jest.mock('react-native', () => ({ Platform: { OS: 'web' }, AppState: { addEventListener: () => ({ remove: () => {} }) } }))
jest.mock('expo-router', () => ({ useFocusEffect: () => {} }))

import { __resetQueryCache, getQueryData, setQueryData } from '../lib/query'
import {
  __resetQuerySnapshot,
  discardSeededSnapshot,
  isSnapshotKey,
  QUERY_SNAPSHOT_MAX_AGE_MS,
  readQuerySnapshot,
  setSnapshotOwner,
  snapshotOwner,
  snapshotValue,
  startQuerySnapshot,
  TOURNAMENT_LIST_SNAPSHOT_ROWS,
  usableQuerySnapshot,
} from '../lib/querySnapshot'

const KEY = 'vteam.querySnapshot'
const memory = new Map<string, string>()
const localStorageStub = {
  getItem: (k: string) => memory.get(k) ?? null,
  setItem: (k: string, v: string) => { memory.set(k, v) },
  removeItem: (k: string) => { memory.delete(k) },
}
;(globalThis as unknown as { window: unknown }).window = { localStorage: localStorageStub }

const NOW = Date.UTC(2026, 10, 6, 7, 0)
const save = (snap: unknown) => memory.set(KEY, JSON.stringify(snap))

beforeEach(() => {
  jest.useFakeTimers()
  jest.setSystemTime(NOW)
  memory.clear()
  __resetQueryCache()
  __resetQuerySnapshot()
})

afterEach(() => {
  jest.useRealTimers()
})

describe('usableQuerySnapshot', () => {
  const ok = { v: 1, savedAt: NOW - 1000, owner: 'u1', entries: { 'profile:me:u1': { id: 'u1' }, 'tags': ['a'] } }

  it('accepts a recent snapshot', () => {
    expect(usableQuerySnapshot(ok, NOW)).toEqual(ok)
  })

  it('rejects old, future, other-format or malformed snapshots', () => {
    expect(usableQuerySnapshot({ ...ok, savedAt: NOW - QUERY_SNAPSHOT_MAX_AGE_MS - 1 }, NOW)).toBeNull()
    expect(usableQuerySnapshot({ ...ok, savedAt: NOW + 3_600_000 }, NOW)).toBeNull()
    expect(usableQuerySnapshot({ ...ok, v: 2 }, NOW)).toBeNull()
    expect(usableQuerySnapshot({ ...ok, owner: 7 }, NOW)).toBeNull()
    expect(usableQuerySnapshot({ ...ok, entries: [] }, NOW)).toBeNull()
    expect(usableQuerySnapshot(null, NOW)).toBeNull()
  })

  it('keeps only keys under the snapshot prefixes', () => {
    const snap = usableQuerySnapshot({ ...ok, entries: { 'event:1': {}, 'feed:month:2026-11': [], 'points:balance:u1': 5 } }, NOW)
    expect(snap?.entries).toEqual({ 'points:balance:u1': 5 })
  })
})

describe('isSnapshotKey', () => {
  it('matches whole prefix segments only', () => {
    expect(isSnapshotKey('profile:me:u1')).toBe(true)
    expect(isSnapshotKey('tags')).toBe(true)
    expect(isSnapshotKey('profiles:x')).toBe(false)
    expect(isSnapshotKey('event:1')).toBe(false)
  })

  it("keeps the viewer's club tournament list, not tournament pages (#288)", () => {
    expect(isSnapshotKey('tournaments:list:u1')).toBe(true)
    expect(isSnapshotKey('tournament:t1')).toBe(false)
    expect(isSnapshotKey('tournaments:other:u1')).toBe(false)
  })
})

describe('snapshotValue', () => {
  it('trims the tournament list to its newest rows and leaves other entries alone', () => {
    const rows = Array.from({ length: 200 }, (_, i) => ({ id: `t${i}` }))
    const kept = snapshotValue('tournaments:list:u1', rows) as { id: string }[]
    expect(kept).toHaveLength(TOURNAMENT_LIST_SNAPSHOT_ROWS)
    expect(kept[0]).toEqual({ id: 't0' })
    expect(snapshotValue('badges:u1', rows)).toBe(rows)
  })

  it('saves the trimmed list for the viewer', () => {
    startQuerySnapshot()
    setSnapshotOwner('u1')
    setQueryData('tournaments:list:u1', Array.from({ length: 60 }, (_, i) => ({ id: `t${i}` })))
    jest.advanceTimersByTime(2000)
    expect(readQuerySnapshot()?.entries['tournaments:list:u1']).toHaveLength(TOURNAMENT_LIST_SNAPSHOT_ROWS)
  })
})

describe('startQuerySnapshot', () => {
  it('seeds the cache from the last visit and remembers whose it was', () => {
    save({ v: 1, savedAt: NOW - 60_000, owner: 'u1', entries: { 'points:balance:u1': 42 } })
    startQuerySnapshot()
    expect(getQueryData('points:balance:u1')).toBe(42)
    expect(snapshotOwner()).toBe('u1')
  })

  it('drops the seeded copy when someone else is signed in', () => {
    save({ v: 1, savedAt: NOW - 60_000, owner: 'u1', entries: { 'points:balance:u1': 42 } })
    startQuerySnapshot()
    discardSeededSnapshot()
    expect(getQueryData('points:balance:u1')).toBeUndefined()
    expect(snapshotOwner()).toBeUndefined()
  })

  it('saves fresh reads for the signed-in viewer, and nothing before the session is known', () => {
    startQuerySnapshot()
    setQueryData('badges:u2', [{ id: 'b' }])
    setQueryData('event:9', { id: 9 })
    jest.advanceTimersByTime(2000)
    expect(memory.has(KEY)).toBe(false)

    setSnapshotOwner('u2')
    jest.advanceTimersByTime(2000)
    expect(readQuerySnapshot()).toMatchObject({ owner: 'u2', entries: { 'badges:u2': [{ id: 'b' }] } })
    expect(readQuerySnapshot()?.entries).not.toHaveProperty('event:9')
  })

  it("forgets the previous viewer's copy when the viewer changes", () => {
    startQuerySnapshot()
    setSnapshotOwner('u2')
    setQueryData('badges:u2', [{ id: 'b' }])
    jest.advanceTimersByTime(2000)
    expect(memory.has(KEY)).toBe(true)

    setSnapshotOwner(null)
    expect(memory.has(KEY)).toBe(false)
    setQueryData('tags', ['x'])
    jest.advanceTimersByTime(2000)
    expect(readQuerySnapshot()).toMatchObject({ owner: null, entries: { tags: ['x'] } })
    expect(readQuerySnapshot()?.entries).not.toHaveProperty('badges:u2')
  })
})
