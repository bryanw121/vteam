import { useEffect } from 'react'
import { TouchableOpacity } from 'react-native'
import { Text } from './ui/Text'
import { shared } from '../constants'
import { useGoToSignIn } from '../hooks/useRequireSignIn'
import { preloadAuthScreens } from '../lib/authPrefetch'

/** Top-right header action for guests; takes the place of the notifications bell. */
export function SignInButton() {
  const goToSignIn = useGoToSignIn()
  // So the tap opens the sign-in screen at once instead of an empty page while it downloads (web).
  useEffect(preloadAuthScreens, [])
  return (
    <TouchableOpacity
      onPress={() => goToSignIn('login')}
      style={shared.signInButton}
      accessibilityRole="button"
      accessibilityLabel="Sign in or sign up"
      hitSlop={6}
      testID="header-sign-in"
    >
      <Text style={shared.signInButtonLabel}>Sign in</Text>
    </TouchableOpacity>
  )
}
