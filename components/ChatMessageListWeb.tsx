// Web only: loaded lazily by ChatMessageList.web.tsx (its own chunk, #193). Native uses ChatMessageList.tsx.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, View } from 'react-native'
import { Text } from './ui/Text'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Virtuoso } from 'react-virtuoso'
import type { VirtuosoHandle } from 'react-virtuoso'
import { RefreshControl } from './RefreshControl'
import { shared, theme } from '../constants'
import type { ChatMessageListProps, MessageWithDetails } from '../types'
import { nextFirstItemIndex } from '../utils/chatUtils'
import { Spinner } from './ui/Spinner'

/**
 * Virtuoso needs a positive, stable index for the first item that only goes
 * DOWN when older items are prepended (that is how it keeps the scroll
 * position). Start high so years of history never reach 0.
 */
const FIRST_INDEX_BASE = 1_000_000

/**
 * How close to the bottom (px) still counts as "at the bottom". Generous: a row
 * measured after it was scrolled to (images, wrapped text) can leave the list
 * a little short of the true end, and that reader is still "at the bottom".
 */
const AT_BOTTOM_PX = 120

/** Start loading the older page this far (px) before the very top. */
const AT_TOP_PX = 200

/** A typical one-line bubble with its meta row; closer estimates mean less settling. */
const ESTIMATED_ROW_PX = 64

type EdgeContext = { hasMore: boolean }

function Header({ context }: { context?: EdgeContext }) {
  return (
    <View style={shared.chatListEdge}>
      {context?.hasMore ? <Spinner size="small" color={theme.colors.subtext} /> : null}
    </View>
  )
}

function Footer() {
  return <View style={shared.chatListEdge} />
}

const COMPONENTS = { Header, Footer }

const keyOf = (_index: number, m: MessageWithDetails) => m.id

/**
 * Web message list (#3), virtualized with react-virtuoso: only the rows near
 * the viewport are in the DOM.
 *
 * - Opens at the newest message on the first paint (`initialTopMostItemIndex`
 *   LAST/end), so there is no scroll-to-end flash.
 * - Follows new messages only while the reader is at the bottom; otherwise a
 *   "New messages" pill appears. The viewer's own send always scrolls down.
 * - Scrolling to the top loads the older page; `firstItemIndex` keeps the
 *   reader's position while it is prepended.
 */
