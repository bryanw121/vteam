import { APPEARANCE_STORAGE_KEY, parseAppearance } from '../constants/colorScheme'
import type { AppearancePref } from '../constants/colorScheme'

// Web: localStorage, read synchronously by lib/colorSchemeInit.web.ts before the app loads.

export function readAppearancePref(): AppearancePref {
  try { return parseAppearance(window.localStorage.getItem(APPEARANCE_STORAGE_KEY)) } catch { return parseAppearance(null) }
}

export function writeAppearancePref(pref: AppearancePref): void {
  try {
    if (pref === 'system') window.localStorage.removeItem(APPEARANCE_STORAGE_KEY)
    else window.localStorage.setItem(APPEARANCE_STORAGE_KEY, pref)
  } catch {}
}
