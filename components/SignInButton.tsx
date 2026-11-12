import { TouchableOpacity } from 'react-native'
import { Text } from './ui/Text'
import { shared } from '../constants'
import { useGoToSignIn } from '../hooks/useRequireSignIn'

/** Top-right header action for guests; takes the place of the notifications bell. */
export function SignInButton() {
  const goToSignIn = useGoToSignIn()
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
