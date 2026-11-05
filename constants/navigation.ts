import type { ComponentProps } from 'react'
import type { Ionicons } from '@expo/vector-icons'
import { routes, type RouteString } from '../utils/routes'
import type { CreateMenuSectionKey } from '../types'

/**
 * The only definition of the app's tabs and the create menu. The sidebar
 * (app/(app)/_layout), the mobile tab bar (app/(app)/(tabs)/_layout), the
 * pager (.../(main)/_layout) and the doc-scroll hook all derive from this, so
 * adding, reordering or renaming a tab is a one-file change.
 */

export type TabKey = 'events' | 'clubs' | 'chat' | 'profile'

export type Tab = {
  key: TabKey
  /** Sidebar label and accessible name. */
  name: string
  /** Label under the icon in the mobile tab bar (shorter than `name` for Profile). */
  mobileLabel: string
  icon: ComponentProps<typeof Ionicons>['name']
  /** Route the tab lives at; what the sidebar / tab bar navigates to. */
  path: RouteString
  /** Index in the mobile / narrow-web pager; always equals the tab's position in TABS. */
  pageIndex: number
  /** Narrow web: the tab's content flows in the document so the body scrolls (see useDocScrollMode). */
  docScroll: boolean
  /** Guests see a sign-in prompt in place of the tab's content. */
  requiresAuth: boolean
  /** URL prefixes that belong to this tab (other than `path` itself), for tabForPath. */
  pathPrefixes: readonly string[]
}

/** Pager order, left to right. Keep `pageIndex` equal to the array index (navigation.test.ts checks it). */
export const TABS: readonly Tab[] = [
  {
    key: 'events', name: 'Events', mobileLabel: 'Events', icon: 'calendar-outline',
    path: routes.events(), pageIndex: 0, docScroll: true, requiresAuth: false, pathPrefixes: [],
  },
  {
    key: 'clubs', name: 'Clubs', mobileLabel: 'Clubs', icon: 'people-outline',
    path: routes.clubs(), pageIndex: 1, docScroll: true, requiresAuth: false, pathPrefixes: ['/clubs', '/club'],
  },
  {
    // Chat keeps the app-shell layout: its pinned input bar needs a fixed viewport.
    key: 'chat', name: 'Chat', mobileLabel: 'Chat', icon: 'chatbubbles-outline',
    path: routes.chat(), pageIndex: 2, docScroll: false, requiresAuth: true, pathPrefixes: ['/chat'],
  },
  {
    key: 'profile', name: 'Profile', mobileLabel: 'Me', icon: 'person-circle-outline',
    path: routes.profile(), pageIndex: 3, docScroll: true, requiresAuth: true, pathPrefixes: ['/profile', '/settings'],
  },
]

export function tabIndexOf(key: TabKey): number {
  return TABS.findIndex(tab => tab.key === key)
}

export const EVENTS_TAB_INDEX = tabIndexOf('events')
export const CLUBS_TAB_INDEX = tabIndexOf('clubs')
export const CHAT_TAB_INDEX = tabIndexOf('chat')
export const PROFILE_TAB_INDEX = tabIndexOf('profile')

/** The tab a URL path belongs to. Anything unrecognised (event pages, host, ...) falls back to Events. */
export function tabForPath(path: string): Tab {
  return TABS.find(tab => tab.pathPrefixes.some(prefix => path.startsWith(prefix))) ?? TABS[EVENTS_TAB_INDEX]
}

/** Pager index for a URL path (0 = Events, 1 = Clubs, 2 = Chat, 3 = Profile). */
export function tabIndexFromPath(path: string): number {
  return tabForPath(path).pageIndex
}

/**
 * Swipe navigation in the iOS and Android apps. Turned off (Oct 2026) after
 * swipes kept navigating by accident. The code is kept, so either switch
 * brings its gesture back:
 * - `tabs`: swipe left/right between the main tabs (Events / Clubs / Chat /
 *   Profile) and between an event's tabs (Details / People / ...). Both are
 *   `components/Pager`, whose `swipeEnabled` defaults to this.
 * - `back`: iOS swipe from the left edge to go back on stack screens, swipe
 *   from anywhere on Settings screens (`fullScreenGestureEnabled`), and swipe
 *   down to close the Host modal. Every Stack's `gestureEnabled` reads this.
 *   Android's system back button/gesture is the OS's and always works.
 * Web never had either: narrow web renders the pager statically, and the
 * browser's own swipe-back can't be turned off by a page.
 * `__tests__/swipeNavigation.test.ts` keeps every layout reading these flags.
 */
export const SWIPE_NAVIGATION = {
  tabs: false,
  back: false,
} as const

export type CreateMenuOption = {
  label: string
  path: RouteString
  icon: ComponentProps<typeof Ionicons>['name']
  /** Guests are sent to sign in first (creating on vteam); false = anyone may open it. */
  requiresAuth: boolean
}

export type CreateMenuSection = {
  key: CreateMenuSectionKey
  /** Small caption above the group. */
  title: string
  options: readonly CreateMenuOption[]
}

/**
 * The create ("+") menu: the bottom bar's centre button on mobile and the FAB on
 * wide web. Both render these sections top to bottom, so the vteam group (the
 * common case) sits right above the button. Two kinds of choice:
 * - book a court at a venue: browse open court time, then book on the venue's
 *   own site (public, guests included);
 * - create on vteam: needs an account.
 *
 * Note: on wide web the FAB is only shown on the Events tab (pathname === '/'),
 * while mobile shows the button on every tab. That difference is long-standing
 * and intentionally unchanged.
 */
export const CREATE_MENU: readonly CreateMenuSection[] = [
  {
    key: 'venue',
    title: 'Book at a venue',
    options: [
      { label: 'Book a court', path: routes.book(), icon: 'calendar-clear-outline', requiresAuth: false },
    ],
  },
  {
    key: 'vteam',
    title: 'Create on vteam',
    options: [
      { label: 'Open Play',     path: routes.host({ maxAttendees: 18 }), icon: 'people-outline', requiresAuth: true },
      { label: 'Tournament',    path: routes.tournamentCreate(),         icon: 'trophy-outline', requiresAuth: true },
      { label: 'From Template', path: routes.host({ mode: 'templates' }), icon: 'copy-outline',  requiresAuth: true },
    ],
  },
]
