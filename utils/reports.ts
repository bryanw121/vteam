import { REPORT_REVIEW_HOURS } from '../constants/reports'

/** "due in 5 h" / "3 h overdue" for an open report, against the review target. Pure. */
export function reportDueLabel(createdAt: string, now: Date = new Date()): string {
  const dueMs = new Date(createdAt).getTime() + REPORT_REVIEW_HOURS * 3_600_000
  const hours = Math.round((dueMs - now.getTime()) / 3_600_000)
  if (hours > 0) return `due in ${hours} h`
  if (hours === 0) return 'due now'
  return `${-hours} h overdue`
}
