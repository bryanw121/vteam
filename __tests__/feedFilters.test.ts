import { Platform } from 'react-native'
import {
  __resetFeedFilters,
  DEFAULT_FEED_FILTERS,
  feedFiltersNow,
  loadFeedFilters,
  parseFeedFilters,
  saveFeedFilters,
} from '../utils/feedFilters'

const mockStore: Record<string, string> = {}
let mockGetItem = async (k: string): Promise<string | null> => mockStore[k] ?? null
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: (k: string) => mockGetItem(k),
    setItem: async (k: string, v: string) => { mockStore[k] = v },
  },
}))

const KEY = 'vteam.feedFilters'

/** The jest environment has no localStorage: a minimal one, swapped in for the web tests. */
const mockLocal: Record<string, string> = {}
const fakeLocalStorage = {
  getItem: jest.fn((k: string) => mockLocal[k] ?? null),
  setItem: jest.fn((k: string, v: string) => { mockLocal[k] = v }),
  clear: () => { for (const k of Object.keys(mockLocal)) delete mockLocal[k] },
}
Object.defineProperty(window, 'localStorage', { value: fakeLocalStorage, configurable: true })
const realOS = Platform.OS

beforeEach(() => {
  __resetFeedFilters()
  for (const k of Object.keys(mockStore)) delete mockStore[k]
  mockGetItem = async k => mockStore[k] ?? null
  Platform.OS = realOS
})
afterAll(() => { Platform.OS = realOS })

describe('parseFeedFilters', () => {
  it('reads a valid saved pair', () => {
    expect(parseFeedFilters(JSON.stringify({ filter: 'tournament', surface: 'sand' }))).toEqual({ filter: 'tournament', surface: 'sand' })
    expect(parseFeedFilters(JSON.stringify({ filter: 'open_play', surface: 'any' }))).toEqual({ filter: 'open_play', surface: 'any' })
  })

  it('drops values that no longer exist, field by field', () => {
    expect(parseFeedFilters(JSON.stringify({ filter: 'austin', surface: 'grass' }))).toEqual({ filter: 'all', surface: 'grass' })
    expect(parseFeedFilters(JSON.stringify({ filter: 'open_play', surface: 'beach' }))).toEqual({ filter: 'open_play', surface: 'any' })
  })

  it('falls back to defaults on missing or corrupt data', () => {
    for (const raw of [null, undefined, '', 'not json', '"all"', '[1]', 'null']) {
      expect(parseFeedFilters(raw)).toEqual(DEFAULT_FEED_FILTERS)
    }
  })
})

describe('removed chips', () => {
  it('drops a saved Mine or Not Full to All', () => {
    expect(parseFeedFilters(JSON.stringify({ filter: 'mine', surface: 'sand' }))).toEqual({ filter: 'all', surface: 'sand' })
    expect(parseFeedFilters(JSON.stringify({ filter: 'not_full', surface: 'indoor' }))).toEqual({ filter: 'all', surface: 'indoor' })
  })
})

describe('web (localStorage)', () => {
  beforeEach(() => {
    Platform.OS = 'web'
    window.localStorage.clear()
  })

  it('restores synchronously and round-trips a save', () => {
    window.localStorage.setItem(KEY, JSON.stringify({ filter: 'open_play', surface: 'indoor' }))
    expect(feedFiltersNow()).toEqual({ filter: 'open_play', surface: 'indoor' })
    saveFeedFilters({ filter: 'tournament', surface: 'any' })
    expect(JSON.parse(window.localStorage.getItem(KEY)!)).toEqual({ filter: 'tournament', surface: 'any' })
    __resetFeedFilters()
    expect(feedFiltersNow()).toEqual({ filter: 'tournament', surface: 'any' })
  })

  it('survives storage that throws', () => {
    fakeLocalStorage.getItem.mockImplementationOnce(() => { throw new Error('blocked') })
    fakeLocalStorage.setItem.mockImplementationOnce(() => { throw new Error('quota') })
    expect(feedFiltersNow()).toEqual(DEFAULT_FEED_FILTERS)
    expect(() => saveFeedFilters({ filter: 'all', surface: 'sand' })).not.toThrow()
  })
})

describe('native (AsyncStorage)', () => {
  beforeEach(() => { Platform.OS = 'ios' })

  it('is unknown until loaded, then cached', async () => {
    mockStore[KEY] = JSON.stringify({ filter: 'open_play', surface: 'grass' })
    expect(feedFiltersNow()).toBeNull()
    await expect(loadFeedFilters()).resolves.toEqual({ filter: 'open_play', surface: 'grass' })
    expect(feedFiltersNow()).toEqual({ filter: 'open_play', surface: 'grass' })
  })

  it('saves to AsyncStorage', async () => {
    saveFeedFilters({ filter: 'tournament', surface: 'sand' })
    await new Promise(r => setTimeout(r, 0))
    expect(JSON.parse(mockStore[KEY])).toEqual({ filter: 'tournament', surface: 'sand' })
  })

  it('resolves to defaults when AsyncStorage fails', async () => {
    mockGetItem = async () => { throw new Error('nope') }
    await expect(loadFeedFilters()).resolves.toEqual(DEFAULT_FEED_FILTERS)
  })

  it('keeps a choice made while the stored value was still loading', async () => {
    mockStore[KEY] = JSON.stringify({ filter: 'open_play', surface: 'grass' })
    const loaded = loadFeedFilters()
    saveFeedFilters({ filter: 'tournament', surface: 'any' })
    await expect(loaded).resolves.toEqual({ filter: 'tournament', surface: 'any' })
  })
})

describe('web without storage access', () => {
  it('uses defaults when window.localStorage itself throws', () => {
    Platform.OS = 'web'
    const desc = Object.getOwnPropertyDescriptor(window, 'localStorage')!
    Object.defineProperty(window, 'localStorage', { get: () => { throw new Error('SecurityError') }, configurable: true })
    try {
      expect(feedFiltersNow()).toEqual(DEFAULT_FEED_FILTERS)
      expect(() => saveFeedFilters({ filter: 'tournament', surface: 'any' })).not.toThrow()
    } finally {
      Object.defineProperty(window, 'localStorage', desc)
    }
  })
})
