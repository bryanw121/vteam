import { useEffect } from 'react'
import { AppState } from 'react-native'
import { supabase } from '../lib/supabase'
import { queryKey, useQuery } from '../lib/query'
import type { QueryResult } from '../lib/query'
import { STALE } from '../constants/cache'
import { useSession } from '../contexts/session'
import type {
  AdminUserActivity, AdminUserSort, AdminUsersPage, MetricsEvents, MetricsOverview, OnlineNow, RetentionReport,
} from '../types'

/**
 * Admin usage metrics (Profile → Admin metrics). Every read is an admin_* RPC that checks
 * current_user_is_admin() on the server and raises for anyone else; the client-side admin check
 * only decides whether to draw the entry row. Keys live under `admin` (user-scoped: dropped when
 * the account changes, never snapshotted to the device).
 */

export const LIVE_REFRESH_MS = 15_000

export function adminCheckKey(userId: string): string {
  return queryKey('admin', userId, 'isAdmin')
}

/** Whether the signed-in viewer is an admin (`checked` once the server has answered). False for guests and on error. */
export function useIsAdmin(opts?: { enabled?: boolean }): { isAdmin: boolean; checked: boolean } {
  const { userId } = useSession()
  const { data, error } = useQuery<boolean>(
    userId ? adminCheckKey(userId) : null,
    async () => {
      const { data, error } = await supabase.rpc('current_user_is_admin')
      if (error) throw error
      return data === true
    },
    { staleMs: STALE.adminCheck, enabled: (opts?.enabled ?? true) && !!userId },
  )
  return { isAdmin: data === true, checked: data !== undefined || !!error || !userId }
}

async function rpcJson<T>(fn: PromiseLike<{ data: unknown; error: unknown }>): Promise<T> {
  const { data, error } = await fn
  if (error) throw error
  return data as T
}

export function useMetricsOverview(range: { from: string; to: string }, opts?: { enabled?: boolean }): QueryResult<MetricsOverview> {
  const { userId } = useSession()
  return useQuery<MetricsOverview>(
    userId ? queryKey('admin', userId, 'overview', range.from, range.to) : null,
    () => rpcJson(supabase.rpc('admin_metrics_overview', { p_from: range.from, p_to: range.to })),
    { staleMs: STALE.metrics, enabled: opts?.enabled ?? true, keepPreviousData: true },
  )
}

/** Outside link-outs, shares, feed filters, Scorekeeper matches and the guest funnel, for the same range as the overview. */
export function useMetricsEvents(range: { from: string; to: string }, opts?: { enabled?: boolean }): QueryResult<MetricsEvents> {
  const { userId } = useSession()
  return useQuery<MetricsEvents>(
    userId ? queryKey('admin', userId, 'events', range.from, range.to) : null,
    () => rpcJson(supabase.rpc('admin_metrics_events', { p_from: range.from, p_to: range.to })),
    { staleMs: STALE.metrics, enabled: opts?.enabled ?? true, keepPreviousData: true },
  )
}

/** Online now, refetched every 15 s while `enabled` (the Live tab is on screen) and the app is in front. */
export function useOnlineNow(opts?: { enabled?: boolean }): QueryResult<OnlineNow> {
  const { userId } = useSession()
  const enabled = opts?.enabled ?? true
  const result = useQuery<OnlineNow>(
    userId ? queryKey('admin', userId, 'online') : null,
    () => rpcJson(supabase.rpc('admin_online_now')),
    { staleMs: STALE.metricsLive, enabled },
  )
  const { refetch } = result
  useEffect(() => {
    if (!enabled) return
    const tick = () => {
      if (AppState.currentState === 'active' || AppState.currentState === undefined) void refetch()
    }
    const timer = setInterval(tick, LIVE_REFRESH_MS)
    return () => clearInterval(timer)
  }, [enabled, refetch])
  return result
}

export function useRetention(opts?: { enabled?: boolean }): QueryResult<RetentionReport> {
  const { userId } = useSession()
  return useQuery<RetentionReport>(
    userId ? queryKey('admin', userId, 'retention') : null,
    () => rpcJson(supabase.rpc('admin_retention', { p_weeks: 12 })),
    { staleMs: STALE.metrics, enabled: opts?.enabled ?? true },
  )
}

export const ADMIN_USERS_PAGE = 50

export function useAdminUsers(search: string, sort: AdminUserSort, pages: number, opts?: { enabled?: boolean }): QueryResult<AdminUsersPage> {
  const { userId } = useSession()
  const q = search.trim()
  return useQuery<AdminUsersPage>(
    userId ? queryKey('admin', userId, 'users', sort, pages, q) : null,
    () => rpcJson(supabase.rpc('admin_users', { p_search: q, p_sort: sort, p_limit: ADMIN_USERS_PAGE * pages, p_offset: 0 })),
    { staleMs: STALE.metrics, enabled: opts?.enabled ?? true, keepPreviousData: true },
  )
}

export function useAdminUserActivity(personId: string | undefined): QueryResult<AdminUserActivity | null> {
  const { userId } = useSession()
  return useQuery<AdminUserActivity | null>(
    userId && personId ? queryKey('admin', userId, 'person', personId) : null,
    () => rpcJson(supabase.rpc('admin_user_activity', { p_user: personId as string })),
    { staleMs: STALE.metrics },
  )
}
