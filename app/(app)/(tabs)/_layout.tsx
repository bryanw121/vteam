import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFocusEffect, Stack, usePathname, useRouter } from "expo-router";
import { Animated, Platform, Pressable, StyleSheet, TouchableOpacity, View } from "react-native";
import { Text } from "../../../components/ui/Text";
import { BlurView } from "expo-blur";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Slot } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { TabsActiveContext, TabsContext, TabsShellContext } from "../../../contexts/tabs";
import { useWebNav } from "../../../contexts/webNav";
import { theme, BREAKPOINTS, TABS, TIGHT_TEXT_SCALE, tabIndexFromPath, SWIPE_NAVIGATION } from "../../../constants";
import type { CreateMenuOption } from "../../../constants";
import { CreateMenuList } from "../../../components/CreateMenuList";
import { useChatUnread } from "../../../hooks/useChatUnread";
import { useDocScrollMode } from "../../../hooks/useDocScrollMode";
import { useIsNarrowWeb } from "../../../hooks/useIsNarrowWeb";
import { shouldRefreshEventsOnFocus } from "../../../utils/monthKeys";
import { useRequireSignIn } from "../../../hooks/useRequireSignIn";
import { useTourShell } from "../../../contexts/tour";
import { TourTarget } from "../../../components/tour/TourTarget";
import { TOUR_TARGETS } from "../../../constants";

// The bottom bar renders TABS (constants/navigation.ts) in pager order, with the
// create button inserted before the Chat tab.
const noopSetTabBarHidden = (_hidden: boolean) => {};

