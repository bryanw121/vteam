import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Dimensions, Platform } from 'react-native'
import { useRouter } from 'expo-router'
import { ANALYTICS_EVENTS, TABS, TOURS, tabIndexOf, tourCompletionId } from '../constants'
import { track } from '../lib/analytics'
import { TourOverlay } from '../components/tour/TourOverlay'
import { useSession } from './session'
import { markBannerSeenOnDevice } from '../utils/seenBanners'
import { markBannerSeenOnAccount } from '../hooks/useUserSettings'
import { findShowableStep, isRectOnScreen, sameRect } from '../utils/tour'
import type { TabKey } from '../constants'
import type { TourControls, TourDef, TourId, TourMeasurable, TourRect, TourShell, TourSource } from '../types'

/**
 * Guided tours (constants/tours.ts). `TourProvider` wraps the app layout and
 * draws the overlay above everything; targets register with `<TourTarget id>`
 * (components/tour) or `useTourTarget(id)`; the tabs layout registers how to
 * switch tabs with `useTourShell`. Start a tour with `useTour().start(id)`.
 */

/** How long a step waits for its target (tab switch, first layout) before it's skipped. */
const TARGET_WAIT_MS = 1500
const TARGET_POLL_MS = 100
/** Re-measure the current target this often while the tour is open (scroll, resize, animations). */
const REMEASURE_MS = 300

type Registry = {
  register: (id: string, node: TourMeasurable) => () => void
  setShell: (shell: TourShell) => () => void
}

const TourRegistryContext = createContext<Registry | null>(null)
const TourControlsContext = createContext<TourControls>({ start: () => {}, stop: () => {}, active: false })

export const useTour = () => useContext(TourControlsContext)

/** Callback ref that registers a measurable view as tour target `id` while it's mounted. */
export function useTourTarget(id: string): (node: TourMeasurable | null) => void {
  const registry = useContext(TourRegistryContext)
  const cleanup = useRef<(() => void) | null>(null)
  return useCallback((node: TourMeasurable | null) => {
    cleanup.current?.()
    cleanup.current = null
    if (node && registry) cleanup.current = registry.register(id, node)
  }, [id, registry])
}

/** The tab shell hands the tour its tab switching. Only the tabs layout calls this. */
export function useTourShell(shell: TourShell): void {
  const registry = useContext(TourRegistryContext)
  const latest = useRef(shell)
  latest.current = shell
  useEffect(() => {
    if (!registry) return
    return registry.setShell({
      showTab: index => latest.current.showTab(index),
      revealChrome: () => latest.current.revealChrome(),
    })
  }, [registry])
}

function measure(node: TourMeasurable): Promise<TourRect | null> {
  return new Promise(resolve => {
    let settled = false
    const timer = setTimeout(() => { if (!settled) { settled = true; resolve(null) } }, 250)
    try {
      node.measureInWindow((x, y, width, height) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve({ x, y, width, height })
      })
    } catch {
      settled = true
      clearTimeout(timer)
      resolve(null)
    }
  })
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/** Web only: bring an off-screen (but rendered) target into view. */
function scrollIntoView(node: TourMeasurable): void {
  if (Platform.OS !== 'web') return
  const el = node as unknown as { scrollIntoView?: (opts: { block: string; inline: string }) => void }
  try { el.scrollIntoView?.({ block: 'center', inline: 'nearest' }) } catch { /* not a DOM node */ }
}

