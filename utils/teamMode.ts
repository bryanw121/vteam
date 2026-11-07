import { Platform } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { TeamMode } from '../types'

/**
 * The host's last team-builder mode (#149), remembered per device: read
 * synchronously from localStorage on web, loaded from AsyncStorage on native.
 * Every access is guarded; without storage it is simply not remembered.
 */
const STORAGE_KEY = 'vteam.teamMode'

export function parseTeamMode(raw: string | null | undefined): TeamMode {
  return raw === 'balanced' ? 'balanced' : 'random'
}

function webStorage(): Storage | null {
  if (Platform.OS !== 'web') return null
  try {
    return typeof window !== 'undefined' ? window.localStorage : null
  } catch {
    return null
  }
}

/** The saved mode if known without waiting (web), else null. */
export function teamModeNow(): TeamMode | null {
  const store = webStorage()
  if (!store) return Platform.OS === 'web' ? 'random' : null
  try { return parseTeamMode(store.getItem(STORAGE_KEY)) } catch { return 'random' }
}

/** The saved mode; on native, from AsyncStorage. Never rejects. */
export async function loadTeamMode(): Promise<TeamMode> {
  const now = teamModeNow()
  if (now) return now
  try { return parseTeamMode(await AsyncStorage.getItem(STORAGE_KEY)) } catch { return 'random' }
}

/** Remember the mode. Fire-and-forget. */
export function saveTeamMode(mode: TeamMode): void {
  const store = webStorage()
  if (store) {
    try { store.setItem(STORAGE_KEY, mode) } catch { /* not remembered */ }
    return
  }
  if (Platform.OS !== 'web') void AsyncStorage.setItem(STORAGE_KEY, mode).catch(() => {})
}
