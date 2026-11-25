import { TouchableOpacity, View } from 'react-native'
import { Text } from '../ui/Text'
import { Spinner } from '../ui/Spinner'
import { GoogleLogo } from '../GoogleLogo'
import { shared, theme } from '../../constants'
import type { AuthCtaProps, GoogleButtonProps } from '../../types'

/** The form's one big action: an ink pill ("Sign in", "Create account", "Send code"). */
export function AuthCta({ label, onPress, loading, disabled, testID }: AuthCtaProps) {
  const inactive = !!(disabled || loading)
  return (
    <TouchableOpacity
      style={[shared.authCta, inactive && shared.buttonDisabled]}
      onPress={onPress}
      disabled={inactive}
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: !!loading }}
    >
      {loading ? <Spinner color={theme.colors.background} label={label} /> : <Text style={shared.authCtaLabel}>{label}</Text>}
    </TouchableOpacity>
  )
}

export function GoogleButton({ loading, onPress, disabled }: GoogleButtonProps) {
  return (
    <TouchableOpacity style={shared.authGoogle} onPress={onPress} disabled={disabled || loading} accessibilityRole="button" testID="auth-google">
      {loading ? <Spinner size="small" color={theme.colors.subtext} /> : <GoogleLogo size={18} />}
      <Text style={shared.authGoogleLabel}>Continue with Google</Text>
    </TouchableOpacity>
  )
}

export function OrWithEmail() {
  return (
    <View style={shared.authOr}>
      <View style={shared.authOrLine} />
      <Text style={shared.authOrText}>or with email</Text>
      <View style={shared.authOrLine} />
    </View>
  )
}

/** A purple text link under the form ("Email me a sign-in code instead", "Back to sign in"). */
export function AuthLink({ label, onPress, testID }: { label: string; onPress: () => void; testID?: string }) {
  return (
    <TouchableOpacity style={shared.authTextLink} onPress={onPress} accessibilityRole="button" testID={testID}>
      <Text style={shared.authLinkText}>{label}</Text>
    </TouchableOpacity>
  )
}
