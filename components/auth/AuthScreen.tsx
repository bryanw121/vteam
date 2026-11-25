import { ScrollView, TouchableOpacity, View, useWindowDimensions } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Text } from '../ui/Text'
import { VteamMark } from '../brand/VteamMark'
import { shared, theme } from '../../constants'
import { routes, toRoute } from '../../utils/routes'
import { takeGuestReturnPath } from '../../utils/authGate'
import type { AuthScreenProps, AuthTab } from '../../types'

/** Wide enough for the purple panel (480) beside the form (400). */
const PANEL_MIN_WIDTH = 1000

/**
 * The frame of every sign-in screen (Nov 2026 redesign): the app's own page,
 * not a gradient, so stepping in from a tab doesn't flash a different world.
 * Phones: ✕ (keep browsing) top-left, the mark, a heading and the form.
 * Wide web: a purple panel beside the form, and "Keep browsing" under it.
 */
export function AuthScreen({ heading, sub, tab, children }: AuthScreenProps) {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const wide = width >= PANEL_MIN_WIDTH
  const keepBrowsing = () => router.replace(toRoute(takeGuestReturnPath()))

  const form = (
    <View style={wide ? shared.authFormWide : shared.authForm}>
      <View style={wide ? shared.authIntroWide : shared.authIntro}>
        {!wide && <VteamMark size={56} />}
        <Text style={wide ? shared.authHeadingWide : shared.authHeading} accessibilityRole="header">{heading}</Text>
        <Text style={wide ? shared.authSubWide : shared.authSub}>{sub}</Text>
      </View>
      {tab && <AuthTabs tab={tab} />}
      {children}
      {wide && (
        <TouchableOpacity style={shared.authKeepBrowsing} onPress={keepBrowsing} testID="continue-as-guest" accessibilityRole="button">
          <Text style={shared.authLinkSubtle}>Keep browsing without an account</Text>
        </TouchableOpacity>
      )}
    </View>
  )

  return (
    <ScrollView
      style={shared.authPage}
      contentContainerStyle={[wide ? shared.authPageWide : shared.authPageNarrow, { paddingTop: insets.top + theme.spacing.md, paddingBottom: insets.bottom + theme.spacing.xl }]}
      keyboardShouldPersistTaps="handled"
    >
      {!wide && (
        <TouchableOpacity
          style={shared.authClose}
          onPress={keepBrowsing}
          accessibilityRole="button"
          accessibilityLabel="Close and keep browsing"
          testID="continue-as-guest"
        >
          <Ionicons name="close" size={22} color={theme.colors.text} />
        </TouchableOpacity>
      )}
      {wide ? (
        <View style={shared.authWideRow}>
          <AuthPanel />
          {form}
        </View>
      ) : form}
    </ScrollView>
  )
}

/** Sign in | Sign up. Each is its own route (/login, /register), so links and Back keep working. */
function AuthTabs({ tab }: { tab: AuthTab }) {
  const router = useRouter()
  const options: { key: AuthTab; label: string }[] = [
    { key: 'login', label: 'Sign in' },
    { key: 'register', label: 'Sign up' },
  ]
  return (
    <View style={shared.authTabs} role="tablist">
      {options.map(option => {
        const active = option.key === tab
        return (
          <TouchableOpacity
            key={option.key}
            role="tab"
            accessibilityState={{ selected: active }}
            style={[shared.authTab, active && shared.authTabActive]}
            onPress={() => { if (!active) router.replace(option.key === 'login' ? routes.login() : routes.register()) }}
            testID={`auth-mode-${option.key}`}
          >
            <Text style={[shared.authTabText, active && shared.authTabTextActive]}>{option.label}</Text>
          </TouchableOpacity>
        )
      })}
    </View>
  )
}

/** Wide web only: what vteam is, on the brand purple. */
function AuthPanel() {
  return (
    <View style={shared.authPanel}>
      <View pointerEvents="none" style={shared.authPanelRing} />
      <View pointerEvents="none" style={shared.authPanelDot} />
      <View style={shared.authPanelBrand}>
        <VteamMark size={48} inverted />
        <Text style={shared.authPanelWordmark}>vteam</Text>
      </View>
      <View>
        <Text style={shared.authPanelTitle}>Volleyball around Austin, in one place.</Text>
        <Text style={shared.authPanelBody}>Open play, tournaments and leagues. Save your spot, give cheers, earn points.</Text>
      </View>
    </View>
  )
}
