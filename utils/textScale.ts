import { StyleSheet } from 'react-native'
import type { StyleProp, TextStyle } from 'react-native'
import { DEFAULT_TEXT_SIZE, MAX_TEXT_SCALE, TEXT_SIZE_OPTIONS } from '../constants/textSize'
import type { TextSizeId } from '../types'

/** A stored value, or the default when it is missing or unknown. */
export function parseTextSize(raw: unknown): TextSizeId {
  return TEXT_SIZE_OPTIONS.some(o => o.id === raw) ? (raw as TextSizeId) : DEFAULT_TEXT_SIZE
}

export function textSizeScale(size: TextSizeId): number {
  return TEXT_SIZE_OPTIONS.find(o => o.id === size)?.scale ?? 1
}

/**
 * Browser text size as a multiplier: the root font size over the 16px default.
 * Chrome/Firefox "font size" settings change it; it is clamped to a sane range.
 */
export function browserTextScale(rootFontSizePx: number): number {
  if (!Number.isFinite(rootFontSizePx) || rootFontSizePx <= 0) return 1
  return Math.min(MAX_TEXT_SCALE, Math.max(0.75, rootFontSizePx / 16))
}

/**
 * How to render text for an in-app scale `app`, an OS/browser scale `os` and a
 * cap on their product.
 *
 * - Web: react-native-web emits fixed px, so the whole product goes into the
 *   font size: `factor = min(app × os, cap)`.
 * - Native: React Native multiplies by the OS scale itself (allowFontScaling),
 *   capped by `maxFontSizeMultiplier`. So the font size takes the in-app part and
 *   the OS part is capped to what is left: total = app × min(os, cap / app).
 */
export function textScaleFor(
  platform: 'web' | 'native',
  app: number,
  os: number,
  cap: number = MAX_TEXT_SCALE,
): { factor: number; maxFontSizeMultiplier: number } {
  if (platform === 'web') return { factor: Math.min(app * os, cap), maxFontSizeMultiplier: 0 }
  const factor = Math.min(app, cap)
  // RN reads a multiplier of exactly 1 as "no OS scaling"; below 1 means "no cap", so floor at 1.
  return { factor, maxFontSizeMultiplier: Math.max(1, cap / factor) }
}

const round = (n: number) => Math.round(n * 10) / 10

/**
 * The style with its own fontSize and lineHeight multiplied by `factor`, or the
 * same style when there is nothing to scale. Text without a fontSize inherits
 * its parent's (already scaled) size, so it is left alone. `minFontSize` keeps
 * a size at or above that floor if it started there (web inputs stay ≥16px so
 * iOS Safari doesn't zoom on focus).
 */
export function scaleTextStyle(
  style: StyleProp<TextStyle>,
  factor: number,
  minFontSize = 0,
): StyleProp<TextStyle> {
  if (factor === 1) return style
  const flat = StyleSheet.flatten(style) as TextStyle | undefined
  if (!flat) return style
  const patch: TextStyle = {}
  if (typeof flat.fontSize === 'number') {
    const scaled = round(flat.fontSize * factor)
    patch.fontSize = flat.fontSize >= minFontSize ? Math.max(scaled, minFontSize) : scaled
  }
  if (typeof flat.lineHeight === 'number') {
    const ratio = patch.fontSize !== undefined && typeof flat.fontSize === 'number' && flat.fontSize > 0
      ? patch.fontSize / flat.fontSize
      : factor
    patch.lineHeight = round(flat.lineHeight * ratio)
  }
  return Object.keys(patch).length ? [style, patch] : style
}
