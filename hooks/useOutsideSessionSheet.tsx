import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useUrlParam } from './useUrlParam'
import { useOutsideSession } from './useOutsideSession'
import { useAlsoOn } from './useAlsoOn'
import { OutsideSessionSheet } from '../components/events/OutsideSessionSheet'
import { VIEW } from '../utils/urlViews'
import { track } from '../lib/analytics'
import { toast } from '../lib/toast'
import { ANALYTICS_EVENTS } from '../constants/analytics'
import { OUTSIDE_SESSION_COPY } from '../constants/copy'
import type { EventWithDetails, ExternalSession } from '../types'

type Options = {
  /** The loaded feed (outside sessions carry `_external`). */
  events?: readonly EventWithDetails[]
  /** Or the sessions themselves (search results). */
  sessions?: readonly ExternalSession[]
  /** The feed's ⋯ menu for an item (useFeedHiding); absent: no Hide in the sheet. */
  onHide?: (item: EventWithDetails) => void
  /** Keep the session in the address (`/?session=<id>`, the Events tab) or only in memory (search). */
  inUrl?: boolean
  /** For `outside_session_opened`. */
  source?: 'card' | 'search'
}

/**
 * The outside session sheet for a screen (#348): `openSession` for the cards, and the sheet
 * itself to render once. On Events the open session is in the URL, so a shared link opens it;
 * a link to a session that is gone (past, cancelled, never listed) shows the feed and a toast.
 */
const NO_EVENTS: readonly EventWithDetails[] = []

export function useOutsideSessionSheet({ events = NO_EVENTS, sessions: given, onHide, inUrl = true, source = 'card' }: Options) {
  const [urlId, setUrlId] = useUrlParam('session', VIEW.feed.session, { tab: 'events' })
  const [memoryId, setMemoryId] = useState('')
  const id = inUrl ? urlId : memoryId
  const setId = useCallback((next: string) => {
    if (inUrl) setUrlId(next)
    else setMemoryId(next)
  }, [inUrl, setUrlId])

  const sessions = useMemo(
    () => given ?? events.flatMap(e => (e._external ? [e._external] : [])),
    [given, events],
  )
  const { session, missing } = useOutsideSession(id, sessions)

  // A link's session: counted once, when it shows.
  const counted = useRef<string | null>(null)
  const openedHere = useRef(false)
  useEffect(() => {
    if (!session || counted.current === session.id) return
    counted.current = session.id
    track(ANALYTICS_EVENTS.outsideSessionOpened, {
      surface: session.surface ?? 'none', has_note: !!session.note?.trim(), source: openedHere.current ? source : 'link',
    })
    openedHere.current = false
  }, [session, source])

  useEffect(() => {
    if (!missing) return
    toast.show({ message: OUTSIDE_SESSION_COPY.gone, variant: 'info' })
    setId('')
  }, [missing, setId])

  const openSession = useCallback((s: ExternalSession) => {
    openedHere.current = true
    setId(s.id)
  }, [setId])

  // Hide opens the feed's hide menu, another Modal: only once this sheet has closed (iOS).
  const pendingHide = useRef<EventWithDetails | null>(null)
  const hide = useMemo(() => {
    if (!onHide || !session) return undefined
    const item = events.find(e => e._external?.id === session.id)
    if (!item) return undefined
    return () => { pendingHide.current = item; setId('') }
  }, [onHide, session, events, setId])
  const onClosed = useCallback(() => {
    const item = pendingHide.current
    pendingHide.current = null
    if (item && onHide) onHide(item)
  }, [onHide])

  const others = useAlsoOn(session, sessions)

  const sheet = (
    <OutsideSessionSheet
      session={session}
      alsoOn={others}
      onPickOther={s => { openedHere.current = true; setId(s.id) }}
      onDismiss={() => setId('')}
      onHide={hide}
      onClosed={onClosed}
    />
  )
  return { openSession, sheet }
}
