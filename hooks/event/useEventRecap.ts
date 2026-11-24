import { useEffect, useRef, useState } from 'react'
import { useMyGameRecap } from '../useMyGameRecap'
import { useHostNextGame } from '../useHostNextGame'
import { useUrlParam } from '../useUrlParam'
import { VIEW } from '../../utils/urlViews'
import { pointsForEvent, recapEligible, recapImagePath } from '../../utils/recap'
import { shareRecap } from '../../utils/shareRecap'
import { shareUrl } from '../../constants/share'
import { routes } from '../../utils/routes'
import { ANALYTICS_EVENTS } from '../../constants/analytics'
import { track } from '../../lib/analytics'
import { toast } from '../../lib/toast'
import type { EventAttendeeWithProfile, EventWithDetails } from '../../types'

/**
 * Game recap (#227, #354: out of the screen): a finished game shows "Your game"
 * to players who attended, and the host's next game to everyone. Records
 * `recap_shown` once per event and `recap_link_opened` once for a `?r=1` link.
 */
export function useEventRecap(opts: {
  eventId: string
  userId: string | null
  event: EventWithDetails | undefined
  rows: EventAttendeeWithProfile[]
  over: boolean
}) {
  const { eventId, userId, event, rows, over } = opts
  const myRow = rows.find(r => r.user_id === userId) ?? null
  const attended = over && recapEligible(myRow)
  const recap = useMyGameRecap(eventId, userId, event?.event_date ?? null, attended)
  const hostNext = useHostNextGame(event?.created_by ?? null, over && !event?.cancelled_at)
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

  return { attended, recap, hostNext, points, sharing, share }
}
