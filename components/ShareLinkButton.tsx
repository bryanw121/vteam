import React, { useEffect, useRef, useState } from 'react'
import { Platform, Share } from 'react-native'
import { IconButton } from './ui'
import { shareUrl } from '../constants/share'
import { ANALYTICS_EVENTS } from '../constants/analytics'
import { track } from '../lib/analytics'

type Props = {
  /** The in-app path of the view to share, built with `routes.*` (filters included). */
  path: string
  /** What the link is, for the share sheet ("Zilker Sand Classic on vteam"). */
  title: string
  /** For metrics: which screen shared. */
  screen: string
  /** Whether the link carries filters or a tab (metrics only). */
  filtered?: boolean
  testID?: string
}

/**
 * Share the screen's current view as an https link to the web app (`shareUrl`).
 * Native opens the OS share sheet; the web uses the browser's share sheet where
 * there is one (phones) and otherwise copies the link, showing a check for two seconds.
 * The event page has its own share menu (EventHeaderActions).
 */
export function ShareLinkButton({ path, title, screen, filtered = false, testID }: Props) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])
  const link = shareUrl(path)

  async function onPress() {
    try {
      if (Platform.OS !== 'web') {
        await Share.share(Platform.OS === 'ios' ? { message: title, url: link } : { message: `${title}\n${link}` })
        track(ANALYTICS_EVENTS.linkShared, { screen, how: 'share', filtered })
        return
      }
      const nav = typeof navigator !== 'undefined' ? navigator : undefined
      const touch = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches
      if (nav?.share && touch) {
        await nav.share({ title, url: link })
        track(ANALYTICS_EVENTS.linkShared, { screen, how: 'share', filtered })
        return
      }
      await nav?.clipboard?.writeText(link)
      setCopied(true)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(false), 2000)
      track(ANALYTICS_EVENTS.linkShared, { screen, how: 'copy', filtered })
    } catch {
      // Closing the share sheet rejects; nothing to tell the person.
    }
  }

  return (
    <IconButton
      icon={copied ? 'checkmark' : 'share-outline'}
      label={copied ? 'Link copied' : 'Share link to this page'}
      size={44}
      onPress={() => { void onPress() }}
      testID={testID}
    />
  )
}
