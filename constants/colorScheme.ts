/**
 * Light or dark (Settings → Display → Appearance). Kept free of React Native
 * imports: `constants/theme.ts`, which `api/` also imports, reads it.
 */
import type { AppearancePref, ColorScheme } from '../types'

export type { AppearancePref, ColorScheme }

export const APPEARANCE_OPTIONS: readonly { id: AppearancePref; label: string }[] = [
  { id: 'system', label: 'Match device' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
]

/** Device storage key (localStorage on web, a small file on native). */
export const APPEARANCE_STORAGE_KEY = 'vteam.appearance'

/** Page background per scheme, for the web document before the app loads (app/+html.tsx). */
export const DOCUMENT_BACKGROUND: Record<ColorScheme, string> = { light: '#F7F3FF', dark: '#140C24' }

export function parseAppearance(raw: unknown): AppearancePref {
  return raw === 'light' || raw === 'dark' ? raw : 'system'
}

export function resolveColorScheme(pref: AppearancePref, system: string | null | undefined): ColorScheme {
  if (pref === 'light' || pref === 'dark') return pref
  return system === 'dark' ? 'dark' : 'light'
}
