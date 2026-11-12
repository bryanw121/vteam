import { forwardRef } from 'react'
import { Platform, Text as RNText, TextInput as RNTextInput } from 'react-native'
import type { TextInputProps, TextProps } from 'react-native'
import { useTextScale } from '../../contexts/textScale'
import { MAX_TEXT_SCALE } from '../../constants/textSize'
import { scaleTextStyle, textScaleFor } from '../../utils/textScale'

const PLATFORM = Platform.OS === 'web' ? 'web' : 'native'
/** Web inputs below 16px make iOS Safari zoom the page on focus. */
const WEB_INPUT_MIN_FONT = 16

/**
 * The app's `Text` (#43). Use it instead of React Native's: it applies the text
 * size setting and the OS / browser text size to the style's own `fontSize` and
 * `lineHeight`.
 *
 * `maxFontSizeMultiplier` caps the *combined* scale (in-app × OS), not only the
 * OS part as in React Native. Default `MAX_TEXT_SCALE` (2×); pass
 * `TIGHT_TEXT_SCALE` for fixed-size UI (tab bar labels, pips).
 */
export const Text = forwardRef<RNText, TextProps>(function Text({ style, maxFontSizeMultiplier, ...rest }, ref) {
  const { appScale, osScale } = useTextScale()
  const { factor, maxFontSizeMultiplier: osCap } = textScaleFor(PLATFORM, appScale, osScale, maxFontSizeMultiplier ?? MAX_TEXT_SCALE)
  return (
    <RNText
      ref={ref}
      {...rest}
      style={scaleTextStyle(style, factor)}
      maxFontSizeMultiplier={PLATFORM === 'native' ? osCap : undefined}
    />
  )
})

/** The app's `TextInput`: scales like `Text`; web inputs never drop below 16px. */
export const TextInput = forwardRef<RNTextInput, TextInputProps>(function TextInput({ style, maxFontSizeMultiplier, ...rest }, ref) {
  const { appScale, osScale } = useTextScale()
  const { factor, maxFontSizeMultiplier: osCap } = textScaleFor(PLATFORM, appScale, osScale, maxFontSizeMultiplier ?? MAX_TEXT_SCALE)
  return (
    <RNTextInput
      ref={ref}
      {...rest}
      style={scaleTextStyle(style, factor, PLATFORM === 'web' ? WEB_INPUT_MIN_FONT : 0)}
      maxFontSizeMultiplier={PLATFORM === 'native' ? osCap : undefined}
    />
  )
})

/** A font size token scaled like `Text` would scale it, for non-`Text` consumers (SVG labels). */
export function useScaledFontSize(size: number, cap: number = MAX_TEXT_SCALE): number {
  const { appScale, osScale } = useTextScale()
  // SVG text ignores the OS font scale on native, so both parts go into the size.
  return Math.round(size * Math.min(appScale * osScale, cap) * 10) / 10
}

/** Instance types, so `useRef<TextInput>(null)` keeps working with these imports. */
export type Text = RNText
export type TextInput = RNTextInput
