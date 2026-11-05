import React, { useMemo, useRef, useState } from 'react'
import { View, Image, Pressable, TouchableOpacity, Platform } from 'react-native'
import { Text } from './ui/Text'
import Ionicons from '@expo/vector-icons/Ionicons'
import { theme } from '../constants/theme'
import { AnchorOptionsMenu } from './AnchorOptionsMenu'
import type { AnchorRect } from '../types'
import type { MessageWithDetails } from '../types'
import { profileAvatarSmallUri } from '../utils'
import { useChatImageUrl } from '../hooks/useChatImageUrl'

const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '🔥', '👏']

type Props = {
  message: MessageWithDetails
  isOwn: boolean
  showAvatar: boolean
  /** When true (incoming only), hide body/media/reactions — user silenced sender. */
  contentSuppressed?: boolean
  /** When true, reply quote text is hidden (quoted author is silenced). */
  replyContentSuppressed?: boolean
  /** Club: optional profile link in name-row kebab menu. */
  onViewPeerProfilePress?: (userId: string) => void
  /** Club: silence action in name-row kebab menu. */
  onSilencePeerPress?: (userId: string) => void
  onLongPress: (message: MessageWithDetails, position: { x: number; y: number }) => void
  onReplyPress: (message: MessageWithDetails) => void
  onImagePress?: (url: string) => void
  /** Own message whose send failed (`_failed`): tapping the bubble retries it. */
  onRetryPress?: (message: MessageWithDetails) => void
}

function displayName(p: { first_name: string | null; last_name: string | null; username: string } | null) {
  if (!p) return 'Unknown'
  return [p.first_name, p.last_name].filter(Boolean).join(' ') || p.username
}

