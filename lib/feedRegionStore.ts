import { Platform } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { parseStoredRegion } from '../utils/feedRegion'
import type { FeedRegionId } from '../types/feedRegion'

/**
 * The city this device picked for outside games (the "Games around …" sheet or "Use my
 * location"), remembered on the device like the feed filters: web reads localStorage
 * synchronously, native loads AsyncStorage once in the background. Only the city id is kept,
 * never a location. Every access is guarded; storage that is missing or blocked means "no pick".
 */
const STORAGE_KEY = 'vteam.feedRegion'

let picked: FeedRegionId | null = null
let loaded = false
const listeners = new Set<() => void>()

function webStorage(): Storage | null {
  if (Platform.OS !== 'web') return null
  try {
    return typeof window !== 'undefined' ? window.localStorage : null
  } catch {
    return null
  }
}

function load(): void {
  if (loaded) return
  loaded = true
  const store = webStorage()
  if (store) {
    try { picked = parseStoredRegion(store.getItem(STORAGE_KEY)) } catch { picked = null }
    return
  }
  if (Platform.OS === 'web') return
  void AsyncStorage.getItem(STORAGE_KEY).then(raw => {
    // A pick made while this was loading wins over the stored one.
    if (picked) return
    picked = parseStoredRegion(raw)
    if (picked) listeners.forEach(l => l())
  }).catch(() => {})
}

/** The picked city, or null. Stable between changes (for useSyncExternalStore). */
export function pickedFeedRegion(): FeedRegionId | null {
  load()
  return picked
}

export function subscribeFeedRegion(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/** Remember a city on this device and tell every open screen. */
export function setPickedFeedRegion(region: FeedRegionId): void {
  load()
  if (picked === region) return
  picked = region
  const raw = JSON.stringify({ region })
  const store = webStorage()
  try {
    if (store) store.setItem(STORAGE_KEY, raw)
    else if (Platform.OS !== 'web') void AsyncStorage.setItem(STORAGE_KEY, raw).catch(() => {})
  } catch { /* private mode: the pick lasts for this visit */ }
  listeners.forEach(l => l())
}

/** Tests only. */
export function resetFeedRegionStoreForTests(): void {
  picked = null
  loaded = false
  listeners.clear()
}
