import { useCallback, useEffect, useRef, useState } from 'react'
import { Platform } from 'react-native'
import { useGlobalSearchParams, useLocalSearchParams, usePathname, useRootNavigationState, useRouter } from 'expo-router'
import { TABS, type TabKey } from '../constants/navigation'
import { firstParam, queryString } from '../utils/urlState'
import { toRoute } from '../utils/routes'
import { BREAKPOINTS } from '../constants/layout'
import { rememberTabParam, tabParams } from '../utils/tabViews'
import type { UrlCodec } from '../types'

type Options<T> = {
  /** The tab this screen is (Events, Clubs, Chat, Profile). Tab screens stay mounted under other tabs, so they read and write the URL only while their tab is the one in the address. */
  tab?: TabKey
  /** The value when the link doesn't carry this param (e.g. the feed's saved filters); written to the URL on mount. Default: the codec's default. */
  fallback?: () => T
}

/**
 * One piece of a screen's view (tab, filter, day, search) kept in the URL, so
 * the address always opens what's on screen. Reads the param once on mount and
 * again when the URL changes from outside (a link, back/forward); writes it with
 * `router.setParams`, which replaces the history entry, so Back leaves the
 * screen instead of undoing filters. The default value is left out of the URL.
 */
export function useUrlParam<T>(name: string, codec: UrlCodec<T>, opts: Options<T> = {}): [T, (next: T) => void, boolean] {
  const router = useRouter()
  const pathname = usePathname()
  const local = useLocalSearchParams<Record<string, string | string[]>>()
  const global = useGlobalSearchParams<Record<string, string | string[]>>()
  const tabPath = opts.tab ? TABS.find(t => t.key === opts.tab)?.path : undefined
  const ownsUrl = !opts.tab || pathname === tabPath
  const raw = ownsUrl
    ? firstParam((opts.tab ? global : local)[name])
    : opts.tab ? tabParams(opts.tab)[name] : undefined

  // Whether the link (or the tab's remembered view) carried this param when the screen opened.
  const [inLink] = useState(() => raw !== undefined && raw !== '')
  const [value, setValue] = useState<T>(() => (!inLink && opts.fallback ? opts.fallback() : codec.parse(raw)))
  // What this hook last put in (or read from) the URL; a different raw value means the URL changed from outside.
  const seen = useRef<string | undefined>(raw === undefined ? undefined : codec.format(codec.parse(raw)))
  const ownsRef = useRef(ownsUrl)
  ownsRef.current = ownsUrl
  // What the address says now, so a write that changes nothing is skipped.
  const rawRef = useRef(raw)
  rawRef.current = raw
  // A navigation before the router is ready is dropped (or mangled): hold it until then.
  const navReady = !!useRootNavigationState()?.key
  const navReadyRef = useRef(navReady)
  navReadyRef.current = navReady
  const pendingWrite = useRef<(() => void) | null>(null)

  // Opened from a link: remember the tab's view so switching away and back keeps it.
  useEffect(() => {
    if (opts.tab && ownsUrl && raw !== undefined) rememberTabParam(opts.tab, name, raw)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!ownsUrl) return
    if (raw === seen.current) return
    seen.current = raw
    setValue(codec.parse(raw))
    if (opts.tab) rememberTabParam(opts.tab, name, raw)
  }, [raw, ownsUrl]) // eslint-disable-line react-hooks/exhaustive-deps

  const set = useCallback((next: T) => {
    setValue(next)
    const formatted = codec.format(next)
    seen.current = formatted
    if (opts.tab) rememberTabParam(opts.tab, name, formatted)
    // Tab screens write only while they're the tab in the address, and only on the web (native has no address bar to keep in step).
    if (!ownsRef.current || (opts.tab && Platform.OS !== 'web')) return
    if ((rawRef.current || undefined) === formatted) return
    // Narrow web draws the tab screens itself (no route under them), so setParams can't reach
    // their address: replace the tab's whole address instead, which doesn't remount them there.
    // Width is read now, not from a hook, so the first write after mount takes the right path.
    const write = () => {
      const narrowWeb = typeof window !== 'undefined' && window.innerWidth < BREAKPOINTS.sidebar
      if (opts.tab && narrowWeb && tabPath) router.replace(toRoute(tabPath + queryString(tabParams(opts.tab!))))
      else router.setParams({ [name]: formatted })
    }
    if (navReadyRef.current) write()
    else pendingWrite.current = write
  }, [codec, name, opts.tab, router, tabPath])

  // A fallback other than the default goes into the address too, so it matches the screen.
  const wroteFallback = useRef(false)
  useEffect(() => {
    if (!navReady) return
    const pending = pendingWrite.current
    pendingWrite.current = null
    if (pending) setTimeout(pending, 0)
    if (wroteFallback.current) return
    wroteFallback.current = true
    if (!inLink && opts.fallback && codec.format(value) !== undefined) setTimeout(() => set(value), 0)
  }, [navReady]) // eslint-disable-line react-hooks/exhaustive-deps

  return [value, set, inLink]
}
