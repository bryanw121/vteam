import React, { useCallback } from 'react'
import { useFocusEffect } from 'expo-router'
import { FlatList, TouchableOpacity, View } from 'react-native'
import { Text } from '../../components/ui/Text'
import { RefreshControl } from '../../components/RefreshControl'
import { useRouter } from 'expo-router'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useNotifications } from '../../hooks/useNotifications'
import { shared, theme } from '../../constants'
import { routes, isAppPath, toRoute } from '../../utils/routes'
import { formatShortTime } from '../../utils/notificationUtils'
import type { NotificationItem } from '../../types'
import { NotificationCheerChips } from '../../components/NotificationCheerChips'
import { inboxBody } from '../../utils/notificationGroups'
import { Spinner } from '../../components/ui/Spinner'
import { ScreenHeader } from '../../components/ui'
import { track } from '../../lib/analytics'
import { ANALYTICS_EVENTS } from '../../constants/analytics'

export default function NotificationsScreen() {
  const router = useRouter()
  const { notifications, loading, error, refetch, markRead, markAllRead } = useNotifications()

  useFocusEffect(
    useCallback(() => {
      void refetch(true)
    }, [refetch]),
  )

  const openItem = useCallback(
    async (item: NotificationItem) => {
      try {
        if (!item.read_at) await markRead(item.id, item.groupIds)
      } catch {
        /* still navigate */
      }
      if (item.notification_type === 'new_game') {
        const source = (item.data as { source?: unknown } | null)?.source
        track(ANALYTICS_EVENTS.gameAlertOpened, { source: source === 'club' || source === 'host' ? source : 'unknown', via: 'inbox' })
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
      <ScreenHeader
        kicker="Inbox"
        title="Notifications"
        safeTop
        onBack={() => (router.canGoBack() ? router.back() : router.replace(routes.app()))}
        right={(
          <TouchableOpacity
            onPress={() => void handleMarkAll()}
            style={shared.headerTextAction}
            accessibilityRole="button"
            testID="notifications-read-all"
          >
            <Text style={shared.headerTextActionLabel}>Read all</Text>
          </TouchableOpacity>
        )}
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
              <Spinner color={theme.colors.primaryText} style={{ marginTop: theme.spacing.xl }} />
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
                  // Read rows sit on the page colour instead of fading, so their text keeps its contrast
                  backgroundColor: isBadge ? theme.colors.accent + '22' : item.read_at ? theme.colors.background : theme.colors.card,
                  borderRadius: theme.radius.md,
                  borderWidth: 1,
                  borderColor: isBadge ? '#FFD700' : theme.colors.border,
                  padding: theme.spacing.md,
                  marginBottom: theme.spacing.sm,
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
                    {inboxBody(item)}
                  </Text>
                  <NotificationCheerChips data={item.data} />
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

