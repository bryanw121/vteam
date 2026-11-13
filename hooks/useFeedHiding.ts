/**
 * Hiding on the Events feed (#217 part 3): which items this player hid, the
 * ⋯ menu's target and options, hide / unhide with an Undo toast, and which
 * days or months show their hidden items. Moved as is from the Events screen.
 */
import { useCallback, useMemo, useState } from 'react'
import { useSession } from '../contexts/session'
import { toast } from '../lib/toast'
import { useHiddenFeed } from './useHiddenFeed'
import { myStatusFor } from './useMyUpcomingEvents'
import { useRequireSignIn } from './useRequireSignIn'
import { hiddenIndex, hideOptions, isHidden, matchingEntries } from '../utils/hiddenFeed'
import type { EventWithDetails, FeedHiding, HiddenFeedEntry, HideFeedOption } from '../types'

export function useFeedHiding(): FeedHiding {
  const { userId } = useSession()
  const requireSignIn = useRequireSignIn()
  const hiddenFeed = useHiddenFeed()
  const hiddenIdx = useMemo(() => hiddenIndex(hiddenFeed.entries), [hiddenFeed.entries])
  // Days (mobile) or months (desktop) whose hidden items are shown, dimmed.
  const [revealedKeys, setRevealedKeys] = useState<ReadonlySet<string>>(() => new Set())
  const [hideTarget, setHideTarget] = useState<EventWithDetails | null>(null)

  // "Hidden: …" with Undo (shared toast, #228).
  const showHideToast = useCallback((message: string, undo: HiddenFeedEntry[]) => {
    toast.show({ message, variant: 'info', duration: 5000, action: { label: 'Undo', onPress: () => hiddenFeed.restore(undo) } })
  }, [hiddenFeed])

  // Games the player is going to, waitlisted for or hosting always show.
  const isHiddenForMe = useCallback(
    (event: EventWithDetails) => isHidden(event, hiddenIdx) && !(userId && myStatusFor(event, userId) !== null),
    [hiddenIdx, userId],
  )

  const toggleReveal = useCallback((key: string) => {
    setRevealedKeys(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const openHideMenu = useCallback((event: EventWithDetails) => {
    if (!userId) { requireSignIn(); return }
    setHideTarget(event)
  }, [userId, requireSignIn])

  const closeHideMenu = useCallback(() => setHideTarget(null), [])

  const pickHideOption = useCallback((option: HideFeedOption) => {
    const before = hiddenFeed.entries
    setHideTarget(null)
    hiddenFeed.hide(option.entry)
    showHideToast(`Hidden: ${option.entry.label}`, before)
  }, [hiddenFeed, showHideToast])

  const unhideItem = useCallback((event: EventWithDetails) => {
    const before = hiddenFeed.entries
    const matches = matchingEntries(event, before)
    if (matches.length === 0) return
    hiddenFeed.restore(before.filter(e => !matches.includes(e)))
    showHideToast(`Showing again: ${matches.map(m => m.label).join(', ')}`, before)
  }, [hiddenFeed, showHideToast])

  const hideOptionsFor = useMemo(
    () => (hideTarget ? hideOptions(hideTarget, userId) : []),
    [hideTarget, userId],
  )

  return {
    anyHidden: hiddenIdx.size > 0, isHiddenForMe, revealedKeys, toggleReveal,
    hideTarget, hideOptionsFor, openHideMenu, closeHideMenu, pickHideOption, unhideItem,
  }
}
