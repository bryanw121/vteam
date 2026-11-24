import { useEffect, useRef, useState } from 'react'
import { ANALYTICS_EVENTS } from '../../constants/analytics'
import { shareUrl } from '../../constants/share'
import { track } from '../../lib/analytics'
import { toast } from '../../lib/toast'
import type { EventAttendeeWithProfile, EventWithDetails } from '../../types'
import { pointsForEvent, recapEligible, recapImagePath } from '../../utils/recap'
import { routes } from '../../utils/routes'
import { shareRecap } from '../../utils/shareRecap'
import { useUrlParam } from '../useUrlParam'
import { VIEW } from '../../utils/urlViews'
import { useHostNextGame } from '../useHostNextGame'
import { useMyGameRecap } from '../useMyGameRecap'

/**
 * A finished game (#227): whether the viewer played (so gets "Your game" and Share),
 * their numbers, the host's next game, and sharing. Counts `recap_shown` once per
 * event and `recap_link_opened` once when the page was opened from a shared recap (`?r=1`).
 */
export function useEventRecap(eventId: string, event: EventWithDetails | null | undefined, userId: string | null, eventOver: boolean, rows: readonly EventAttendeeWithProfile[]) {
  const myRow = rows.find(r => r.user_id === userId) ?? null
  const attended = eventOver && recapEligible(myRow)
  const recap = useMyGameRecap(eventId, userId, event?.event_date ?? null, attended)
  const hostNext = useHostNextGame(event?.created_by ?? null, eventOver && !event?.cancelled_at)
  const [sharing, setSharing] = useState(false)
  const points = event ? pointsForEvent((event.event_tags ?? []).map(t => t.tags?.name ?? '')) : 0

  const shownFor = useRef<string | null>(null)
  useEffect(() => {
    if (attended && shownFor.current !== eventId) { shownFor.current = eventId; track(ANALYTICS_EVENTS.recapShown, {}) }
  }, [attended, eventId])

  const [fromRecap] = useUrlParam('r', VIEW.event.r)
  const openCounted = useRef(false)
  useEffect(() => {
    if (fromRecap && !openCounted.current) { openCounted.current = true; track(ANALYTICS_EVENTS.recapLinkOpened, {}) }
  }, [fromRecap])

  async function share() {
    if (!event || !userId || sharing) return
    setSharing(true)
    try {
      const target = await shareRecap({
        imageUrl: shareUrl(recapImagePath(event.id, userId, String(recap.data?.cheers ?? 0))),
        text: `I played ${event.title || 'volleyball'} on vteam.`,
        link: shareUrl(routes.event(event.id, { r: true })),
      })
      if (target) track(ANALYTICS_EVENTS.recapShared, { target })
    } catch (e) {
      toast.error("Couldn't share your game", e)
    } finally {
      setSharing(false)
    }
  }

  return { attended, recap: recap.data ?? null, hostNext: hostNext.data ?? null, points, sharing, share }
}
