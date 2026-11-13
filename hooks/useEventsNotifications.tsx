/**
 * The Events header's bell and its popup (#217 part 4): one hook so the button
 * in the header and the popup drawn over the screen share their open state.
 * Moved as is from the screen; `refetch` is for pull-to-refresh.
 */
import React, { useCallback, useState } from 'react'
import { Dimensions } from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { IconButton } from '../components/ui'
import { NotificationPopup } from '../components/NotificationPopup'
import { useNotifications } from './useNotifications'
import { routes, isAppPath, toRoute } from '../utils/routes'
import type { NotificationItem } from '../types'

export function useEventsNotifications() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const {
    notifications: notifItems,
    unreadCount,
    refetch: refetchNotifs,
    markRead,
    markAllRead,
    loading: notifLoading,
  } = useNotifications({ fetchListOnMount: false })
  const [notifOpen, setNotifOpen] = useState(false)

  const openNotifItem = useCallback(
    async (item: NotificationItem) => {
      setNotifOpen(false)
      try {
        if (!item.read_at) await markRead(item.id, item.groupIds)
      } catch {
        /* ignore */
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

  const toggleNotifPanel = useCallback(() => {
    setNotifOpen(o => {
      if (!o) void refetchNotifs(true)
      return !o
    })
  }, [refetchNotifs])

  const button = (
    <IconButton
      icon={notifOpen ? 'notifications' : 'notifications-outline'}
      label="Notifications"
      active={notifOpen}
      badge={unreadCount > 0}
      onPress={toggleNotifPanel}
    />
  )

  const popup = (
    <NotificationPopup
      visible={notifOpen}
      items={notifItems}
      loading={notifLoading}
      unreadCount={unreadCount}
      insetTop={insets.top}
      // Read at render (the popup only matters while open) instead of
      // subscribing the whole screen to every resize.
      windowWidth={Dimensions.get('window').width}
      onDismiss={() => setNotifOpen(false)}
      onOpenItem={openNotifItem}
      onMarkAllRead={() => void markAllRead()}
      onSeeAll={() => { setNotifOpen(false); router.push(routes.notifications()) }}
    />
  )

  return { button, popup, refetch: refetchNotifs }
}
