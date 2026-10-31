import React, { useCallback } from 'react'
import { useFocusEffect } from 'expo-router'
import {
  ActivityIndicator,
  FlatList,
  TouchableOpacity,
  View,
} from 'react-native'
import { Text } from '../../components/ui/Text'
import { RefreshControl } from '../../components/RefreshControl'
import { Stack, useRouter } from 'expo-router'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useNotifications } from '../../hooks/useNotifications'
import { shared, theme } from '../../constants'
import { routes, isAppPath, toRoute } from '../../utils/routes'
import { formatShortTime } from '../../utils/notificationUtils'
import type { Notification } from '../../types'

export default function NotificationsScreen() {
  const router = useRouter()
  const { notifications, loading, error, refetch, markRead, markAllRead } = useNotifications()

  useFocusEffect(
    useCallback(() => {
      void refetch(true)
    }, [refetch]),
  )

  const openItem = useCallback(
    async (item: Notification) => {
      try {
        if (!item.read_at) await markRead(item.id)
      } catch {
        /* still navigate */
      }
      const path = item.data?.deep_link
      if (isAppPath(path)) {
        router.push(toRoute(path))
        return
      }
      if (item.data?.event_id) {
        router.push(routes.event(item.data.event_id))
      }
    },
    [markRead, router],
  )

  const handleMarkAll = useCallback(async () => {
    try {
      await markAllRead()
    } catch {
      /* ignore */
    }
  }, [markAllRead])

  return (
    <View style={shared.screen}>
      <Stack.Screen
        options={{
          title: 'Notifications',
          headerBackTitle: 'Back',
          headerRight: () => (
            <TouchableOpacity
              onPress={() => void handleMarkAll()}
              style={{ paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.xs }}
              hitSlop={8}
            >
              <Text style={{ fontSize: theme.font.size.sm, color: theme.colors.primary, fontWeight: theme.font.weight.semibold }}>
                Read all
              </Text>
            </TouchableOpacity>
          ),
        }}
      />

      {error ? (
        <View style={[shared.centered, { padding: theme.spacing.lg }]}>
          <Text style={shared.errorText}>{error}</Text>
          <TouchableOpacity onPress={() => void refetch(true)} style={{ marginTop: theme.spacing.md }}>
            <Text style={shared.primaryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={item => item.id}
          style={{ flex: 1, width: '100%' }}
          refreshControl={
            <RefreshControl refreshing={loading} onRefresh={() => void refetch(true)} tintColor={theme.colors.primary} />
          }
          contentContainerStyle={{
            padding: theme.spacing.lg,
            paddingBottom: theme.spacing.xl,
            flexGrow: 1,
          }}
          ListEmptyComponent={
            loading ? (
              <ActivityIndicator color={theme.colors.primary} style={{ marginTop: theme.spacing.xl }} />
            ) : (
              <View style={{ alignItems: 'center', paddingTop: theme.spacing.xl, gap: theme.spacing.sm }}>
                <Ionicons name="notifications-off-outline" size={40} color={theme.colors.subtext} />
                <Text style={[shared.caption, { textAlign: 'center' }]}>No notifications yet</Text>
              </View>
            )
          }
          renderItem={({ item }) => {
            const isBadge = item.notification_type === 'badge_earned'
            return (
              <TouchableOpacity
                onPress={() => void openItem(item)}
                style={{
                  backgroundColor: isBadge ? theme.colors.accent + '22' : theme.colors.card,
                  borderRadius: theme.radius.md,
                  borderWidth: 1,
                  borderColor: isBadge ? '#FFD700' : theme.colors.border,
                  padding: theme.spacing.md,
                  marginBottom: theme.spacing.sm,
                  opacity: item.read_at ? 0.72 : 1,
                  overflow: 'hidden',
                  flexDirection: 'row',
                  alignItems: 'flex-start',
                  gap: theme.spacing.sm,
                }}
              >
                {isBadge && (
                  <Ionicons name="ribbon-outline" size={20} color="#FFD700" style={{ marginTop: 1 }} />
                )}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontSize: theme.font.size.md, fontWeight: theme.font.weight.semibold, color: theme.colors.text }} numberOfLines={2}>
                    {item.title}
                  </Text>
                  <Text
                    style={{
                      fontSize: theme.font.size.sm,
                      color: theme.colors.subtextStrong,
                      marginTop: theme.spacing.xs,
                      lineHeight: 20,
                    }}
                    numberOfLines={3}
                  >
                    {item.body}
                  </Text>
                  <Text style={[shared.captionStrong, { marginTop: theme.spacing.sm }]}>
                    {formatShortTime(item.created_at)}
                  </Text>
                </View>
              </TouchableOpacity>
            )
          }}
        />
      )}
    </View>
  )
}

