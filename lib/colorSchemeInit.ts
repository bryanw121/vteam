import { Appearance } from 'react-native'
import { resolveColorScheme } from '../constants/colorScheme'
import { readAppearancePref } from './appearanceStore'

// Runs before any other app module (entry.js imports it first), so
// constants/theme.ts sees the scheme when it builds its colours. Every
// StyleSheet reads those colours once, so a change applies on the next launch.
const pref = readAppearancePref()
;(globalThis as { __vteamColorScheme?: string }).__vteamColorScheme =
  resolveColorScheme(pref, Appearance.getColorScheme())
// A fixed choice also sets the system parts (pickers, keyboard, alerts) to match.
if (pref !== 'system') {
  try { Appearance.setColorScheme(pref) } catch {}
}
