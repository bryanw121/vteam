import React, { useEffect, useMemo, useState, type ComponentType } from 'react'
import { Platform, View, useWindowDimensions } from 'react-native'
import { theme, BREAKPOINTS, TABS, EVENTS_TAB_INDEX, type TabKey } from '../../../../constants'
import { Slot } from 'expo-router'
import { Pager } from '../../../../components/Pager'
import { useTabsActive, useTabsShell } from '../../../../contexts/tabs'
import EventsScreen from './index'
import ProfileScreen from './profile/index'
import ClubsScreen from '../clubs'
import ChatScreen from '../chat'

const TAB_COUNT = TABS.length
/** One screen per tab; rendered in TABS order so page i is TABS[i]. */
const TAB_SCREENS: Record<TabKey, ComponentType> = {
  events: EventsScreen,
  clubs: ClubsScreen,
  chat: ChatScreen,
  profile: ProfileScreen,
}
const NEIGHBOR_PREFETCH_DELAY_MS = 2000

/** Prefetch the next tab once the active one has settled so the first swipe isn't empty. */
function prefetchNeighbor(active: number): number | null {
  if (active < TAB_COUNT - 1) return active + 1
  if (active > 0) return active - 1
  return null
}

/**
 * Mount each tab the first time it becomes active (and keep it mounted).
 * Neighbors are not pre-mounted so Clubs/Chat/Profile don't fetch on Events cold start;
 * the first swipe to an unvisited tab may briefly show an empty page until mount.
 */
function nextMountedTabs(prev: Set<number>, active: number): Set<number> {
  if (prev.has(active)) return prev
  const out = new Set(prev)
  out.add(active)
  return out
}

/**
 * Wide web: Slot renders /, /clubs, /profile, or /chat as separate routes.
 * Mobile apps: Pager holds Events, Clubs, Chat, Profile (tab index from TabsContext); swiping between them follows SWIPE_NAVIGATION.tabs.
 * Narrow web: the tabs render statically, no pager.
 */
export default function MainLayout() {
  const { width } = useWindowDimensions()
  const { activeTabIndex } = useTabsActive()
  const { goToTab, pagerBlocked, docScrollActive } = useTabsShell()
  const [mountedTabs, setMountedTabs] = useState(() => nextMountedTabs(new Set([EVENTS_TAB_INDEX]), EVENTS_TAB_INDEX))

  useEffect(() => {
    setMountedTabs(prev => nextMountedTabs(prev, activeTabIndex))
    // After the active tab settles, prefetch one neighbor for the next swipe.
    const neighbor = prefetchNeighbor(activeTabIndex)
    if (neighbor == null) return
    // Long enough that the neighbor's queries don't compete with the active
    // tab's first load (cold start is the Events feed).
    const t = setTimeout(() => {
      setMountedTabs(prev => nextMountedTabs(prev, neighbor))
    }, NEIGHBOR_PREFETCH_DELAY_MS)
    return () => clearTimeout(t)
  }, [activeTabIndex])

  const screens = useMemo(() => {
    return TABS.map((tab, i) => {
      const Screen = TAB_SCREENS[tab.key]
      return mountedTabs.has(i) ? <Screen key={tab.key} /> : <View key={`tab-placeholder-${i}`} style={{ flex: 1 }} />
    })
  }, [mountedTabs])

  if (Platform.OS === 'web' && width >= BREAKPOINTS.sidebar) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
        <Slot />
      </View>
    )
  }

  // Narrow web: no swipe Pager. Screens stay mounted once visited (state preserved)
  // with inactive ones hidden, so the active tab's content can flow in the document
  // when doc-scroll mode is on (required for browser URL bars to collapse).
  if (Platform.OS === 'web') {
    return (
      <View style={docScrollActive ? ({ minHeight: '100dvh' } as any) : { flex: 1 }}>
        {screens.map((screen, i) => (
          <View
            key={i}
            style={
              i !== activeTabIndex
                ? { display: 'none' }
                : docScrollActive
                  ? undefined // auto height — content extends the document
                  : { flex: 1 }
            }
          >
            {screen}
          </View>
        ))}
      </View>
    )
  }

  return (
    <View style={{ flex: 1 }}>
      <Pager page={activeTabIndex} onPageChange={goToTab} pagerBlockedRef={pagerBlocked}>
        {screens}
      </Pager>
    </View>
  )
}
