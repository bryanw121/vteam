import React from 'react'
import { useLocalSearchParams } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { lazyChunk } from '../LazyChunk'
import { EventDetailSkeleton } from './EventDetailSkeleton'
import { eventCardSeed } from '../../hooks/event/seed'

/**
 * Web: the event screen (with Reanimated and Gesture Handler for the host's
 * team drag) is its own chunk, so the entry bundle every visit downloads
 * doesn't carry them (#193). While it loads, the same skeleton the screen
 * shows, seeded from the tapped feed card when there is one.
 */
function EventDetailFallback() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const insets = useSafeAreaInsets()
  return <EventDetailSkeleton seed={eventCardSeed(id)} topInset={insets.top} />
}

const loadEventDetail = () => import('./EventDetailScreen')

// Most visits open an event, so fetch its chunk once the page has loaded and
// the browser is idle: the first tap on a card then doesn't wait for it.
// A shared /event/<id> link starts it right away through the route itself.
if (typeof window !== 'undefined') {
  const whenIdle = (fn: () => void) =>
    'requestIdleCallback' in window ? window.requestIdleCallback(fn, { timeout: 5000 }) : setTimeout(fn, 1)
  const preload = () => setTimeout(() => whenIdle(() => { void loadEventDetail().catch(() => {}) }), 3000)
  if (document.readyState === 'complete') preload()
  else window.addEventListener('load', preload, { once: true })
}

export default lazyChunk(loadEventDetail, <EventDetailFallback />)
