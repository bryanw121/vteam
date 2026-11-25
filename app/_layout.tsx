import { useEffect, useRef, useState } from 'react'
import { Animated, Image, Platform, View } from 'react-native'
import { Text } from '../components/ui/Text'
import { useFonts } from 'expo-font'
import {
  Outfit_400Regular,
  Outfit_500Medium,
  Outfit_600SemiBold,
  Outfit_700Bold,
  Outfit_800ExtraBold,
} from '@expo-google-fonts/outfit'
import { AppSplashContent } from '../components/splash/AppSplashContent'
import { useReducedMotion } from '../hooks/useReducedMotion'
import { SPLASH_FADE_MS, splashHoldMs } from '../utils/splash'
import { StatusBar } from 'expo-status-bar'
import { Stack, usePathname, useRouter, useSegments } from 'expo-router'
import Head from 'expo-router/head'
import { GestureRoot } from '../components/GestureRoot'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { SessionProvider, useSession } from '../contexts/session'
import { TextScaleProvider } from '../contexts/textScale'
import { isAppPath, routes, toRoute } from '../utils/routes'
import { isProtectedPath, returnPath, setPostSignInRedirect, takePostSignInRedirect } from '../utils/authGate'
import { recoveryLinkAtStart } from '../lib/supabase'
import { APP_NAME, theme, SWIPE_NAVIGATION } from '../constants'
import { colorScheme } from '../constants/theme'
import { initSentry, Sentry } from '../lib/sentry'
import { SentryErrorBoundary } from '../components/SentryErrorBoundary'
import { registerPushToken, subscribeToPushTaps } from '../utils/pushNotifications'
import { useMinVersion } from '../hooks/useMinVersion'
import { useCacheUserScope } from '../hooks/useCacheUserScope'
import { useMyProfile } from '../hooks/useMyProfile'
import { UpdateRequiredScreen } from '../components/UpdateRequiredScreen'
import { startQuerySnapshot } from '../lib/querySnapshot'
import { isSafeStart } from '../lib/crashRecovery'
import { noteScreen, screenPattern, setUsageUser, startUsageTracking } from '../lib/analytics'
import { startStaleBuildWatch } from '../lib/staleBuild'

initSentry()
// Last visit's profile / settings / chat list into the cache before the first render (web),
// unless the app crashed a few minutes ago: then nothing saved is trusted (#316).
startQuerySnapshot({ seed: !isSafeStart() })

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!
const AVATARS_BUCKET = 'avatars'

/**
 * Warms the signed-in user's avatar so the header and Profile don't pop it in.
 * The path comes from the own-profile query every screen shares (#224: this
 * used to be a second `profiles` read on every open). Its own component, so a
 * profile change re-renders only this, not the navigator.
 */
