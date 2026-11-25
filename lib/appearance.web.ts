import { colorScheme } from '../constants/theme'
import { resolveColorScheme } from '../constants/colorScheme'
import type { AppearanceApplied, AppearancePref } from '../types'
import { writeAppearancePref } from './appearanceStore'

function systemScheme(): 'light' | 'dark' {
  try { return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light' } catch { return 'light' }
}

/** Saves the choice; when it changes what's on screen, reloads the page in the new scheme. */
export function applyAppearance(pref: AppearancePref): AppearanceApplied {
  writeAppearancePref(pref)
  if (resolveColorScheme(pref, systemScheme()) === colorScheme) return 'unchanged'
  try { window.location.reload() } catch {}
  return 'reloading'
}
