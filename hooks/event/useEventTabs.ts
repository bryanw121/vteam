import { useCallback, useEffect, useRef, useState } from 'react'
import { Platform } from 'react-native'
import type { ScrollViewInstance } from 'react-native'
import { setDocScrollClaim } from '../../lib/docScroll'
import { useUrlParam } from '../useUrlParam'
import { VIEW } from '../../utils/urlViews'
import { useKeyboardInset } from './useKeyboardInset'

export const EVENT_TAB = { details: 0, people: 1, discussion: 2, cheers: 3 } as const

/**
 * The event screen's tabs: the one in the URL (`?tab=people`), each mounted on first
 * visit (People along with Details), and on phone web the document scrolls for
 * Details and People (Discussion and Cheers keep the app-shell layout so the composer
 * stays at the bottom). CSS for body.doc-scroll lives in app/+html.tsx.
 */
export function useEventTabs(isMobileWeb: boolean) {
  const [activeTab, setActiveTab] = useUrlParam('tab', VIEW.event.tab)
  const [mountedTabs, setMountedTabs] = useState(() => {
    const initial = new Set<number>([EVENT_TAB.details, activeTab])
    if (activeTab === EVENT_TAB.details) initial.add(EVENT_TAB.people)
    return initial
  })
  useEffect(() => {
    setMountedTabs(prev => (prev.has(activeTab) ? prev : new Set(prev).add(activeTab)))
  }, [activeTab])

  const docScrollActive = isMobileWeb && (activeTab === EVENT_TAB.details || activeTab === EVENT_TAB.people)
  useEffect(() => {
    if (Platform.OS !== 'web') return
    setDocScrollClaim('event-detail', docScrollActive)
    return () => setDocScrollClaim('event-detail', false)
  }, [docScrollActive])
  useEffect(() => {
    if (docScrollActive) window.scrollTo(0, 0)
  }, [activeTab]) // eslint-disable-line react-hooks/exhaustive-deps

  return { activeTab, setActiveTab, mountedTabs, docScrollActive }
}

/**
 * Discussion scrolls like a chat: pinned to the newest comment, and back to the bottom
 * when the keyboard opens or the composer grows. Keyed on the newest comment, not the
 * count, so "Load earlier" (which prepends) doesn't jump.
 */
export function useDiscussionScroll(active: boolean, newestCommentId: string | undefined) {
  const scrollRef = useRef<ScrollViewInstance>(null)
  const [composerHeight, setComposerHeight] = useState(0)
  const keyboardInset = useKeyboardInset(active)
  const scrollToBottom = useCallback((animated: boolean) => {
    // scrollToEnd can fail before layout; delay a frame.
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated }))
  }, [])
  useEffect(() => {
    if (keyboardInset <= 0) return
    const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 64)
    return () => clearTimeout(t)
  }, [keyboardInset])
  useEffect(() => {
    if (active) scrollToBottom(false)
  }, [active, newestCommentId, composerHeight, scrollToBottom])
  return { scrollRef, scrollToBottom, keyboardInset, setComposerHeight }
}