export function MessageBubble({
  message,
  isOwn,
  showAvatar,
  contentSuppressed = false,
  replyContentSuppressed = false,
  onViewPeerProfilePress,
  onSilencePeerPress,
  onLongPress,
  onReplyPress,
  onImagePress,
  onRetryPress,
}: Props) {
  const peerKebabWrapRef = useRef<View>(null)
  const [peerMenuVisible, setPeerMenuVisible] = useState(false)
  const [peerMenuAnchor, setPeerMenuAnchor] = useState<AnchorRect | null>(null)

  const deleted = !!message.deleted_at
  const hiddenIncoming = !isOwn && contentSuppressed
  const hasText = !deleted && !hiddenIncoming && !!message.content
  const hasImage = !deleted && !hiddenIncoming && !!message.image_url
  // chat-images is private: stored paths (and legacy public URLs) need a signed URL.
  const imageUri = useChatImageUrl(hasImage ? message.image_url : null)

  // Group reactions by emoji
  const reactionGroups: Record<string, number> = {}
  for (const r of message.message_reactions) {
    reactionGroups[r.emoji] = (reactionGroups[r.emoji] ?? 0) + 1
  }
  const reactions = Object.entries(reactionGroups)

  const bubbleBg = isOwn ? theme.colors.primary : theme.colors.card
  const bubbleText = isOwn ? theme.colors.white : theme.colors.text

  const peerUserId = message.profiles?.id
  const peerMenuOptions = useMemo(() => {
    if (!peerUserId) return []
    const o: { key: string; label: string; destructive?: boolean; onPress: () => void }[] = []
    if (onViewPeerProfilePress) {
      o.push({ key: 'profile', label: 'View profile', onPress: () => onViewPeerProfilePress(peerUserId) })
    }
    if (onSilencePeerPress) {
      o.push({ key: 'silence', label: 'Silence user', destructive: true, onPress: () => onSilencePeerPress(peerUserId) })
    }
    return o
  }, [peerUserId, onViewPeerProfilePress, onSilencePeerPress])

  function openPeerKebabMenu() {
    peerKebabWrapRef.current?.measureInWindow((x, y, w, h) => {
      setPeerMenuAnchor({ x, y, width: w, height: h })
      setPeerMenuVisible(true)
    })
  }

  const failed = !!message._failed
  const unsent = !!message._sending || failed

  function openActionMenu(pageX: number, pageY: number) {
    if (!deleted && !unsent) onLongPress(message, { x: pageX, y: pageY })
  }

  const webMenuProps =
    Platform.OS === 'web'
      ? {
          onContextMenu: (e: { preventDefault?: () => void; nativeEvent: { pageX?: number; pageY?: number; clientX?: number; clientY?: number } }) => {
            if (hiddenIncoming || deleted || unsent) return
            e.preventDefault?.()
            const ne = e.nativeEvent
            const x = ne.clientX ?? ne.pageX ?? 0
            const y = ne.clientY ?? ne.pageY ?? 0
            openActionMenu(x, y)
          },
        }
      : null

  const bubblePressable = (
    <Pressable
      delayLongPress={350}
      onPress={failed && onRetryPress ? () => onRetryPress(message) : undefined}
      accessibilityRole={failed ? 'button' : undefined}
      accessibilityLabel={failed ? 'Message not sent. Tap to retry' : undefined}
      onLongPress={hiddenIncoming ? undefined : e => {
        const { pageX, pageY } = e.nativeEvent
        openActionMenu(pageX, pageY)
      }}
      {...(webMenuProps ?? {})}
      style={{
        alignItems: isOwn ? 'flex-end' : 'flex-start',
        maxWidth: '100%',
      }}
    >
      {/* Reply quote */}
      {message.reply_to && message.reply_to.id && !deleted && !hiddenIncoming && (
        <TouchableOpacity
          onPress={() => onReplyPress(message)}
          style={{
            borderLeftWidth: 2,
            borderLeftColor: theme.colors.primary,
            paddingLeft: 8,
            marginBottom: 4,
            opacity: 0.8,
          }}
        >
          <Text style={{ fontSize: theme.font.size.xs, color: theme.colors.primary, fontWeight: theme.font.weight.semibold }}>
            {replyContentSuppressed
              ? 'Message'
              : (message.reply_to.profiles ? displayName(message.reply_to.profiles) : 'Message')}
          </Text>
          <Text style={{ fontSize: theme.font.size.xs, color: theme.colors.subtext }} numberOfLines={1}>
            {replyContentSuppressed
              ? 'Hidden — you silenced this person'
              : message.reply_to.deleted_at
                ? 'Deleted message'
                : message.reply_to.image_url && !message.reply_to.content
                  ? '📷 Image'
                  : message.reply_to.content ?? ''}
          </Text>
        </TouchableOpacity>
      )}

      {/* Bubble + overlapping reactions */}
      <View style={{ position: 'relative', marginBottom: !hiddenIncoming && reactions.length > 0 ? 14 : 0 }}>
        <View style={{
          backgroundColor: deleted || hiddenIncoming ? 'transparent' : bubbleBg,
          borderRadius: 18,
          borderBottomLeftRadius: !isOwn ? 4 : 18,
          borderBottomRightRadius: isOwn ? 4 : 18,
          borderWidth: deleted || hiddenIncoming ? 1 : 0,
          borderColor: theme.colors.border,
          overflow: 'hidden',
        }}>
          {hiddenIncoming ? (
            <Text style={{
              fontSize: theme.font.size.sm,
              color: theme.colors.subtext,
              fontStyle: 'italic',
              paddingHorizontal: 12,
              paddingVertical: 8,
            }}>
              Message hidden — you silenced this person.
            </Text>
          ) : deleted ? (
            <Text style={{
              fontSize: theme.font.size.sm,
              color: theme.colors.subtext,
              fontStyle: 'italic',
              paddingHorizontal: 12,
              paddingVertical: 8,
            }}>
              Message deleted
            </Text>
          ) : (
            <>
              {hasImage && (
                <Pressable onPress={() => { if (imageUri) onImagePress?.(imageUri) }} disabled={!imageUri}>
                  <Image
                    source={imageUri ? { uri: imageUri } : undefined}
                    style={{ width: 220, height: 180, borderRadius: hasText ? 0 : 18, backgroundColor: theme.colors.background }}
                    resizeMode="cover"
                  />
                </Pressable>
              )}
              {hasText && (
                <Text style={{
                  fontFamily: theme.fonts.body,
                  fontSize: theme.font.size.md,
                  color: bubbleText,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  lineHeight: 20,
                }}>
                  {message.content}
                  {message.edited_at && !unsent
                    ? <Text style={{ fontSize: theme.font.size.xs, color: isOwn ? 'rgba(255,255,255,0.6)' : theme.colors.subtext, fontStyle: 'italic' }}>{' (edited)'}</Text>
                    : null}
                </Text>
              )}
            </>
          )}
        </View>

        {/* Reactions — iMessage-style, overlapping the bottom of the bubble */}
        {!hiddenIncoming && reactions.length > 0 && (
          <View style={{
            position: 'absolute',
            bottom: -14,
            ...(isOwn ? { right: 8 } : { left: 8 }),
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: 3,
            zIndex: 1,
          }}>
            {reactions.map(([emoji, count]) => (
              <View key={emoji} style={{
                flexDirection: 'row', alignItems: 'center', gap: 2,
                backgroundColor: theme.colors.card,
                borderRadius: theme.radius.full,
                paddingHorizontal: 6, paddingVertical: 3,
                borderWidth: 1, borderColor: theme.colors.border,
                shadowColor: theme.colors.black,
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.12,
                shadowRadius: 2,
                elevation: 2,
              }}>
                <Text style={{ fontSize: theme.font.size.smd }}>{emoji}</Text>
                {count > 1 && (
                  <Text style={{ fontSize: theme.font.size.xs, color: theme.colors.subtext }}>{count}</Text>
                )}
              </View>
            ))}
          </View>
        )}
      </View>

      {/* Timestamp / sending / failed indicator */}
      <Text style={{
        fontFamily: failed ? theme.fonts.bodySemiBold : theme.fonts.body,
        fontSize: theme.font.size.xs,
        color: failed ? theme.colors.error : message._sending ? theme.colors.primary : theme.colors.subtext,
        marginTop: 2,
        marginHorizontal: 4,
        fontStyle: message._sending ? 'italic' : 'normal',
      }}>
        {failed ? 'Not sent · Tap to retry' : message._sending ? 'Sending…' : formatTime(message.created_at)}
      </Text>
    </Pressable>
  )

  const showPeerKebab = !isOwn && showAvatar && message.profiles && !hiddenIncoming && peerMenuOptions.length > 0

  return (
    <>
    <View
      style={{
        flexDirection: isOwn ? 'row-reverse' : 'row',
        alignItems: 'flex-end',
        marginHorizontal: theme.spacing.md,
        marginBottom: 4,
        gap: 8,
        opacity: message._sending ? 0.6 : failed ? 0.85 : 1,
      }}
    >
      <View style={{ width: 28 }}>
        {!isOwn && showAvatar && (
          <View style={{
            width: 28, height: 28, borderRadius: 14,
            backgroundColor: theme.colors.border,
            alignItems: 'center', justifyContent: 'center',
            overflow: 'hidden',
          }}>
            {!hiddenIncoming && profileAvatarSmallUri(message.profiles?.avatar_url) ? (
              <Image source={{ uri: profileAvatarSmallUri(message.profiles?.avatar_url)! }} style={{ width: 28, height: 28 }} />
            ) : (
              <Ionicons name="person" size={14} color={theme.colors.subtext} />
            )}
          </View>
        )}
      </View>

      <View style={{ maxWidth: '72%', alignItems: isOwn ? 'flex-end' : 'flex-start' }}>
        {!isOwn && showAvatar && message.profiles && (
          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            marginBottom: 2,
            marginLeft: 2,
            maxWidth: '100%',
          }}>
            <Text
              style={{
                flexShrink: 1,
                fontSize: theme.font.size.xs,
                color: theme.colors.subtext,
              }}
              numberOfLines={1}
            >
              {hiddenIncoming ? 'Silenced user' : displayName(message.profiles)}
            </Text>
            {showPeerKebab ? (
              <View ref={peerKebabWrapRef} collapsable={false}>
                <Pressable
                  onPress={openPeerKebabMenu}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel="Open menu for this person"
                >
                  <Ionicons name="ellipsis-vertical" size={16} color={theme.colors.subtext} />
                </Pressable>
              </View>
            ) : null}
          </View>
        )}

        {bubblePressable}
      </View>
    </View>

    <AnchorOptionsMenu
      visible={peerMenuVisible}
      anchor={peerMenuAnchor}
      options={peerMenuOptions}
      onDismiss={() => {
        setPeerMenuVisible(false)
        setPeerMenuAnchor(null)
      }}
    />
    </>
  )
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000)
  if (diffDays === 0) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }
  if (diffDays < 7) {
    return d.toLocaleDateString([], { weekday: 'short' }) + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

export { REACTION_EMOJIS }
