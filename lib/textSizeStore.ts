import { Platform } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { TEXT_SIZE_STORAGE_KEY } from '../constants/textSize'
import { parseTextSize } from '../utils/textScale'
import type { TextSizeId } from '../types'

// The text size lives on the device: localStorage on web, AsyncStorage on native.
// Every access is wrapped: storage can be missing or throw (private windows,
// blocked site data, previews), and then the app just uses Default.

function webStorage(): Storage | null {
  try { return typeof window !== 'undefined' ? window.localStorage : null } catch { return null }
}

export async function loadTextSize(): Promise<TextSizeId> {
  try {
    if (Platform.OS === 'web') return parseTextSize(webStorage()?.getItem(TEXT_SIZE_STORAGE_KEY))
    return parseTextSize(await AsyncStorage.getItem(TEXT_SIZE_STORAGE_KEY))
  } catch {
    return parseTextSize(null)
  }
}

/** Web only: the stored size, read synchronously (null on native or when unreadable). */
export function loadTextSizeSync(): TextSizeId | null {
  if (Platform.OS !== 'web') return null
  try { return parseTextSize(webStorage()?.getItem(TEXT_SIZE_STORAGE_KEY)) } catch { return null }
}

export async function saveTextSize(size: TextSizeId): Promise<void> {
  try {
    if (Platform.OS === 'web') { webStorage()?.setItem(TEXT_SIZE_STORAGE_KEY, size); return }
    await AsyncStorage.setItem(TEXT_SIZE_STORAGE_KEY, size)
  } catch {}
}
