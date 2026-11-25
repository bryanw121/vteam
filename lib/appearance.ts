import { Appearance } from 'react-native'
import { colorScheme } from '../constants/theme'
import { resolveColorScheme } from '../constants/colorScheme'
import type { AppearanceApplied, AppearancePref } from '../types'
import { writeAppearancePref } from './appearanceStore'

/** Saves the choice. The native app reads it at startup, so a different scheme starts with the next launch. */
export function applyAppearance(pref: AppearancePref): AppearanceApplied {
  writeAppearancePref(pref)
  return resolveColorScheme(pref, Appearance.getColorScheme()) === colorScheme ? 'unchanged' : 'next-launch'
}
