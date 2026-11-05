import React, { useEffect, useRef, useState } from 'react'
import { Platform, Pressable, Share, StyleSheet, TouchableOpacity, View } from 'react-native'
import { Text } from '../ui/Text'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { theme } from '../../constants'
import { routes } from '../../utils/routes'
import { shareUrl } from '../../constants/share'
import { eventShareMessage } from '../../utils/eventShare'
import { Button } from '../Button'
import { IconButton } from '../ui'
import { AnchorOptionsMenu } from '../AnchorOptionsMenu'
import type { AnchorMenuOption, AnchorRect, IoniconName } from '../../types'

type Props = {
  eventId: string
  title: string | undefined
  /** `events.event_date`, for the share text ("Sat, Oct 31, 4:00 PM"). */
  eventDate?: string
  /** Host or co-host: show Edit + the ⋯ overflow (Delete). */
  canManage: boolean
  deleting: boolean
  onBack: () => void
  onEdit: () => void
  /** Opens the delete confirmation; never deletes directly. */
  onDelete: () => void
  /** Owner only: adds "Manage co-hosts" to the overflow. */
  onManageCohosts?: () => void
}

const IS_WEB = Platform.OS === 'web'

function ShareMenuItem({ icon, label, onPress, active }: { icon: IoniconName; label: string; onPress: () => void; active?: boolean }) {
  const [hovered, setHovered] = useState(false)
  return (
    <Pressable
      onPress={onPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={[styles.shareMenuItem, hovered && { backgroundColor: theme.colors.background }]}
    >
      <Ionicons name={icon} size={16} color={active ? theme.colors.success : theme.colors.text} />
      <Text style={[styles.shareMenuText, active && { color: theme.colors.success }]}>{label}</Text>
    </Pressable>
  )
}

/**
 * Back + Share (+ Edit and a ⋯ overflow for hosts) for the event page. Every
 * control is a ≥44pt target: back and ⋯ are 44pt `IconButton`s; Share and Edit
 * are labelled `touch`-size `Button`s, so the two actions people reach for are
 * words, not glyphs. Delete sits behind ⋯ (and still confirms), so it is no
 * longer a mis-tap away from Edit.
 *
 * One component, two placements: on web an in-flow header row with a share
 * dropdown (copy link / Web Share); on native floating over the banner, where
 * share opens the OS share sheet. Every surface shares the same https link.
 */
export function EventHeaderActions({ eventId, title, eventDate, canManage, deleting, onBack, onEdit, onDelete, onManageCohosts }: Props) {
  const insets = useSafeAreaInsets()
  const [menuOpen, setMenuOpen] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)
  const [overflowAnchor, setOverflowAnchor] = useState<AnchorRect | null>(null)
  const overflowRef = useRef<View>(null)
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (copiedTimer.current) clearTimeout(copiedTimer.current) }, [])
  /** Always an https link to the web app (#130), never `vteam://` or the current URL's `?from=`. */
  const link = shareUrl(routes.event(eventId))

  async function handleShare() {
    if (IS_WEB) {
      setMenuOpen(v => !v)
      return
    }
    // iOS sends `url` as its own item (Messages turns it into the preview card)
    // beside `message`, so the link isn't repeated in the text. Android only
    // sends `message`, so there the link goes on its own line.
    const message = eventShareMessage(title, eventDate)
    await Share.share(Platform.OS === 'ios' ? { message, url: link } : { message: `${message}\n${link}` })
  }

  async function handleCopyLink() {
    await navigator.clipboard.writeText(link)
    setLinkCopied(true)
    if (copiedTimer.current) clearTimeout(copiedTimer.current)
    copiedTimer.current = setTimeout(() => setLinkCopied(false), 2000)
  }

  async function handleWebShare() {
    await navigator.share({ title: title ?? 'Event', text: eventShareMessage(title, eventDate), url: link })
    setMenuOpen(false)
  }

  /** Measure ⋯ so the menu anchors under it, then open. */
  function openOverflow() {
    overflowRef.current?.measureInWindow((x, y, width, height) => setOverflowAnchor({ x, y, width, height }))
  }

  const overflowOptions: AnchorMenuOption[] = [
    ...(onManageCohosts ? [{ key: 'cohosts', label: 'Manage co-hosts', onPress: onManageCohosts }] : []),
    { key: 'delete', label: 'Delete event', destructive: true, onPress: onDelete },
  ]

  // Over the banner photo a transparent outline pill would be unreadable.
  const secondaryStyle = IS_WEB ? undefined : styles.floatSurface

  return (
    <View
      pointerEvents={IS_WEB ? 'auto' : 'box-none'}
      style={IS_WEB ? styles.webBar : [styles.floatBar, { top: insets.top + 8 }]}
    >
      <IconButton icon="chevron-back" label="Go back" size={44} onPress={onBack} testID="event-back-button" />
      <View style={styles.actions}>
        <View>
          <Button
            label="Share"
            icon="share-outline"
            variant="secondary"
            size="touch"
            fullWidth={false}
            style={secondaryStyle}
            accessibilityLabel="Share this event"
            testID="event-share-button"
            onPress={() => { void handleShare() }}
          />
          {IS_WEB && menuOpen && (
            <>
              <TouchableOpacity style={styles.menuBackdrop} onPress={() => setMenuOpen(false)} />
              <View style={styles.shareMenu}>
                {!!navigator.share && (
                  <ShareMenuItem icon="share-social-outline" label="Share…" onPress={() => { void handleWebShare() }} />
                )}
                <ShareMenuItem
                  icon={linkCopied ? 'checkmark' : 'link-outline'}
                  label={linkCopied ? 'Copied!' : 'Copy link'}
                  onPress={() => { void handleCopyLink() }}
                  active={linkCopied}
                />
              </View>
            </>
          )}
        </View>
        {canManage && (
          <>
            <Button
              label="Edit"
              icon="create-outline"
              size="touch"
              fullWidth={false}
              accessibilityLabel="Edit this event"
              testID="event-edit-button"
              onPress={onEdit}
            />
            <View ref={overflowRef} collapsable={false}>
              <IconButton
                icon="ellipsis-horizontal"
                label="More event actions"
                size={44}
                busy={deleting}
                onPress={openOverflow}
                testID="event-more-button"
              />
            </View>
          </>
        )}
      </View>
      <AnchorOptionsMenu
        visible={overflowAnchor !== null}
        anchor={overflowAnchor}
        options={overflowOptions}
        onDismiss={() => setOverflowAnchor(null)}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  webBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    zIndex: 10,
    backgroundColor: theme.colors.background,
  },
  actions: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  floatBar: {
    position: 'absolute',
    left: theme.spacing.md,
    right: theme.spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 50,
  },
  floatSurface: { backgroundColor: theme.colors.card },
  // Web only: `fixed` covers the viewport so any outside click closes the menu.
  menuBackdrop: { position: 'fixed' as 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  shareMenu: {
    position: 'absolute',
    top: 48,
    right: 0,
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    shadowColor: theme.colors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 8,
    zIndex: 100,
    minWidth: 148,
    overflow: 'hidden',
  },
  shareMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
  },
  shareMenuText: {
    fontSize: theme.font.size.md,
    color: theme.colors.text,
  },
})
