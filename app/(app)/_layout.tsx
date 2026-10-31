import { useEffect, useRef, useState } from 'react'
import { Animated, Image, Platform, Pressable, View, TouchableOpacity } from 'react-native'
import { Text } from '../../components/ui/Text'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Stack, useRouter, usePathname } from 'expo-router'
import { theme, BADGE_DEFINITIONS, BREAKPOINTS, TABS, TIGHT_TEXT_SCALE, tabIndexFromPath, SWIPE_NAVIGATION } from '../../constants'
import type { CreateMenuOption } from '../../constants'
import { CreateMenuList } from '../../components/CreateMenuList'
import { WebNavContext } from '../../contexts/webNav'
import { SentryErrorBoundary } from '../../components/SentryErrorBoundary'
import { ChatUnreadProvider, useChatUnread } from '../../hooks/useChatUnread'
import { useIsNarrowWeb } from '../../hooks/useIsNarrowWeb'
import { useRequireSignIn } from '../../hooks/useRequireSignIn'
import { routes } from '../../utils/routes'
import { TourProvider } from '../../contexts/tour'
import { TourTarget } from '../../components/tour/TourTarget'
import { TOUR_TARGETS } from '../../constants'

// Collect every badge image URL defined in code and prefetch them so the
// badges screen renders instantly without a network loading flash.
const BADGE_IMAGE_URLS: string[] = BADGE_DEFINITIONS.flatMap(def => [
  ...(def.imageUri ? [def.imageUri] : []),
  ...(def.tierImageUris ? Object.values(def.tierImageUris) : []),
])

function SidebarToggleIcon({ color }: { color: string }) {
  return (
    <View style={{
      width: 18, height: 14,
      borderWidth: 1.5, borderColor: color,
      borderRadius: 3,
      flexDirection: 'row',
      overflow: 'hidden',
    }}>
      <View style={{ width: 5, borderRightWidth: 1.5, borderRightColor: color }} />
      <View style={{ flex: 1 }} />
    </View>
  )
}


export default function AppLayout() {
  // The unread subscription lives in one provider so it runs exactly once across
  // the sidebar (web) and the mobile tab bar (both read it via useChatUnread).
  return (
    <ChatUnreadProvider>
      {/* Tours draw their overlay above the sidebar and every screen. */}
      <TourProvider>
        <AppLayoutInner />
      </TourProvider>
    </ChatUnreadProvider>
  )
}

