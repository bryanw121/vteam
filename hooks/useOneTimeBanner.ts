import { useCallback, useEffect, useRef, useState } from 'react'
import { useSession } from '../contexts/session'
import { loadSeenBanners, markBannerSeenOnDevice } from '../utils/seenBanners'
import { markBannerSeenOnAccount, useUserSettings } from './useUserSettings'
import { track } from '../lib/analytics'
import { ANALYTICS_EVENTS } from '../constants/analytics'
import type { BannerDef } from '../types'

/**
 * When each banner was shown (and not dismissed) in this page load. A screen can
 * remount right after first paint (on a phone, a saved feed filter written to the
 * address does), and the banner was already recorded as seen by then: without
 * this it would vanish before anyone could read it. Only a remount this soon
 * keeps it; coming back to the screen later is a new visit, and it stays gone.
 */
const shownThisLoad = new Map<string, number>()
const REMOUNT_GRACE_MS = 5000

/**
 * Show `banner` only the first time this person opens the screen. The decision
 * is made once per mount: if neither the device nor (when signed in) the account
 * has seen it, it becomes visible and is recorded as seen straight away, so it
 * never comes back even if they don't dismiss it. `dismiss` just hides it.
 */
/** Tests only. */
export function __resetShownBanners(): void { shownThisLoad.clear() }

export function useOneTimeBanner(banner: BannerDef): { visible: boolean; dismiss: () => void } {
  const { userId, loading: sessionLoading } = useSession()
  const { settings, isLoading: settingsLoading } = useUserSettings()
  const [visible, setVisible] = useState(false)
  const decided = useRef(false)

  useEffect(() => {
    if (decided.current || sessionLoading) return
    // Signed in: wait for the account's list so another device's "seen" counts.
    if (userId && settingsLoading) return
    let cancelled = false
    void loadSeenBanners().then(seenOnDevice => {
      if (cancelled || decided.current) return
      decided.current = true
      const shownAt = shownThisLoad.get(banner.id)
      if (shownAt !== undefined && Date.now() - shownAt < REMOUNT_GRACE_MS) { setVisible(true); return }
      if (seenOnDevice.has(banner.id) || settings?.seen_banners?.includes(banner.id)) return
      setVisible(true)
      shownThisLoad.set(banner.id, Date.now())
      track(ANALYTICS_EVENTS.bannerShown, { banner: banner.id })
      markBannerSeenOnDevice(banner.id)
      if (userId) void markBannerSeenOnAccount(userId, banner.id)
    })
    return () => { cancelled = true }
  }, [banner.id, userId, sessionLoading, settingsLoading, settings])

  const dismiss = useCallback(() => {
    shownThisLoad.delete(banner.id)
    setVisible(false)
  }, [banner.id])
  return { visible, dismiss }
}
