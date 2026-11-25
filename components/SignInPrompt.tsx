import { View, useWindowDimensions } from 'react-native'
import { Text, useScaledFontSize } from './ui/Text'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Button } from './Button'
import { shared, theme } from '../constants'
import { useGoToSignIn } from '../hooks/useRequireSignIn'

type Props = {
  icon: keyof typeof Ionicons.glyphMap
  title: string
  body: string
  /** Optional extra link under the buttons (e.g. "Take the tour" on Profile). */
  extra?: { label: string; onPress: () => void; testID?: string }
}

const BODY_LINES = 3
const TOP_SHARE = 0.16

/** Shown in place of account-only tabs (Chat, Profile) while browsing as a guest. */
export function SignInPrompt({ icon, title, body, extra }: Props) {
  const goToSignIn = useGoToSignIn()
  // The body keeps room for three lines, so the buttons sit at the same height
  // on every tab whether its copy wraps to two lines or three.
  const bodyLines = useScaledFontSize(theme.font.lineHeight.tight) * BODY_LINES
  // Space above: a share of the window, not of the parent, which is a scrolling
  // page on some tabs (its height is its content's) and the screen on others.
  const { height } = useWindowDimensions()
  const top = Math.max(theme.spacing.xl, Math.round(height * TOP_SHARE))
  return (
    <View style={shared.signInPromptContainer} testID="sign-in-prompt">
      <View style={{ height: top }} />
      <View style={shared.signInPromptIcon}>
        <Ionicons name={icon} size={30} color={theme.colors.primaryText} />
      </View>
      <Text style={shared.signInPromptTitle} accessibilityRole="header">{title}</Text>
      <View style={{ minHeight: bodyLines, alignItems: 'center' }}>
        <Text style={shared.signInPromptBody}>{body}</Text>
      </View>
      <View style={shared.signInPromptActions} testID="sign-in-prompt-actions">
        <Button label="Sign in" onPress={() => goToSignIn('login')} />
        <Button label="Sign up" variant="secondary" onPress={() => goToSignIn('register')} />
        {extra && <Button label={extra.label} variant="ghost" icon="compass-outline" onPress={extra.onPress} testID={extra.testID} />}
      </View>
    </View>
  )
}
