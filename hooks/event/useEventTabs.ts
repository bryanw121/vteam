import { useEffect, useState } from 'react'
import { Platform } from 'react-native'
import { setDocScrollClaim } from '../../lib/docScroll'
import { useUrlParam } from '../useUrlParam'
import { VIEW } from '../../utils/urlViews'
import { courtQueueOffered } from '../../utils/courtQueue'
import { EVENT_TAB, initialMountedTabs, usesDocScroll } from '../../utils/eventDetail'
import { eventDateMs, isEventOver } from './derive'
import { useEventCheers } from './useEventCheers'
import { useCourtQueue } from './useCourtQueue'
import type { EventData } from '../../types'

/**
 * The event screen's tabs (#354): the active tab lives in the URL (`?tab=people`;
 * older `?tab=1` links still work), each tab mounts on its first visit (People is
 * prefetched next to Details, and around game time its court queue (#333) loads
 * with the event, so the card is in place instead of pushing the roster down),
 * and on mobile web Details and People scroll the document (`body.doc-scroll`,
 * CSS in app/+html.tsx) while Discussion and Cheers keep the app-shell layout with
 * a bottom-anchored composer. Leaving Cheers drops its unsent draft.
 */
export function useEventTabs(data: EventData, isMobileWeb: boolean) {
  const { id, userId, event } = data
  const [activeTab, setActiveTab] = useUrlParam('tab', VIEW.event.tab)
  const [mountedTabs, setMountedTabs] = useState(() => initialMountedTabs(activeTab))
  useEffect(() => {
    setMountedTabs(prev => (prev.has(activeTab) ? prev : new Set(prev).add(activeTab)))
  }, [activeTab])

  useCourtQueue(id, { enabled: !!event && courtQueueOffered(eventDateMs(event.event_date), event.duration_minutes, !!event.cancelled_at) })
  const cheers = useEventCheers(id, userId, activeTab === EVENT_TAB.cheers && isEventOver(event))
  const selectTab = (next: number) => {
    if (next !== EVENT_TAB.cheers) cheers.clearDraft()
    setActiveTab(next)
  }

  // This page manages body.doc-scroll itself, since the tabs shell can't see the inner tab state.
  const docScrollActive = usesDocScroll(isMobileWeb, activeTab)
  useEffect(() => {
    if (Platform.OS !== 'web') return
    setDocScrollClaim('event-detail', docScrollActive)
    return () => setDocScrollClaim('event-detail', false)
  }, [docScrollActive])
  useEffect(() => {
    if (docScrollActive) window.scrollTo(0, 0)
  }, [activeTab]) // eslint-disable-line react-hooks/exhaustive-deps

  return { activeTab, selectTab, mountedTabs, docScrollActive, cheers }
}