function AppLayoutInner() {
  const router = useRouter()
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const chatUnread = useChatUnread()

  useEffect(() => {
    if (Platform.OS === 'web') return
    BADGE_IMAGE_URLS.forEach(url => { void Image.prefetch(url) })
  }, [])
  const [fabOpen, setFabOpen] = useState(false)
  const fabAnim = useRef(new Animated.Value(0)).current
  const isNarrowWeb = useIsNarrowWeb(BREAKPOINTS.sidebar)
  const requireSignIn = useRequireSignIn()

  function goToTab(index: number) {
    router.replace(TABS[index].path)
  }

  // Anyone may open the menu ("Book a court" is public); creating on vteam asks guests to sign in (goCreate).
  function openFab() {
    setFabOpen(true)
    Animated.spring(fabAnim, { toValue: 1, useNativeDriver: true, tension: 120, friction: 8 }).start()
  }

  function closeFab() {
    Animated.timing(fabAnim, { toValue: 0, duration: 150, useNativeDriver: true }).start(() => setFabOpen(false))
  }

  function goCreate(option: CreateMenuOption) {
    closeFab()
    if (option.requiresAuth && !requireSignIn()) return
    setTimeout(() => router.push(option.path), 160)
  }

  const sidebarActive = tabIndexFromPath(pathname)

  // ── Web (wide): sidebar always visible ───────────────────────────────────
  if (Platform.OS === 'web' && !isNarrowWeb) {
    return (
      <WebNavContext.Provider value={{ activeTab: sidebarActive, goToTab }}>
        <SentryErrorBoundary>
        <View style={{ flex: 1, flexDirection: 'row', backgroundColor: theme.colors.background }}>

          {/* Sidebar */}
          <View style={{
            width: collapsed ? 60 : 224,
            backgroundColor: theme.colors.card,
            borderRightWidth: 1,
            borderRightColor: theme.colors.border,
            paddingTop: 36,
            paddingHorizontal: collapsed ? 0 : theme.spacing.md,
            alignItems: collapsed ? 'center' : undefined,
          }}>
            {/* Logo + collapse toggle */}
            <View style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: collapsed ? 'center' : 'space-between',
              paddingLeft: collapsed ? 0 : theme.spacing.sm,
              marginBottom: theme.spacing.xl,
              paddingHorizontal: collapsed ? 0 : undefined,
            }}>
              {!collapsed && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={{
                    fontSize: theme.font.size.xl,
                    fontWeight: theme.font.weight.bold,
                    color: theme.colors.primary,
                  }}>
                    vteam
                  </Text>
                  <View style={{ backgroundColor: theme.colors.primary + '22', borderWidth: 1, borderColor: theme.colors.primary + '66', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                    <Text style={{ fontSize: theme.font.size.xs, fontWeight: '700', color: theme.colors.primary, letterSpacing: 1 }}>BETA</Text>
                  </View>
                </View>
              )}
              <TouchableOpacity
                onPress={() => setCollapsed(c => !c)}
                style={{ padding: 4 }}
                hitSlop={8}
              >
                <SidebarToggleIcon color={theme.colors.subtext} />
              </TouchableOpacity>
            </View>

            {TABS.map((tab, i) => {
              const active = sidebarActive === i
              const badge = tab.key === 'chat' && chatUnread > 0 ? chatUnread : 0
              return (
                <TourTarget key={tab.key} id={TOUR_TARGETS.tab(tab.key)}>
                <TouchableOpacity
                  onPress={() => goToTab(i)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: collapsed ? 'center' : undefined,
                    gap: collapsed ? 0 : theme.spacing.sm,
                    paddingVertical: 10,
                    paddingHorizontal: collapsed ? 0 : theme.spacing.sm,
                    width: collapsed ? 40 : undefined,
                    height: collapsed ? 40 : undefined,
                    borderRadius: theme.radius.md,
                    marginBottom: theme.spacing.xs,
                    backgroundColor: active ? theme.colors.primary + '18' : 'transparent',
                  }}
                >
                  <View style={{ position: 'relative' }}>
                    <Ionicons
                      name={tab.icon}
                      size={20}
                      color={active ? theme.colors.primary : theme.colors.subtext}
                    />
                    {badge > 0 && (
                      <View style={{
                        position: 'absolute', top: -5, right: -8,
                        minWidth: 18, height: 18, borderRadius: 9,
                        backgroundColor: theme.colors.hot,
                        alignItems: 'center', justifyContent: 'center',
                        paddingHorizontal: 3,
                      }}>
                        <Text maxFontSizeMultiplier={TIGHT_TEXT_SCALE} style={{ fontSize: theme.font.size.xs, fontWeight: '800', color: theme.colors.white, lineHeight: 13 }}>
                          {badge > 99 ? '99+' : badge}
                        </Text>
                      </View>
                    )}
                  </View>
                  {!collapsed && (
                    <Text style={{
                      fontSize: theme.font.size.md,
                      fontWeight: active ? theme.font.weight.semibold : theme.font.weight.regular,
                      color: active ? theme.colors.primary : theme.colors.subtext,
                    }}>
                      {tab.name}
                    </Text>
                  )}
                </TouchableOpacity>
                </TourTarget>
              )
            })}
          </View>

          {/* Content */}
          <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
            <Stack
              screenOptions={{
                headerStyle: { backgroundColor: theme.colors.background },
                headerTintColor: theme.colors.primary,
                headerShadowVisible: false,
                gestureEnabled: SWIPE_NAVIGATION.back,
                contentStyle: { backgroundColor: theme.colors.background },
              }}
            >
              <Stack.Screen name="(tabs)" options={{ headerShown: false, headerBackTitle: 'Back' }} />
              <Stack.Screen name="host" options={{ title: 'Host Event', headerBackTitle: 'Events', gestureEnabled: SWIPE_NAVIGATION.back, presentation: 'modal', ...(Platform.OS === 'web' ? { animationEnabled: false } : {}) }} />
              <Stack.Screen name="event/[id]" options={{ headerBackTitle: 'Events', gestureEnabled: SWIPE_NAVIGATION.back }} />
              <Stack.Screen name="profile/[id]" options={{ headerShown: false, gestureEnabled: SWIPE_NAVIGATION.back }} />
              <Stack.Screen name="club/[id]" options={{ headerShown: false, gestureEnabled: SWIPE_NAVIGATION.back }} />
              <Stack.Screen name="club/create" options={{ title: 'Create club', headerBackTitle: 'Clubs', gestureEnabled: SWIPE_NAVIGATION.back }} />
              <Stack.Screen name="notifications" options={{ title: 'Notifications', headerBackTitle: 'Back' }} />
              <Stack.Screen name="chat/[id]" options={{ headerShown: false, gestureEnabled: SWIPE_NAVIGATION.back }} />
              <Stack.Screen name="book" options={{ headerShown: false, gestureEnabled: SWIPE_NAVIGATION.back }} />
            </Stack>

            {/* FAB backdrop */}
            {fabOpen && (
              <Pressable
                style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
                onPress={closeFab}
              />
            )}

            {/* FAB popup options */}
            {fabOpen && (
              <Animated.View
                style={{
                  position: 'absolute',
                  bottom: 32 + 52 + theme.spacing.sm,
                  right: 32,
                  alignItems: 'flex-end',
                  opacity: fabAnim,
                  transform: [{ translateY: fabAnim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
                }}
              >
                <CreateMenuList variant="panel" onSelect={goCreate} />
              </Animated.View>
            )}

            {/* FAB button. Wide web shows it on Events only; the mobile tab bar shows its
                create button on every tab. Long-standing difference, kept as is. */}
            {pathname === routes.events() && (
              <TourTarget id={TOUR_TARGETS.create} style={{ position: 'absolute', bottom: 32, right: 32 }}>
              <TouchableOpacity
                onPress={fabOpen ? closeFab : openFab}
                accessibilityRole="button"
                accessibilityLabel={fabOpen ? 'Close create menu' : 'Create'}
                accessibilityState={{ expanded: fabOpen }}
                testID="create-menu-button"
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 26,
                  backgroundColor: theme.colors.primary,
                  alignItems: 'center',
                  justifyContent: 'center',
                  shadowColor: theme.colors.black,
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.2,
                  shadowRadius: 6,
                }}
              >
                <Animated.View style={{ transform: [{ rotate: fabAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '45deg'] }) }] }}>
                  <Ionicons name="add" size={28} color={theme.colors.white} />
                </Animated.View>
              </TouchableOpacity>
              </TourTarget>
            )}
          </View>

        </View>
        </SentryErrorBoundary>
      </WebNavContext.Provider>
    )
  }

  // ── Mobile: plain Stack — WebNavContext not needed on mobile ─────────────
  return (
    <SentryErrorBoundary>
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.background },
        headerTintColor: theme.colors.primary,
        headerShadowVisible: false,
        gestureEnabled: SWIPE_NAVIGATION.back,
        contentStyle: { backgroundColor: theme.colors.background },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false, headerBackTitle: 'Back' }} />
      <Stack.Screen name="host" options={{ title: 'Host Event', headerBackTitle: 'Events', gestureEnabled: SWIPE_NAVIGATION.back, presentation: 'modal' }} />
      <Stack.Screen name="event/[id]" options={{ headerBackTitle: 'Events', gestureEnabled: SWIPE_NAVIGATION.back }} />
      <Stack.Screen name="profile/[id]" options={{ headerShown: false, gestureEnabled: SWIPE_NAVIGATION.back }} />
      <Stack.Screen name="club/[id]" options={{ headerShown: false, gestureEnabled: SWIPE_NAVIGATION.back }} />
      <Stack.Screen name="club/create" options={{ title: 'Create club', headerBackTitle: 'Clubs', gestureEnabled: SWIPE_NAVIGATION.back }} />
      <Stack.Screen name="notifications" options={{ title: 'Notifications', headerBackTitle: 'Back' }} />
      <Stack.Screen name="chat/[id]" options={{ headerShown: false, gestureEnabled: SWIPE_NAVIGATION.back }} />
      <Stack.Screen name="book" options={{ headerShown: false, gestureEnabled: SWIPE_NAVIGATION.back }} />
    </Stack>
    </SentryErrorBoundary>
  )
}
