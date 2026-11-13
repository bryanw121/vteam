import type { ReportContextKind, ReportReason } from '../types'

/** Why someone is being reported (#243): keys match `user_reports.reason`'s check. */
export const REPORT_REASONS: readonly { key: ReportReason; label: string }[] = [
  { key: 'harassment', label: 'Harassment or threats' },
  { key: 'hate', label: 'Hate or slurs' },
  { key: 'spam', label: 'Spam or scam' },
  { key: 'unsafe_play', label: 'Unsafe or unsportsmanlike play' },
  { key: 'fake_profile', label: 'Fake profile' },
  { key: 'other', label: 'Something else' },
]

export const REPORT_REASON_LABELS: Record<ReportReason, string> = Object.fromEntries(
  REPORT_REASONS.map(r => [r.key, r.label]),
) as Record<ReportReason, string>

export const REPORT_CONTEXT_LABELS: Record<ReportContextKind, string> = {
  profile: 'Profile',
  dm: 'Direct message',
  message: 'Message',
  event_comment: 'Event comment',
  club_post: 'Club post',
}

export const REPORT_DETAILS_MAX = 1000

/** Hours the team aims to review a report within (shown to reporters and as "due in" to admins). */
export const REPORT_REVIEW_HOURS = 24
