import { useEffect } from 'react'
import { TouchableOpacity, View } from 'react-native'
import { Text } from './ui/Text'
import { shared } from '../constants'
import { hitV } from '../utils/hitArea'
import { useGoToSignIn } from '../hooks/useRequireSignIn'
import { preloadAuthScreens } from '../lib/authPrefetch'

/** 44-pt tap target around the 38-pt pill (#388). */
const HIT = hitV(38)

/** Top-right header action for guests; takes the place of the notifications bell. */
export function SignInButton() {
  const goToSignIn = useGoToSignIn()
  // So the tap opens the sign-in screen at once instead of an empty page while it downloads (web).
  useEffect(preloadAuthScreens, [])
  return (
    <TouchableOpacity
      onPress={() => goToSignIn('login')}
      style={HIT}
      accessibilityRole="button"
      accessibilityLabel="Sign in or sign up"
      hitSlop={6}
      testID="header-sign-in"
    >
      <View style={shared.signInButton}>
        <Text style={shared.signInButtonLabel}>Sign in</Text>
      </View>
    </TouchableOpacity>
  )
}
