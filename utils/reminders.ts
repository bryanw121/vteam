import { REMINDER_TIME_ZONE } from '../constants/notifications'
import type { ReminderCopy, ReminderLeadMinutes } from '../types'

/**
 * Event reminder copy. The database writes the real reminders
 * (`public.event_reminder_text`, migration 20261101090000_event_reminders);
 * this mirrors it for the Settings preview, and its tests pin the same cases
 * the SQL was checked against on beta. Change both together.
 *
 *   title: "<event title> at 4:00 PM"
 *   body:  "Starts in 2 hours · <location>" | "Starts in 1 hour · …" | "Tomorrow at 9:30 AM · …"
 */

function localParts(ms: number): { day: number; clock: string; weekday: string } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: REMINDER_TIME_ZONE, year: 'numeric', month: 'numeric', day: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true, weekday: 'long',
    }).formatToParts(new Date(ms)).map(p => [p.type, p.value]),
  )
  return {
    // Days since the epoch for the local calendar date (only differences are used).
    day: Date.UTC(+parts.year, +parts.month - 1, +parts.day) / 86_400_000,
    clock: `${parts.hour}:${parts.minute} ${String(parts.dayPeriod).toUpperCase()}`,
    weekday: parts.weekday,
  }
}

export function reminderCopy(args: { title: string | null; location: string | null; startsAtMs: number; nowMs: number }): ReminderCopy {
  const start = localParts(args.startsAtMs)
  const now = localParts(args.nowMs)
  const mins = Math.max(0, Math.round((args.startsAtMs - args.nowMs) / 60_000))
  const hours = Math.round(mins / 60)

  let relative: string
  if (start.day === now.day + 1) relative = `Tomorrow at ${start.clock}`
  else if (start.day > now.day + 1) relative = `Starts ${start.weekday} at ${start.clock}`
  else if (mins >= 90) relative = `Starts in ${hours} hours`
  else if (mins >= 50) relative = 'Starts in 1 hour'
  else {
    const m = Math.max(mins, 1)
    relative = `Starts in ${m} ${m === 1 ? 'minute' : 'minutes'}`
  }

  const title = args.title?.trim() || 'Your event'
  const location = args.location?.trim()
  return {
    title: `${title} at ${start.clock}`,
    body: location ? `${relative} · ${location}` : relative,
  }
}

/** A 4:00 PM Austin start (22:00 UTC in winter), for the Settings example. */
const PREVIEW_START_MS = Date.UTC(2026, 0, 15, 22, 0)

/** Example reminder for the Settings preview: a 4:00 PM event, as it reads at `lead`. */
export function reminderPreview(lead: ReminderLeadMinutes): ReminderCopy {
  return reminderCopy({ title: 'Sand Doubles', location: 'Butler Park', startsAtMs: PREVIEW_START_MS, nowMs: PREVIEW_START_MS - lead * 60_000 })
}

/** Whether a stored value is one the settings column allows. */
export function isReminderLead(v: unknown): v is ReminderLeadMinutes {
  return v === 60 || v === 120 || v === 1440
}
