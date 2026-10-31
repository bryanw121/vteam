import { useEffect, useRef, useState } from 'react'
import { Animated, Image, Platform, View } from 'react-native'
import { Text } from '../components/ui/Text'
import { useFonts } from 'expo-font'
import {
  SpaceGrotesk_400Regular,
  SpaceGrotesk_500Medium,
  SpaceGrotesk_600SemiBold,
  SpaceGrotesk_700Bold,
} from '@expo-google-fonts/space-grotesk'
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter'
import { LinearGradient } from 'expo-linear-gradient'
import { Stack, usePathname, useRouter, useSegments } from 'expo-router'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { SessionProvider, useSession } from '../contexts/session'
import { TextScaleProvider } from '../contexts/textScale'
import { isAppPath, routes, toRoute } from '../utils/routes'
import { isProtectedPath, setPostSignInRedirect, takePostSignInRedirect } from '../utils/authGate'
import { supabase } from '../lib/supabase'
import { theme, SWIPE_NAVIGATION } from '../constants'
import { initSentry, Sentry } from '../lib/sentry'
import { SentryErrorBoundary } from '../components/SentryErrorBoundary'
import { registerPushToken, subscribeToPushTaps } from '../utils/pushNotifications'
import { useMinVersion } from '../hooks/useMinVersion'
import { useCacheUserScope } from '../hooks/useCacheUserScope'
import { UpdateRequiredScreen } from '../components/UpdateRequiredScreen'

initSentry()

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!
const AVATARS_BUCKET = 'avatars'

async function prefetchUserAvatar() {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    const userId = session?.user?.id
    if (!userId) return
    const { data } = await supabase
      .from('profiles')
      .select('avatar_url')
      .eq('id', userId)
      .single()
    const path = data?.avatar_url
    if (!path || /^https?:\/\//i.test(path)) return
    const url = `${SUPABASE_URL}/storage/v1/object/public/${AVATARS_BUCKET}/${path}`
    await Image.prefetch(url)
  } catch {}
}

/** Fade-out only — the splash stays up exactly as long as fonts + auth take to load. */
const SPLASH_FADE_MS = 200

function AppSplash({ opacity }: { opacity: Animated.Value }) {
  return (
    <Animated.View style={{ flex: 1, opacity }}>
      <LinearGradient
        colors={theme.gradients.brand}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 }}
      >
        <Text style={{ fontSize: theme.font.heading.splash, fontWeight: '800', color: theme.colors.white, letterSpacing: -1 }}>vteam</Text>
        <View style={{ backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
          <Text style={{ fontSize: theme.font.size.xs, fontWeight: '700', color: theme.colors.white, letterSpacing: 1.5 }}>BETA</Text>
        </View>
      </LinearGradient>
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
  SpaceGrotesk_400Regular,
  SpaceGrotesk_500Medium,
  SpaceGrotesk_600SemiBold,
  SpaceGrotesk_700Bold,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
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

  // Data fetching starts as soon as the tree mounts (below the splash), so the
  // splash only covers font + session restore. No fixed minimum duration.
  useEffect(() => {
    if (!ready || !splashVisible) return
    Animated.timing(splashOpacity, { toValue: 0, duration: SPLASH_FADE_MS, useNativeDriver: true })
      .start(() => setSplashVisible(false))
  }, [ready, splashVisible, splashOpacity])

  // Per-user setup whenever someone signs in (cold start with a session included).
  useEffect(() => {
    if (!userId) return
    void prefetchUserAvatar()
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

  // Keep Sentry user context in sync with auth state
  useEffect(() => {
    Sentry.setUser(userId ? { id: userId } : null)
  }, [userId])

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
        setPostSignInRedirect(pathname)
        router.replace(routes.login())
      }
    } else if (userId && inAuthGroup && !onResetPassword) {
      router.replace(toRoute(takePostSignInRedirect() ?? routes.app()))
    }
  }, [userId, loading, hydrated, segments, pathname])

  return (
    <SentryErrorBoundary>
    <SafeAreaProvider>
    <GestureHandlerRootView style={{ flex: 1 }}>
      {hydrated && (
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: theme.colors.background },
            headerTintColor: theme.colors.primary,
            headerShadowVisible: false,
            gestureEnabled: SWIPE_NAVIGATION.back,
          }}
        >
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
          <Stack.Screen name="(app)" options={{ headerShown: false }} />
          <Stack.Screen name="terms" options={{ headerShown: false, title: 'Terms and Conditions' }} />
          <Stack.Screen name="privacy" options={{ headerShown: false, title: 'Privacy Policy' }} />
        </Stack>
      )}

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
    </GestureHandlerRootView>
    </SafeAreaProvider>
    </SentryErrorBoundary>
  )
}

export default Sentry.wrap(RootLayout)
