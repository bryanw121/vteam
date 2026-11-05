import { adsEnabled } from './feedAds'
import type { AdFreeStatus } from '../types'

export type AdFreeView = {
  /** An ad-free period is running. */
  active: boolean
  /** Enough points for one more period (renewing extends the current one). */
  canRedeem: boolean
  /** Points still needed when `canRedeem` is false. */
  shortBy: number
  /** When the period ends (or would end after redeeming now). */
  untilDate: Date | null
  nextUntilDate: Date
}

/** What the "Go ad-free" screen shows for a status. Pure, for tests. */
export function adFreeView(status: AdFreeStatus, now: number = Date.now()): AdFreeView {
  const active = !adsEnabled({ adFreeUntil: status.ad_free_until, now })
  const untilDate = active && status.ad_free_until ? new Date(status.ad_free_until) : null
  const from = untilDate ? untilDate.getTime() : now
  return {
    active,
    canRedeem: status.balance >= status.cost,
    shortBy: Math.max(0, status.cost - status.balance),
    untilDate,
    nextUntilDate: new Date(from + status.days * 86_400_000),
  }
}

/** "Nov 27, 2026". */
export function formatAdFreeDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
