import type { ViewStyle } from 'react-native'

/** The smallest tap target on a phone (Apple HIG / WCAG 2.5.5), in pt. */
export const TAP_MIN = 44

/**
 * A touchable that reaches 44 pt tall around a control drawn `drawn` pt tall (#386):
 * the padding is the extra tappable room and the equal negative margin gives it back,
 * so neither the look nor the layout changes. `hitSlop` does nothing on the web.
 * Put the drawn control (background, border, radius) on a child View.
 */
export function hitV(drawn: number): ViewStyle {
  const p = Math.max(0, (TAP_MIN - drawn) / 2)
  return p ? { paddingVertical: p, marginVertical: -p } : {}
}

/** The same in both directions, for a small square control (an icon, a send button). */
export function hitSquare(drawn: number): ViewStyle {
  const p = Math.max(0, (TAP_MIN - drawn) / 2)
  return p ? { padding: p, margin: -p } : {}
}
