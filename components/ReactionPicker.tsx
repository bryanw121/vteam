import React from 'react'
import { View, TouchableOpacity, Pressable, Modal, StyleSheet, Dimensions } from 'react-native'
import { Text } from './ui/Text'
import Ionicons from '@expo/vector-icons/Ionicons'
import { theme } from '../constants/theme'
import { REACTION_EMOJIS } from './MessageBubble'
import type { MessageWithDetails } from '../types'

type Props = {
  visible: boolean
  message: MessageWithDetails | null
  position: { x: number; y: number }
  /** Current user id; when null, delete stays hidden until session loads. */
  viewerUserId: string | null
  onReact: (messageId: string, emoji: string) => void
  onReply: (message: MessageWithDetails) => void
  onEdit: (message: MessageWithDetails) => void
  onDelete: (messageId: string) => void
  /** Incoming messages only — silence the sender. */
  onSilence?: (senderId: string) => void
  onDismiss: () => void
}

export function ReactionPicker({
  visible,
  message,
  position,
  viewerUserId,
  onReact,
  onReply,
  onEdit,
  onDelete,
  onSilence,
  onDismiss,
}: Props) {
  if (!message) return null

  const isOwn = Boolean(viewerUserId && message.sender_id === viewerUserId)
  const canEdit = isOwn && !message.deleted_at && !!message.content
  const canSilence = !isOwn && !!onSilence && !message.deleted_at

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.modalRoot}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onDismiss} accessibilityLabel="Dismiss menu" />
        <View
          style={[styles.menu, {
            top: Math.max(8, position.y - 120),
            left: Math.min(Math.max(8, position.x - 120), Dimensions.get('window').width - 272),
          }]}
        >
          {/* Emoji row */}
          <View style={{ flexDirection: 'row', padding: theme.spacing.sm, gap: 4 }}>
            {REACTION_EMOJIS.map(emoji => (
              <TouchableOpacity
                key={emoji}
                onPress={() => {
                  onReact(message.id, emoji)
                  onDismiss()
                }}
                style={{
                  width: 38, height: 38, borderRadius: 19,
                  alignItems: 'center', justifyContent: 'center',
                }}
              >
                <Text style={{ fontSize: theme.font.emoji.md }}>{emoji}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Divider */}
          <View style={{ height: 1, backgroundColor: theme.colors.border }} />

          {/* Actions */}
          <View style={{ paddingVertical: theme.spacing.xs }}>
            <TouchableOpacity
              onPress={() => {
                onReply(message)
                onDismiss()
              }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 10 }}
            >
              <Ionicons name="return-down-back" size={18} color={theme.colors.text} />
              <Text style={{ fontSize: theme.font.size.md, color: theme.colors.text }}>Reply</Text>
            </TouchableOpacity>

            {canEdit && (
              <TouchableOpacity
                onPress={() => {
                  onEdit(message)
                  onDismiss()
                }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 10 }}
              >
                <Ionicons name="pencil-outline" size={18} color={theme.colors.text} />
                <Text style={{ fontSize: theme.font.size.md, color: theme.colors.text }}>Edit</Text>
              </TouchableOpacity>
            )}

            {isOwn && (
              <TouchableOpacity
                onPress={() => {
                  onDelete(message.id)
                  onDismiss()
                }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 10 }}
              >
                <Ionicons name="trash-outline" size={18} color={theme.colors.error ?? '#EF4444'} />
                <Text style={{ fontSize: theme.font.size.md, color: theme.colors.error ?? '#EF4444' }}>Delete</Text>
              </TouchableOpacity>
            )}

            {canSilence && (
              <TouchableOpacity
                onPress={() => {
                  onSilence(message.sender_id)
                  onDismiss()
                }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 10 }}
              >
                <Ionicons name="eye-off-outline" size={18} color={theme.colors.error ?? '#EF4444'} />
                <Text style={{ fontSize: theme.font.size.md, color: theme.colors.error ?? '#EF4444' }}>Silence user</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
  },
  menu: {
    position: 'absolute',
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    borderColor: theme.colors.border,
    shadowColor: theme.colors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 12,
    overflow: 'hidden',
    maxWidth: '92%',
  },
})
