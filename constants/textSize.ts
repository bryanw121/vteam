import type { TextSizeId, TextSizeOption } from '../types'

/** Settings → Display → Text size. Order is the order shown. */
export const TEXT_SIZE_OPTIONS: readonly TextSizeOption[] = [
  { id: 'small',   label: 'Small',       scale: 0.9 },
  { id: 'default', label: 'Default',     scale: 1 },
  { id: 'large',   label: 'Large',       scale: 1.15 },
  { id: 'xlarge',  label: 'Extra large', scale: 1.3 },
]

export const DEFAULT_TEXT_SIZE: TextSizeId = 'default'

/**
 * Cap on the combined text scale (in-app setting × OS or browser text size).
 * WCAG 1.4.4 asks for text that can reach 200%; past that most layouts break.
 */
export const MAX_TEXT_SCALE = 2

/**
 * Cap for text in fixed-size UI that has no room to grow: the tab bar and
 * sidebar labels, unread pips, the week strip's day letters. Pass it as
 * `maxFontSizeMultiplier` on `components/ui/Text`.
 */
export const TIGHT_TEXT_SCALE = 1.3

/**
 * Tighter cap for a row of seven cells on a small phone (the week strip's
 * dates), where even `TIGHT_TEXT_SCALE` would truncate two-digit numbers.
 */
export const COMPACT_TEXT_SCALE = 1.15

/** Device storage key (localStorage on web, AsyncStorage on native). */
export const TEXT_SIZE_STORAGE_KEY = 'vteam.textSize'
