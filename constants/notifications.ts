import type { NotificationPrefType, ReminderLeadMinutes } from '../types'

/** User-facing labels for notification preferences (and optional inbox grouping). */
export const NOTIFICATION_TYPE_LABELS: Record<NotificationPrefType, string> = {
  event_announcement: 'Event announcements',
  cheers_received: 'Cheers',
  event_material_change: 'Event updates',
  waitlist_promoted: 'Waitlist',
  event_cancelled: 'Cancellations',
  badge_earned: 'Badge achievements',
  cohost_added: 'Co-host invites',
  cheers_reminder: 'Cheers reminders',
  user_mentioned: 'Mentions',
  join_request: 'Join requests',
  request_approved: 'Request approved',
  request_denied: 'Request denied',
  event_reminder: 'Event reminders',
  late_dropout: 'Late dropouts (hosts)',
}

/** Settings → Notifications → Reminders: the lead times `user_settings.reminder_lead_minutes` allows. */
export const REMINDER_LEAD_OPTIONS: readonly { minutes: ReminderLeadMinutes; label: string }[] = [
  { minutes: 60, label: '1 hour' },
  { minutes: 120, label: '2 hours' },
  { minutes: 1440, label: 'Day before' },
]

/** The column default. */
export const DEFAULT_REMINDER_LEAD_MINUTES: ReminderLeadMinutes = 120

/** Reminder times are written in the club's time zone (matches `event_reminder_text` in the database). */
export const REMINDER_TIME_ZONE = 'America/Chicago'
