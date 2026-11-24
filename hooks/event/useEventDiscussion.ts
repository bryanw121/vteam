import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ScrollViewInstance } from 'react-native'
import { useEventComments } from './useEventComments'
import { useKeyboardInset } from './useKeyboardInset'
import { mentionTargets } from '../../utils/eventDetail'
import type { EventData, Profile } from '../../types'

/**
 * The Discussion tab's comments and chat-style scroll (#354): pinned to the
 * bottom when the tab opens, a comment arrives or is posted, the composer grows
 * or the keyboard opens. Keyed on the newest comment, not the count, so "Load
 * earlier" (which prepends) doesn't jump to the bottom. Also who can be @mentioned.
 */
export function useEventDiscussion(data: EventData, opts: { isHostOrCohost: boolean; active: boolean }) {
  const mentions = useDiscussionMentions(data, data.userId)
  const scrollRef = useRef<ScrollViewInstance>(null)
  const [composerHeight, setComposerHeight] = useState(0)
  const keyboardInset = useKeyboardInset(opts.active)
  const scrollToBottom = useCallback((animated: boolean) => {
    // scrollToEnd can fail before layout; delay a frame.
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated }))
  }, [])
  const discussion = useEventComments(data, { isHostOrCohost: opts.isHostOrCohost, onPosted: () => scrollToBottom(true) })
  useEffect(() => {
    if (keyboardInset <= 0) return
    const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 64)
    return () => clearTimeout(t)
  }, [keyboardInset])
  const newestCommentId = data.comments[data.comments.length - 1]?.id
  useEffect(() => {
    if (opts.active) scrollToBottom(false)
  }, [opts.active, newestCommentId, composerHeight, scrollToBottom])

  // Named as DiscussionTab's props, so the screen spreads them.
  return { discussion, scrollRef, keyboardInset, scrollToBottom, onComposerLayout: setComposerHeight, ...mentions }
}

/** @mentions in the discussion: attendees, co-hosts and the host, not the viewer (`mentionTargets`). */
export function useDiscussionMentions(data: EventData, userId: string | null) {
  const { roster, cohosts, event } = data
  return useMemo(
    () => mentionTargets([...roster.attendees, ...cohosts.map(c => c.profiles as Profile), event?.profiles as Profile | undefined], userId),
    [roster.attendees, cohosts, event, userId],
  )
}