export default function TabsLayout() {
  const pathname = usePathname();
  // Start on the tab the URL names, so a direct link to /clubs or /profile on
  // narrow web (where the pager, not the router, picks the visible tab) opens it.
  const [activeTabIndex, setActiveTabIndex] = useState(() => tabIndexFromPath(pathname));
  const [eventsRefreshTick, setEventsRefreshTick] = useState(0);
  const pagerBlocked = useRef(false);

  const blurredAtMs = useRef<number | null>(null);
  useFocusEffect(useCallback(() => {
    if (shouldRefreshEventsOnFocus(blurredAtMs.current, Date.now())) {
      setEventsRefreshTick(t => t + 1);
    }
    return () => { blurredAtMs.current = Date.now(); };
  }, []));

  const [fabOpen, setFabOpen] = useState(false);
  const fabAnim = useRef(new Animated.Value(0)).current;
  const insets = useSafeAreaInsets();

  // In a mobile browser the home indicator area is already covered by the browser
  // chrome, so applying the full safe-area-inset-bottom creates a visible gap
  // between the tab bar and the URL bar. Zero it out unless in standalone mode.
  const isWebBrowser = Platform.OS === 'web' && typeof window !== 'undefined' &&
    !(window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true)
  const topInset = isWebBrowser ? 0 : insets.top
  const bottomInset = isWebBrowser ? 0 : (insets.bottom || theme.spacing.md)

  const tabBarTranslateY = useRef(new Animated.Value(0)).current;
  const tabBarNaturalHeight = useRef(60);
  const [tabBarHeight, setTabBarHeight] = useState(60);
  const tabBarHiddenRef = useRef(false);
  const setTabBarHidden = useCallback((hidden: boolean) => {
    if (tabBarHiddenRef.current === hidden) return;
    tabBarHiddenRef.current = hidden;
    Animated.timing(tabBarTranslateY, {
      toValue: hidden ? tabBarNaturalHeight.current : 0,
      duration: 220,
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, [tabBarTranslateY]);
  const webNav = useWebNav();
  const router = useRouter();
  const isNarrowWeb = useIsNarrowWeb(BREAKPOINTS.sidebar);
  const chatUnread = useChatUnread();

  // Document-scroll mode: narrow web on Events/Clubs/Profile tabs (or an event
  // page). Toggles body.doc-scroll so the page itself scrolls (browser bars collapse).
  const docScrollActive = useDocScrollMode(isNarrowWeb, activeTabIndex, pathname);

  // Track fab open in a ref so goToTab can stay a stable callback (below).
  const fabOpenRef = useRef(false);

  // In doc-scroll mode the tab bar hide/show is driven by window scroll here
  // (one listener for all tabs) instead of per-screen ScrollView onScroll.
  const lastWindowScrollY = useRef(0);
  useEffect(() => {
    if (!docScrollActive || typeof window === 'undefined') return;
    const onScroll = () => {
      const y = window.scrollY;
      const diff = y - lastWindowScrollY.current;
      lastWindowScrollY.current = y;
      if (y <= 60) { setTabBarHidden(false); return; }
      if (Math.abs(diff) > 5) setTabBarHidden(diff > 0);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [docScrollActive, setTabBarHidden]);

  // Stable callbacks so the TabsContext value (memoized below) doesn't change
  // identity on every render — keeps tab screens from re-rendering on fab toggle.
  const closeFab = useCallback(() => {
    fabOpenRef.current = false;
    Animated.timing(fabAnim, { toValue: 0, duration: 150, useNativeDriver: true }).start(() => setFabOpen(false));
  }, [fabAnim]);

  const requireSignIn = useRequireSignIn();
  // Anyone may open the menu: "Book a court" is public. Creating on vteam asks
  // guests to sign in when they pick it (goCreate).
  const openFab = useCallback(() => {
    fabOpenRef.current = true;
    setFabOpen(true);
    Animated.spring(fabAnim, { toValue: 1, useNativeDriver: true, tension: 120, friction: 8 }).start();
  }, [fabAnim]);

  const goToTab = useCallback((index: number) => {
    setActiveTabIndex(index);
    if (fabOpenRef.current) closeFab();
    setTabBarHidden(false);
  }, [closeFab, setTabBarHidden]);

  /** When a stack screen (settings or another user's profile) is open, switch tabs by resetting the stack to the right home route. */
  function handleTabPress(tabIndex: number) {
    if (pathname.startsWith("/settings") || /^\/profile\/[^/]+$/.test(pathname) || pathname.startsWith("/chat")) {
      router.replace(TABS[tabIndex].path);
    }
    goToTab(tabIndex);
  }

  // Let a guided tour move between tabs. Wide web routes each tab as a page;
  // mobile / narrow web switches the pager (leaving a stack screen first).
  const wideWeb = Platform.OS === "web" && !isNarrowWeb;
  useTourShell({
    showTab: index => {
      if (wideWeb) {
        if (pathname !== TABS[index].path) webNav.goToTab(index);
      } else if (index !== activeTabIndex || pathname !== TABS[index].path) {
        handleTabPress(index);
      }
    },
    revealChrome: () => setTabBarHidden(false),
  });

  function goCreate(option: CreateMenuOption) {
    closeFab();
    // Creating on vteam needs an account; guests go to sign-in and come back here.
    if (option.requiresAuth && !requireSignIn()) return;
    setTimeout(() => router.push(option.path), 160);
  }

  const tabsShellValue = useMemo(() => ({
    goToTab,
    eventsRefreshTick,
    pagerBlocked,
    setTabBarHidden,
    tabBarHeight,
    docScrollActive,
  }), [goToTab, eventsRefreshTick, pagerBlocked, setTabBarHidden, tabBarHeight, docScrollActive]);

  const tabsActiveValue = useMemo(() => ({ activeTabIndex }), [activeTabIndex]);

  const tabsContextValue = useMemo(() => ({
    ...tabsShellValue,
    activeTabIndex,
  }), [tabsShellValue, activeTabIndex]);

  const wideWebShellValue = useMemo(() => ({
    goToTab: webNav.goToTab,
    eventsRefreshTick,
    pagerBlocked,
    setTabBarHidden: noopSetTabBarHidden,
    tabBarHeight: 0,
    docScrollActive: false,
  }), [webNav.goToTab, eventsRefreshTick, pagerBlocked]);

  // Wide web routes each tab as its own page, so the "active" tab is whichever the
  // URL names. Clubs and Chat only fetch while active — a hardcoded 0 here meant
  // they never fetched on desktop and spun forever.
  const wideWebTabIndex = tabIndexFromPath(pathname);
  const wideWebActiveValue = useMemo(() => ({ activeTabIndex: wideWebTabIndex }), [wideWebTabIndex]);

  const wideWebTabsValue = useMemo(() => ({
    ...wideWebShellValue,
    activeTabIndex: wideWebTabIndex,
  }), [wideWebShellValue, wideWebTabIndex]);

  // ── Web (wide): sidebar in (app)/_layout — let Expo Router render the route ─
  // Placed after all hooks so hook order is stable across the breakpoint.
  if (Platform.OS === "web" && !isNarrowWeb) {
    return (
      <TabsShellContext.Provider value={wideWebShellValue}>
        <TabsActiveContext.Provider value={wideWebActiveValue}>
          <TabsContext.Provider value={wideWebTabsValue}>
            <View style={{ flex: 1 }}>
              <Slot />
            </View>
          </TabsContext.Provider>
        </TabsActiveContext.Provider>
      </TabsShellContext.Provider>
    );
  }

  return (
    <TabsShellContext.Provider value={tabsShellValue}>
    <TabsActiveContext.Provider value={tabsActiveValue}>
    <TabsContext.Provider value={tabsContextValue}>
      <View style={[
        { backgroundColor: theme.colors.background, paddingTop: topInset },
        // Doc-scroll mode: auto height so content extends the document (body scrolls)
        docScrollActive ? ({ minHeight: '100dvh' } as any) : { flex: 1 },
      ]}>
        <Stack
          screenOptions={({ route }) => {
            const isMain = route.name === "(main)";
            return {
              headerShown: !isMain,
              headerShadowVisible: false,
              headerTintColor: theme.colors.primary,
              headerStyle: { backgroundColor: theme.colors.background },
              gestureEnabled: SWIPE_NAVIGATION.back,
              animation: "slide_from_right",
              ...(SWIPE_NAVIGATION.back && Platform.OS === "ios" && !isMain
                ? { fullScreenGestureEnabled: true }
                : {}),
              contentStyle: {
                backgroundColor: theme.colors.background,
                ...(isMain ? {} : { paddingBottom: tabBarHeight }),
              },
            };
          }}
        />

        {fabOpen && (
          <Pressable
            style={Platform.OS === 'web'
              ? ({ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 } as any)
              : StyleSheet.absoluteFillObject}
            onPress={closeFab}
          >
            <BlurView
              pointerEvents="none"
              intensity={36}
              tint="dark"
              style={StyleSheet.absoluteFillObject}
            />
            <View
              pointerEvents="none"
              style={[StyleSheet.absoluteFillObject, { backgroundColor: theme.colors.fabMenuBackdropDim }]}
            />
          </Pressable>
        )}

        {fabOpen && (
          <Animated.View
            style={{
              position: (Platform.OS === 'web' ? 'fixed' : 'absolute') as any,
              bottom: tabBarHeight + theme.spacing.sm,
              right: theme.spacing.lg,
              alignItems: "flex-end",
              opacity: fabAnim,
              transform: [{ translateY: fabAnim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
            }}
          >
            <CreateMenuList variant="overlay" onSelect={goCreate} />
          </Animated.View>
        )}

        {/* FAB button is now embedded in the nav bar — no separate FAB */}

        <Animated.View
          style={{
            // 'fixed' on web: stays pinned to the viewport while the document scrolls
            position: (Platform.OS === 'web' ? 'fixed' : 'absolute') as any,
            bottom: 0, left: 0, right: 0,
            transform: [{ translateY: tabBarTranslateY }],
          }}
          onLayout={e => {
            const h = e.nativeEvent.layout.height;
            tabBarNaturalHeight.current = h;
            setTabBarHeight(h);
          }}
        >
          {/* Bottom padding spacer — counted in tabBarHeight for content offset */}
          <View style={{ paddingBottom: Math.max(bottomInset, 10) + 10, backgroundColor: theme.colors.background }}>
            <View style={{
              flexDirection: "row",
              marginHorizontal: 14,
              backgroundColor: theme.colors.card,
              borderRadius: 26,
              paddingVertical: 10,
              paddingHorizontal: 10,
              alignItems: 'center',
              shadowColor: theme.colors.black,
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.25,
              shadowRadius: 20,
              elevation: 12,
            }}>
              {TABS.map(tab => {
                const active = activeTabIndex === tab.pageIndex;
                const badge = tab.key === 'chat' && chatUnread > 0 ? chatUnread : 0;

                // Insert Create button between Clubs and Chat
                const createBtn = tab.key === 'chat' ? (
                  <TourTarget key="create" id={TOUR_TARGETS.create}>
                  <TouchableOpacity
                    onPress={fabOpen ? closeFab : openFab}
                    accessibilityRole="button"
                    accessibilityLabel={fabOpen ? 'Close create menu' : 'Create'}
                    accessibilityState={{ expanded: fabOpen }}
                    testID="create-menu-button"
                    style={{
                      width: 46, height: 46, borderRadius: 15,
                      backgroundColor: fabOpen ? theme.colors.accent + 'CC' : theme.colors.accent,
                      alignItems: 'center', justifyContent: 'center',
                      shadowColor: theme.colors.accent,
                      shadowOffset: { width: 0, height: 4 },
                      shadowOpacity: 0.5,
                      shadowRadius: 8,
                      elevation: 6,
                    }}
                  >
                    <Animated.View style={{ transform: [{ rotate: fabAnim.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "45deg"] }) }] }}>
                      <Ionicons name="add" size={24} color={theme.colors.accentInk} />
                    </Animated.View>
                  </TouchableOpacity>
                  </TourTarget>
                ) : null;

                return (
                  <React.Fragment key={tab.key}>
                    {createBtn}
                    <TourTarget id={TOUR_TARGETS.tab(tab.key)} style={{ flex: 1 }}>
                    <TouchableOpacity
                      onPress={() => handleTabPress(tab.pageIndex)}
                      style={{
                        alignItems: "center", gap: 3,
                        paddingVertical: 6, borderRadius: 14,
                        backgroundColor: active ? 'rgba(255,255,255,0.12)' : 'transparent',
                      }}
                    >
                      <View style={{ position: "relative" }}>
                        <Ionicons
                          name={tab.icon}
                          size={20}
                          color={active ? theme.colors.white : 'rgba(255,255,255,0.5)'}
                        />
                        {badge > 0 && (
                          <View style={{
                            position: "absolute", top: -4, right: -7,
                            minWidth: 18, height: 18, borderRadius: 9,
                            backgroundColor: theme.colors.hot,
                            alignItems: "center", justifyContent: "center",
                            paddingHorizontal: 2,
                          }}>
                            <Text maxFontSizeMultiplier={TIGHT_TEXT_SCALE} style={{ fontFamily: theme.fonts.bodyBold, fontSize: theme.font.size.xs, color: theme.colors.white, lineHeight: 13 }}>
                              {badge > 99 ? "99+" : badge}
                            </Text>
                          </View>
                        )}
                      </View>
                      <Text numberOfLines={1} maxFontSizeMultiplier={TIGHT_TEXT_SCALE} style={{
                        fontSize: theme.font.size.xs,
                        fontFamily: active ? theme.fonts.bodySemiBold : theme.fonts.body,
                        color: active ? theme.colors.white : 'rgba(255,255,255,0.5)',
                        letterSpacing: 0.3,
                      }}>
                        {tab.mobileLabel}
                      </Text>
                    </TouchableOpacity>
                    </TourTarget>
                  </React.Fragment>
                );
              })}
            </View>
          </View>
        </Animated.View>
      </View>
    </TabsContext.Provider>
    </TabsActiveContext.Provider>
    </TabsShellContext.Provider>
  );
}