export function ChatMessageList({
  messages, myId, renderMessage, hasMore, onLoadMore, refreshing, onRefresh, onUserDrag,
}: ChatMessageListProps) {
  const virtuosoRef = useRef<VirtuosoHandle>(null)
  /**
   * Instant (not smooth) jump, repeated next frame: rows below the old window
   * are only measured once rendered, so the first jump can land short of the end.
   */
  const scrollToNewest = useCallback(() => {
    const go = () => virtuosoRef.current?.scrollToIndex({ index: 'LAST', align: 'end', behavior: 'auto' })
    go()
    requestAnimationFrame(() => requestAnimationFrame(go))
  }, [])
  const ascending = useMemo(() => [...messages].reverse(), [messages])

  const indexRef = useRef<{ firstId: string | null; firstIndex: number }>({ firstId: null, firstIndex: FIRST_INDEX_BASE })
  const firstItemIndex = useMemo(() => {
    const firstIndex = nextFirstItemIndex(indexRef.current, ascending)
    indexRef.current = { firstId: ascending[0]?.id ?? null, firstIndex }
    return firstIndex
  }, [ascending])

  // ── At-bottom tracking + "New messages" pill ──────────────────────────────
  const atBottomRef = useRef(true)
  const [unseen, setUnseen] = useState(0)
  const onAtBottom = useCallback((atBottom: boolean) => {
    atBottomRef.current = atBottom
    if (atBottom) setUnseen(0)
  }, [])

  const newest = messages[0]
  const newestIdRef = useRef(newest?.id ?? null)
  useEffect(() => {
    if (!newest || newest.id === newestIdRef.current) return
    newestIdRef.current = newest.id
    if (newest.sender_id === myId) {
      // Your own message: always bring it into view.
      scrollToNewest()
      setUnseen(0)
    } else if (!atBottomRef.current) {
      setUnseen(n => n + 1)
    }
  }, [newest, myId, scrollToNewest])

  const jumpToNewest = useCallback(() => {
    scrollToNewest()
    setUnseen(0)
  }, [scrollToNewest])

  // Hidden until the first rows are measured and pinned to the end, so the
  // estimate-then-measure settling of the opening frames is never seen.
  const [revealed, setRevealed] = useState(false)
  const onItemsRendered = useCallback((items: unknown[]) => {
    if (revealed || items.length === 0) return
    scrollToNewest()
    requestAnimationFrame(() => requestAnimationFrame(() => setRevealed(true)))
  }, [revealed, scrollToNewest])

  // Rows are first laid out at an estimated height and then measured (and
  // images load later). While the reader is at the bottom, keep the newest row
  // pinned there through those height changes; once they scroll up, leave them be.
  const onTotalHeightChanged = useCallback(() => {
    if (atBottomRef.current) virtuosoRef.current?.scrollToIndex({ index: 'LAST', align: 'end', behavior: 'auto' })
  }, [])

  const followOutput = useCallback((isAtBottom: boolean) => (isAtBottom ? 'auto' as const : false), [])
  const startReached = useCallback(() => {
    if (hasMore) onLoadMore()
  }, [hasMore, onLoadMore])

  // startReached fires once per arrival at the top. If that call was dropped
  // (a page already in flight, e.g. a reconnect refresh), a reader parked at
  // the top would never get older messages. So while the top is in view, ask
  // again whenever the list changes (the in-flight page landed) — `loadMore`
  // ignores calls while one is pending. After a prepend the reader is no
  // longer at the top (firstItemIndex keeps their place), so this can't chain.
  // The scroller's real offset is checked (not just the atTop flag, which lags a
  // prepend by a frame and would fetch one page too many).
  const [atTop, setAtTop] = useState(false)
  const scrollerRef = useRef<HTMLElement | null>(null)
  const setScroller = useCallback((el: HTMLElement | Window | null) => {
    scrollerRef.current = el instanceof HTMLElement ? el : null
  }, [])
  useEffect(() => {
    if (!atTop || !hasMore) return
    // Virtuoso shifts the scroll offset for a prepend a frame or two after the
    // data changes; check after that, or a just-prepended page reads as "still
    // at the top" and fetches one page too many.
    let raf = requestAnimationFrame(() => {
      raf = requestAnimationFrame(() => {
        const el = scrollerRef.current
        if (el && el.scrollTop <= AT_TOP_PX) onLoadMore()
      })
    })
    return () => cancelAnimationFrame(raf)
  }, [atTop, hasMore, messages.length, onLoadMore])
  // The View (display: flex) contains the bubble's vertical margins; Virtuoso's
  // item div is a plain block, so margins would collapse through it and go
  // unmeasured, leaving "scroll to end" short of the real end.
  const itemContent = useCallback(
    (_index: number, item: MessageWithDetails) => <View>{renderMessage(item)}</View>,
    [renderMessage],
  )
  const context = useMemo<EdgeContext>(() => ({ hasMore }), [hasMore])

  return (
    <View style={{ flex: 1, minHeight: 0 }}>
      <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} style={{ flex: 1, minHeight: 0 }}>
        <Virtuoso<MessageWithDetails, EdgeContext>
          ref={virtuosoRef}
          data={ascending}
          context={context}
          computeItemKey={keyOf}
          itemContent={itemContent}
          components={COMPONENTS}
          firstItemIndex={firstItemIndex}
          initialTopMostItemIndex={{ index: 'LAST', align: 'end' }}
          alignToBottom
          followOutput={followOutput}
          atBottomStateChange={onAtBottom}
          atBottomThreshold={AT_BOTTOM_PX}
          startReached={startReached}
          atTopStateChange={setAtTop}
          scrollerRef={setScroller}
          atTopThreshold={AT_TOP_PX}
          itemsRendered={onItemsRendered}
          totalListHeightChanged={onTotalHeightChanged}
          defaultItemHeight={ESTIMATED_ROW_PX}
          increaseViewportBy={{ top: 400, bottom: 200 }}
          onTouchMove={onUserDrag}
          data-testid="chat-message-list"
          style={{ height: '100%', overscrollBehavior: 'contain', opacity: revealed ? 1 : 0 }}
        />
      </RefreshControl>
      {unseen > 0 ? (
        <Pressable
          onPress={jumpToNewest}
          accessibilityRole="button"
          accessibilityLabel={unseen === 1 ? '1 new message, jump to newest' : `${unseen} new messages, jump to newest`}
          testID="chat-new-messages-pill"
          style={shared.chatNewMessagesPill}
        >
          <Text style={shared.chatNewMessagesLabel}>{unseen === 1 ? '1 new message' : `${unseen} new messages`}</Text>
          <Ionicons name="arrow-down" size={16} color={theme.colors.onPrimary} />
        </Pressable>
      ) : null}
    </View>
  )
}
