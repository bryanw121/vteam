import React, { useEffect, useMemo, useState, type ComponentType } from 'react'
import { Platform, View, useWindowDimensions } from 'react-native'
import { theme, BREAKPOINTS, TABS, type TabKey } from '../../../../constants'
import { Slot } from 'expo-router'
import { Pager } from '../../../../components/Pager'
import { useTabsActive, useTabsShell } from '../../../../contexts/tabs'
import { nextMountedTabs, prefetchNeighbor } from '../../../../utils/tabMount'
import EventsScreen from './index'
import ProfileScreen from './profile/index'
import ClubsScreen from '../clubs'
import ChatScreen from '../chat'

/** One screen per tab; rendered in TABS order so page i is TABS[i]. */
const TAB_SCREENS: Record<TabKey, ComponentType> = {
  events: EventsScreen,
  clubs: ClubsScreen,
  chat: ChatScreen,
  profile: ProfileScreen,
}
const NEIGHBOR_PREFETCH_DELAY_MS = 2000

/**
 * Wide web: Slot renders /, /clubs, /profile, or /chat as separate routes.
 * Mobile apps: Pager holds Events, Clubs, Chat, Profile (tab index from TabsContext); swiping between them follows SWIPE_NAVIGATION.tabs.
 * Narrow web: the tabs render statically, no pager.
 */
export default function MainLayout() {
  const { width } = useWindowDimensions()
  const { activeTabIndex } = useTabsActive()
  const { goToTab, pagerBlocked, docScrollActive } = useTabsShell()
  const [mountedTabs, setMountedTabs] = useState(() => nextMountedTabs(new Set(), activeTabIndex))

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
