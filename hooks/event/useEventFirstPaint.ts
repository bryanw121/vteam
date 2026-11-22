import { useEffect } from 'react'
import { Platform } from 'react-native'
import { landedOnEventPage, msSinceOpen, track } from '../../lib/analytics'
import { ANALYTICS_EVENTS } from '../../constants/analytics'
import { browserAgent, isBotAgent } from '../../utils/botAgent'
import type { AnalyticsProps } from '../../types'

let tracked = false

/** Did the page's <head> preload the event screen's chunk (api/event-page.ts, #347)? */
function pagePreloadedChunk(): boolean {
  try {
    return typeof document !== 'undefined' && !!document.querySelector('link[rel="preload"][href*="EventDetailScreen-"]')
  } catch {
    return false
  }
}

/** Did the event come inside the page (#244)? */
function pageSeeded(): boolean {
  try {
    return typeof document !== 'undefined' && !!document.getElementById('vteam-event-seed')
  } catch {
    return false
  }
}

/**
 * event_first_paint (#347): how long a web launch that opened on an event page (a shared link)
 * took to show the event, since the page was first on screen, and whether the page preloaded
 * the screen's code. Once per launch; nothing for in-app navigation or native.
 */
export function useEventFirstPaint(shown: boolean): void {
  useEffect(() => {
    if (!shown || tracked || Platform.OS !== 'web' || !landedOnEventPage()) return
    tracked = true
    const ms = msSinceOpen()
    if (ms === null) return
    const props: AnalyticsProps = { ms, preloaded: pagePreloadedChunk(), seeded: pageSeeded() }
    if (isBotAgent(browserAgent())) props.bot = true
    track(ANALYTICS_EVENTS.eventFirstPaint, props)
  }, [shown])
}

/** Test hook. */
export function __resetEventFirstPaint(): void {
  tracked = false
}
