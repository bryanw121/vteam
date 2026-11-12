import { useCallback, useEffect, useRef, useState } from 'react'
import { useSession } from '../contexts/session'
import { loadSeenBanners, markBannerSeenOnDevice } from '../utils/seenBanners'
import { markBannerSeenOnAccount, useUserSettings } from './useUserSettings'
import { track } from '../lib/analytics'
import { ANALYTICS_EVENTS } from '../constants/analytics'
import type { BannerDef } from '../types'

/**
 * Show `banner` only the first time this person opens the screen. The decision
 * is made once per mount: if neither the device nor (when signed in) the account
 * has seen it, it becomes visible and is recorded as seen straight away, so it
 * never comes back even if they don't dismiss it. `dismiss` just hides it.
 */
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
      if (seenOnDevice.has(banner.id) || settings?.seen_banners?.includes(banner.id)) return
      setVisible(true)
      track(ANALYTICS_EVENTS.bannerShown, { banner: banner.id })
      markBannerSeenOnDevice(banner.id)
      if (userId) void markBannerSeenOnAccount(userId, banner.id)
    })
    return () => { cancelled = true }
  }, [banner.id, userId, sessionLoading, settingsLoading, settings])

  const dismiss = useCallback(() => setVisible(false), [])
  return { visible, dismiss }
}
