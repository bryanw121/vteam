import { ActivityIndicator } from 'react-native'
import type { SpinnerProps } from '../../types'

/**
 * The app's only `ActivityIndicator`. React Native Web renders a spinner as
 * `role="progressbar"`, which needs a name (axe `aria-progressbar-name`), and
 * VoiceOver/TalkBack read the same label on native. Use it everywhere instead
 * of importing `ActivityIndicator` (`__tests__/spinnerLabel.test.ts` checks).
 */
export function Spinner({ label = 'Loading', accessibilityLabel, ...rest }: SpinnerProps) {
  return <ActivityIndicator accessibilityLabel={accessibilityLabel ?? label} {...rest} />
}