export function TourProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const { userId } = useSession()
  const nodes = useRef(new Map<string, Set<TourMeasurable>>())
  const shell = useRef<TourShell | null>(null)
  const run = useRef(0)

  const [tour, setTour] = useState<TourDef | null>(null)
  const [index, setIndex] = useState(0)
  const [rect, setRect] = useState<TourRect | null>(null)
  const tourRef = useRef<TourDef | null>(null)
  const indexRef = useRef(0)

  const registry = useMemo<Registry>(() => ({
    register(id, node) {
      let set = nodes.current.get(id)
      if (!set) nodes.current.set(id, (set = new Set()))
      set.add(node)
      return () => { set!.delete(node) }
    },
    setShell(next) {
      shell.current = next
      return () => { if (shell.current === next) shell.current = null }
    },
  }), [])

  /** The on-screen rect of target `id` (first visible registration), or the node to scroll to when it's off-screen. */
  const measureTarget = useCallback(async (id: string): Promise<{ rect: TourRect | null; offscreen: TourMeasurable | null }> => {
    const viewport = Dimensions.get('window')
    let offscreen: TourMeasurable | null = null
    for (const node of nodes.current.get(id) ?? []) {
      const r = await measure(node)
      if (isRectOnScreen(r, viewport)) return { rect: r, offscreen: null }
      if (r && r.width > 0 && r.height > 0) offscreen = node
    }
    return { rect: null, offscreen }
  }, [])

  const waitForTarget = useCallback(async (id: string, myRun: number): Promise<TourRect | null> => {
    const deadline = Date.now() + TARGET_WAIT_MS
    let scrolled = false
    for (;;) {
      const { rect: found, offscreen } = await measureTarget(id)
      if (found) return found
      if (offscreen && !scrolled) { scrollIntoView(offscreen); scrolled = true }
      if (Date.now() > deadline || myRun !== run.current) return null
      await sleep(TARGET_POLL_MS)
    }
  }, [measureTarget])

  const showTab = useCallback((key: TabKey) => {
    const i = tabIndexOf(key)
    if (shell.current) shell.current.showTab(i)
    else router.replace(TABS[i].path)
  }, [router])

  const finish = useCallback((completed: boolean) => {
    const current = tourRef.current
    if (current) {
      const step = indexRef.current
      if (completed) track(ANALYTICS_EVENTS.tourCompleted, { tour: current.id, step })
      else track(ANALYTICS_EVENTS.tourSkipped, { tour: current.id, step, target: current.steps[step]?.target ?? null })
    }
    run.current++
    tourRef.current = null
    setTour(null)
    setRect(null)
    if (current && completed) {
      // Recorded next to seen banners (device, and account when signed in). Nothing
      // auto-starts a tour yet; it's there for that, and tours can always be restarted.
      const doneId = tourCompletionId(current.id)
      markBannerSeenOnDevice(doneId)
      if (userId) void markBannerSeenOnAccount(userId, doneId)
    }
  }, [userId])

  /** Show the first step from `from` (walking `dir`) whose target can be found; skips the rest. */
  const showFrom = useCallback(async (def: TourDef, from: number, dir: 1 | -1) => {
    const myRun = ++run.current
    setRect(null)
    shell.current?.revealChrome()
    let foundRect: TourRect | null = null
    const found = await findShowableStep(def.steps.length, from, dir, async i => {
      if (myRun !== run.current) return true
      const step = def.steps[i]
      if (step.tab) showTab(step.tab)
      foundRect = await waitForTarget(step.target, myRun)
      return !!foundRect
    })
    if (myRun !== run.current) return
    if (found === null) {
      // Nothing further on: the tour is over. Nothing earlier: stay on the current step.
      if (dir === 1) finish(true)
      else void showFrom(def, indexRef.current, 1)
      return
    }
    indexRef.current = found
    setIndex(found)
    setRect(foundRect)
    track(ANALYTICS_EVENTS.tourStepViewed, { tour: def.id, step: found, target: def.steps[found].target })
  }, [finish, showTab, waitForTarget])

  const start = useCallback((id: TourId, source: TourSource = 'other') => {
    const def = TOURS[id]
    track(ANALYTICS_EVENTS.tourStarted, { tour: id, source })
    tourRef.current = def
    indexRef.current = 0
    setTour(def)
    setIndex(0)
    void showFrom(def, 0, 1)
  }, [showFrom])

  const stop = useCallback(() => { if (tourRef.current) finish(false) }, [finish])

  const next = useCallback(() => {
    const def = tourRef.current
    if (!def) return
    if (indexRef.current >= def.steps.length - 1) finish(true)
    else void showFrom(def, indexRef.current + 1, 1)
  }, [finish, showFrom])

  const back = useCallback(() => {
    const def = tourRef.current
    if (!def || indexRef.current === 0) return
    void showFrom(def, indexRef.current - 1, -1)
  }, [showFrom])

  // Follow the target while the step is open: scrolling, resizing, layout shifts.
  const targetId = tour && rect ? tour.steps[index]?.target : null
  useEffect(() => {
    if (!targetId) return
    let cancelled = false
    const update = async () => {
      const { rect: r } = await measureTarget(targetId)
      if (!cancelled && r) setRect(prev => (sameRect(prev, r) ? prev : r))
    }
    const timer = setInterval(() => void update(), REMEASURE_MS)
    const sub = Dimensions.addEventListener('change', () => void update())
    const onScroll = () => void update()
    if (Platform.OS === 'web' && typeof window !== 'undefined') window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      cancelled = true
      clearInterval(timer)
      sub.remove()
      if (Platform.OS === 'web' && typeof window !== 'undefined') window.removeEventListener('scroll', onScroll)
    }
  }, [targetId, measureTarget])

  const controls = useMemo<TourControls>(() => ({ start, stop, active: !!tour }), [start, stop, tour])

  return (
    <TourRegistryContext.Provider value={registry}>
      <TourControlsContext.Provider value={controls}>
        {children}
        {tour && (
          <TourOverlay
            step={tour.steps[index]}
            index={index}
            count={tour.steps.length}
            target={rect}
            onNext={next}
            onBack={back}
            onSkip={stop}
          />
        )}
      </TourControlsContext.Provider>
    </TourRegistryContext.Provider>
  )
}
