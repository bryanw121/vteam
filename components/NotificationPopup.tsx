import React from 'react'
import { FlatList, Modal, Pressable, TouchableOpacity, View } from 'react-native'
import { Text } from './ui/Text'
import Ionicons from '@expo/vector-icons/Ionicons'
import { theme } from '../constants'
import type { Notification } from '../types'
import { Spinner } from './ui/Spinner'

type Props = {
  visible: boolean
  items: Notification[]
  loading: boolean
  unreadCount: number
  insetTop: number
  windowWidth: number
  onDismiss: () => void
  onOpenItem: (item: Notification) => void
  onMarkAllRead: () => void
  onSeeAll: () => void
}

export function NotificationPopup({
  visible,
  items,
  loading,
  unreadCount,
  insetTop,
  windowWidth,
  onDismiss,
  onOpenItem,
  onMarkAllRead,
  onSeeAll,
}: Props) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onDismiss}
      statusBarTranslucent
    >
      <Pressable
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        onPress={onDismiss}
      />
      <View
        style={{
          position: 'absolute',
          top: insetTop + 48,
          right: theme.spacing.lg,
          width: Math.min(320, windowWidth - theme.spacing.lg * 2),
          maxHeight: 400,
          backgroundColor: theme.colors.card,
          borderRadius: theme.radius.md,
          borderWidth: 1,
          borderColor: theme.colors.border,
          shadowColor: theme.colors.black,
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.10,
          shadowRadius: 8,
          elevation: 6,
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <View style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.sm,
          borderBottomWidth: 1, borderBottomColor: theme.colors.border,
        }}>
          <Text style={{ fontSize: theme.font.size.md, fontWeight: theme.font.weight.semibold, color: theme.colors.text }}>
            Notifications
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
            {unreadCount > 0 && (
              <TouchableOpacity onPress={onMarkAllRead} hitSlop={8}>
                <Text style={{ fontSize: theme.font.size.sm, color: theme.colors.subtext, fontWeight: theme.font.weight.medium }}>
                  Read all
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={onSeeAll} hitSlop={8}>
              <Text style={{ fontSize: theme.font.size.sm, color: theme.colors.primary, fontWeight: theme.font.weight.semibold }}>
                See all
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Scrollable list */}
        <FlatList
          data={items.slice(0, 15)}
          keyExtractor={item => item.id}
          style={{ maxHeight: 320 }}
          scrollEnabled
          nestedScrollEnabled
          keyboardShouldPersistTaps="handled"
          testID="notification-list"
          ListEmptyComponent={
            loading ? (
              <View style={{ padding: theme.spacing.lg, alignItems: 'center' }}>
                <Spinner color={theme.colors.primary} />
              </View>
            ) : (
              <View style={{ paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.lg, alignItems: 'center', gap: theme.spacing.sm }}>
                <Ionicons name="notifications-off-outline" size={28} color={theme.colors.subtext} />
                <Text style={{ fontSize: theme.font.size.sm, color: theme.colors.subtext, textAlign: 'center' }}>
                  You're all caught up
                </Text>
              </View>
            )
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => onOpenItem(item)}
              style={{
                paddingHorizontal: theme.spacing.md,
                paddingVertical: theme.spacing.sm,
                borderBottomWidth: 1,
                borderBottomColor: theme.colors.border,
                opacity: item.read_at ? 0.65 : 1,
              }}
            >
              <Text style={{ fontSize: theme.font.size.sm, fontWeight: theme.font.weight.semibold, color: theme.colors.text }} numberOfLines={1}>
                {item.title}
              </Text>
              <Text style={{ fontSize: theme.font.size.xs, color: theme.colors.subtext, marginTop: 2 }} numberOfLines={2}>
                {item.body}
              </Text>
            </TouchableOpacity>
          )}
        />
      </View>
    </Modal>
  )
}
