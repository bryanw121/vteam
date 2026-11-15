import React from 'react'
import { useLocalSearchParams } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { lazyChunk, preloadWhenIdle } from '../LazyChunk'
import { EventDetailSkeleton } from './EventDetailSkeleton'
import { EventHeaderActions } from './EventHeaderActions'
import { eventCardSeed } from '../../hooks/event/seed'
import { useEventBack } from '../../hooks/event/useEventBack'

const noop = () => {}

/**
 * Web: the event screen (with Reanimated and Gesture Handler for the host's
 * team drag) is its own chunk, so the entry bundle every visit downloads
 * doesn't carry them (#193). While it loads, the same header row (Back works,
 * Share uses the tapped card's title) and skeleton the screen shows, seeded from
 * the tapped feed card when there is one, so nothing moves when it arrives (#306).
 */
function EventDetailFallback() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const insets = useSafeAreaInsets()
  const goBack = useEventBack()
  const seed = eventCardSeed(id)
  return (
    <>
      <EventHeaderActions
        eventId={id}
        title={seed?.title}
        eventDate={seed?.event_date}
        canManage={false}
        deleting={false}
        onBack={goBack}
        onEdit={noop}
        onDelete={noop}
      />
      <EventDetailSkeleton seed={seed} topInset={insets.top} />
    </>
  )
}

const loadEventDetail = () => import('./EventDetailScreen')

// Most visits open an event: fetch its chunk when the browser is idle after
// load, so the first tap on a card doesn't wait for it. A shared /event/<id>
// link starts it right away through the route itself.
preloadWhenIdle(loadEventDetail)

export default lazyChunk(loadEventDetail, <EventDetailFallback />)
