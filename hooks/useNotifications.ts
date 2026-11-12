import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useSession } from '../contexts/session'
import { STALE } from '../constants'
import type { Notification, NotificationItem } from '../types'
import { groupNotifications } from '../utils/notificationGroups'

const NOTIFICATION_SELECT =
  'id, user_id, notification_type, title, body, data, read_at, created_at'

type UseNotificationsOptions = {
  /** When false (Events tab badge), only fetch unread count until the list is needed. Default true for inbox screens. */
  fetchListOnMount?: boolean
}

export function useNotifications(opts: UseNotificationsOptions = {}) {
  const fetchListOnMount = opts.fetchListOnMount !== false
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(fetchListOnMount)
  const [error, setError] = useState<string | null>(null)
  const lastFetchedAt = useRef(0)
  // Refetch when the signed-in user changes (guest → signed in, or sign out).
  const { userId } = useSession()
  // Callbacks read the latest id without changing identity on every sign-in.
  const userIdRef = useRef(userId)
  userIdRef.current = userId

  const fetchUnreadCount = useCallback(async () => {
    if (!userIdRef.current) {
      setUnreadCount(0)
      return
    }
    const { count, error: cErr } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .is('read_at', null)
    if (cErr) return
    setUnreadCount(count ?? 0)
  }, [])

  const fetchList = useCallback(async (force = false) => {
    if (!force && Date.now() - lastFetchedAt.current < STALE.notifications) return
    if (!userIdRef.current) {
      setNotifications([])
      setUnreadCount(0)
      setLoading(false)
      return
    }
    try {
      setLoading(true)
      setError(null)
      // Grouped rows (#194) move up as cheers or edits fold in: order by
      // last_activity_at, or by created_at while that column isn't there yet
      // (the migration and the web deploy land around the same time).
      const list = (orderBy: string) => supabase
        .from('notifications')
        .select(NOTIFICATION_SELECT)
        .order(orderBy as 'created_at', { ascending: false })
        .limit(80)
      let { data, error: qErr } = await list('last_activity_at')
      if (qErr?.code === '42703') ({ data, error: qErr } = await list('created_at'))
      if (qErr) throw qErr
      setNotifications(groupNotifications((data ?? []) as Notification[]))
      lastFetchedAt.current = Date.now()
      await fetchUnreadCount()
    } catch (e: any) {
      setError(e.message ?? 'Failed to load notifications')
    } finally {
      setLoading(false)
    }
  }, [fetchUnreadCount])

  useEffect(() => {
    if (!userId) {
      setNotifications([])
      setUnreadCount(0)
      setLoading(false)
      return
    }
    if (fetchListOnMount) {
      void fetchList(true)
    } else {
      void fetchUnreadCount()
      setLoading(false)
    }
  }, [userId, fetchListOnMount, fetchList, fetchUnreadCount])

  const markRead = useCallback(
    async (id: string, groupIds?: string[]) => {
      // A row collapsed client-side stands for several: mark them all.
      const ids = groupIds?.length ? groupIds : [id]
      const results = await Promise.all(ids.map(nid => supabase.rpc('mark_notification_read', { p_notification_id: nid })))
      const rpcErr = results.find(r => r.error)?.error
      if (rpcErr) throw rpcErr
      const now = new Date().toISOString()
      setNotifications(prev =>
        prev.map(n => (n.id === id ? { ...n, read_at: n.read_at ?? now } : n)),
      )
      await fetchUnreadCount()
    },
    [fetchUnreadCount],
  )

  const markAllRead = useCallback(async () => {
    const { error: rpcErr } = await supabase.rpc('mark_all_notifications_read')
    if (rpcErr) throw rpcErr
    const now = new Date().toISOString()
    setNotifications(prev => prev.map(n => ({ ...n, read_at: n.read_at ?? now })))
    await fetchUnreadCount()
  }, [fetchUnreadCount])

  return {
    notifications,
    unreadCount,
    loading,
    error,
    refetch: fetchList,
    refreshUnread: fetchUnreadCount,
    markRead,
    markAllRead,
  }
}