function AvatarPrefetch() {
  const path = useMyProfile().profile?.avatar_url
  useEffect(() => {
    if (!path || /^https?:\/\//i.test(path)) return
    Image.prefetch(`${SUPABASE_URL}/storage/v1/object/public/${AVATARS_BUCKET}/${path}`).catch(() => {})
  }, [path])
  return null
}

/** When this launch's splash went up: navigation start on web (the splash is in the static HTML), module load on native. */
const SPLASH_SHOWN_AT = Platform.OS === 'web' && typeof performance !== 'undefined' ? 0 : Date.now()
const splashElapsed = () => (Platform.OS === 'web' && typeof performance !== 'undefined' ? performance.now() : Date.now() - SPLASH_SHOWN_AT)

function AppSplash({ opacity }: { opacity: Animated.Value }) {
  return (
    <Animated.View style={{ flex: 1, opacity }}>
      <AppSplashContent />
    </Animated.View>
  )
}

function RootLayout() {
  return (
    <SessionProvider>
      <TextScaleProvider>
        <RootNavigator />
      </TextScaleProvider>
    </SessionProvider>
  )
}

const NATIVE_FONTS = {
  Outfit_400Regular,
  Outfit_500Medium,
  Outfit_600SemiBold,
  Outfit_700Bold,
  Outfit_800ExtraBold,
}

function RootNavigator() {
  // Web registers the same families from small woff2 files in +html.tsx with
  // font-display: swap, so it never waits on fonts; native loads the bundled TTFs.
  const [nativeFontsLoaded] = useFonts(Platform.OS === 'web' ? {} : NATIVE_FONTS)
  const fontsLoaded = Platform.OS === 'web' || nativeFontsLoaded

  const { userId, loading } = useSession()
  useCacheUserScope()
  const updateRequirement = useMinVersion()
  const router = useRouter()
  const segments = useSegments()
  const pathname = usePathname()

  // Web: the static HTML is rendered at build time with no viewport, session,
  // clock or device storage, and much of the app branches on exactly those
  // (wide sidebar vs mobile shell via useIsNarrowWeb / useWindowDimensions,
  // guest vs signed-in, today's date, the saved feed snapshot). So the static
  // HTML and the first client render are the splash alone, which hydrates
  // cleanly, and the app tree mounts right after hydration (still under the
  // splash, with the snapshot already in the query cache). Native has nothing
  // to hydrate and mounts the tree at once.
  const [hydrated, setHydrated] = useState(Platform.OS !== 'web')
  useEffect(() => { setHydrated(true) }, [])

  const ready = fontsLoaded && !loading && hydrated
  const [splashVisible, setSplashVisible] = useState(true)
  const splashOpacity = useRef(new Animated.Value(1)).current

  // Data fetching starts as soon as the tree mounts (below the splash). The splash
  // waits for fonts + session restore, and at least one full bounce of the ball
  // (splashHoldMs), so a fast start shows the animation instead of a flicker.
  const reducedMotion = useReducedMotion()
  useEffect(() => {
    if (!ready || !splashVisible) return
    const timer = setTimeout(() => {
      Animated.timing(splashOpacity, { toValue: 0, duration: SPLASH_FADE_MS, useNativeDriver: true })
        .start(() => setSplashVisible(false))
    }, splashHoldMs(splashElapsed(), reducedMotion))
    return () => clearTimeout(timer)
  }, [ready, splashVisible, splashOpacity, reducedMotion])

  // Per-user setup whenever someone signs in (cold start with a session included).
  useEffect(() => {
    if (!userId) return
    void registerPushToken()
  }, [userId])

  // Tapping a push (any type, chat included) opens its deep link. Paths are
  // checked again here: only in-app paths reach the router. Waits for the
  // navigator and the restored session (so a cold-start tap isn't bounced to
  // login); the auth gate still applies to whatever opens.
  const navReady = hydrated && !loading
  useEffect(() => {
    if (!navReady) return
    return subscribeToPushTaps(path => {
      if (isAppPath(path)) router.push(toRoute(path))
    })
  }, [navReady]) // eslint-disable-line react-hooks/exhaustive-deps

  // Usage metrics: sessions and heartbeats once the signed-in user is known; a new session when
  // the account changes; the screen type for every route outside the tab pager (the tabs
  // layout records which tab is on show there).
  // A tab back after 10+ minutes hidden moves to a newer web build if one is live (#359).
  useEffect(() => {
    if (!navReady) return
    return startStaleBuildWatch()
  }, [navReady])
  useEffect(() => {
    if (!navReady) return
    startUsageTracking(userId)
    setUsageUser(userId)
  }, [navReady, userId])
  useEffect(() => {
    if (!navReady || (segments as string[]).includes('(main)')) return
    noteScreen(screenPattern(segments as string[]))
  }, [navReady, segments])

  // Keep Sentry user context in sync with auth state
  useEffect(() => {
    Sentry.setUser(userId ? { id: userId } : null)
  }, [userId])

  // A reset link that Auth sent to the Site URL instead of /reset-password
  // still ends on the form (#223). Once per page load.
  const recoveryRoutedRef = useRef(false)
  useEffect(() => {
    if (!navReady || recoveryRoutedRef.current || !recoveryLinkAtStart) return
    recoveryRoutedRef.current = true
    if ((segments as string[])[1] !== 'reset-password') router.replace(routes.resetPassword())
  }, [navReady]) // eslint-disable-line react-hooks/exhaustive-deps

  // Guests may browse; only account-only routes bounce to login. Signed-in users
  // leave the auth screens (except reset-password, where the recovery link
  // creates a session but the user still has to set a new password).
  const prevUserIdRef = useRef<string | null | undefined>(undefined)
  useEffect(() => {
    // Wait for the navigator to mount before redirecting.
    if (loading || !hydrated) return
    const justSignedOut = !!prevUserIdRef.current && !userId
    prevUserIdRef.current = userId
    const inAuthGroup = segments[0] === '(auth)'
    const onResetPassword = (segments as string[])[1] === 'reset-password'
    if (!userId && !inAuthGroup && isProtectedPath(pathname)) {
      if (justSignedOut) {
        // Signing out happens on an account page; carry on browsing as a guest
        // rather than parking the next sign-in on that page.
        router.replace(routes.app())
      } else {
        setPostSignInRedirect(returnPath(pathname))
        router.replace(routes.login())
      }
    } else if (userId && inAuthGroup && !onResetPassword) {
      router.replace(toRoute(takePostSignInRedirect() ?? routes.app()))
    }
  }, [userId, loading, hydrated, segments, pathname])

  return (
    <SentryErrorBoundary>
    <SafeAreaProvider>
    <GestureRoot style={{ flex: 1 }}>
      {/*
        Browser tab title. Outside the hydration gate on purpose: the static
        export renders it into every page's <title> (Expo Router's head manager
        otherwise leaves an empty one, which tabs show as "Untitled"), and the
        client renders the same string, so there is nothing to mismatch.
      */}
      {Platform.OS === 'web' && (
        <Head>
          <title>{APP_NAME}</title>
        </Head>
      )}
      {/* Status bar text: dark on the light theme, light on the dark one (native; no-op on web) */}
      {Platform.OS !== 'web' && <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />}
      {hydrated && (
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: theme.colors.background },
            headerTintColor: theme.colors.primaryText,
            headerShadowVisible: false,
            gestureEnabled: SWIPE_NAVIGATION.back,
          }}
        >
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
          <Stack.Screen name="(app)" options={{ headerShown: false }} />
          <Stack.Screen name="terms" options={{ headerShown: false, title: 'Terms and Conditions' }} />
          <Stack.Screen name="privacy" options={{ headerShown: false, title: 'Privacy Policy' }} />
          <Stack.Screen name="delete-account" options={{ headerShown: false, title: 'Delete your account' }} />
        </Stack>
      )}
      {hydrated && userId && <AvatarPrefetch />}

      {updateRequirement && !splashVisible && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
          <UpdateRequiredScreen requirement={updateRequirement} />
        </View>
      )}

      {splashVisible && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
          <AppSplash opacity={splashOpacity} />
        </View>
      )}
    </GestureRoot>
    </SafeAreaProvider>
    </SentryErrorBoundary>
  )
}

export default Sentry.wrap(RootLayout)
