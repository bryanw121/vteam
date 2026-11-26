import { useEffect, useRef, useState } from 'react'
import { Platform, Share } from 'react-native'
import { IconButton } from './ui'
import { shareUrl } from '../constants/share'
import { ANALYTICS_EVENTS } from '../constants/analytics'
import { track } from '../lib/analytics'
import type { ShareLinkInput } from '../types'

type Props = ShareLinkInput & { testID?: string }

/**
 * Share a link to the web app (`shareUrl`): the OS share sheet on native, the browser's share
 * sheet on phones, else copy the link (`copied` is true for two seconds). `text` is a line that
 * goes with the link (outside games, #395); without it the share carries the title alone.
 */
export function useShareLink({ path, title, text, screen, filtered = false }: ShareLinkInput) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])
  const link = shareUrl(path)

  async function share() {
    try {
      if (Platform.OS !== 'web') {
        const message = text ?? title
        await Share.share(Platform.OS === 'ios' ? { message, url: link } : { message: `${message}\n${link}` })
        track(ANALYTICS_EVENTS.linkShared, { screen, how: 'share', filtered })
        return
      }
      const nav = typeof navigator !== 'undefined' ? navigator : undefined
      const touch = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches
      if (nav?.share && touch) {
        await nav.share(text ? { title, text, url: link } : { title, url: link })
        track(ANALYTICS_EVENTS.linkShared, { screen, how: 'share', filtered })
        return
      }
      await nav?.clipboard?.writeText(text ? `${text}\n${link}` : link)
      setCopied(true)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(false), 2000)
      track(ANALYTICS_EVENTS.linkShared, { screen, how: 'copy', filtered })
    } catch {
      // Closing the share sheet rejects; nothing to tell the person.
    }
  }

  return { share, copied }
}

/**
 * Share the screen's current view as an https link to the web app.
 * The event page has its own share menu (EventHeaderActions).
 */
export function ShareLinkButton({ testID, ...input }: Props) {
  const { share, copied } = useShareLink(input)
  return (
    <IconButton
      icon={copied ? 'checkmark' : 'share-outline'}
      label={copied ? 'Link copied' : 'Share link to this page'}
      size={44}
      onPress={() => { void share() }}
      testID={testID}
    />
  )
}
