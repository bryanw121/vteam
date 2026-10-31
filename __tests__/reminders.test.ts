import { readFileSync } from 'fs'
import { join } from 'path'
import { isReminderLead, reminderCopy, reminderPreview } from '../utils/reminders'
import { NOTIFICATION_TYPES } from '../types'
import { REMINDER_LEAD_OPTIONS } from '../constants/notifications'

const H = 3_600_000
/** 4:00 PM in Austin on a winter day (CST, UTC-6). */
const START = Date.UTC(2026, 0, 15, 22, 0)

const copy = (minutesBefore: number, extra: Partial<Parameters<typeof reminderCopy>[0]> = {}) =>
  reminderCopy({ title: 'Sand Doubles at Butler', location: 'Butler Park Sand Courts', startsAtMs: START, nowMs: START - minutesBefore * 60_000, ...extra })

// The same cases were run against public.event_reminder_text on beta (see the PR);
// keep the two in step.
describe('reminderCopy', () => {
  it('says when the event starts, at the lead time', () => {
    expect(copy(120)).toEqual({ title: 'Sand Doubles at Butler at 4:00 PM', body: 'Starts in 2 hours · Butler Park Sand Courts' })
    expect(copy(60)).toEqual({ title: 'Sand Doubles at Butler at 4:00 PM', body: 'Starts in 1 hour · Butler Park Sand Courts' })
    expect(copy(24 * 60).body).toBe('Tomorrow at 4:00 PM · Butler Park Sand Courts')
  })

  it('rounds the cron delay (runs every 10 minutes) to whole hours', () => {
    expect(copy(112).body).toMatch(/^Starts in 2 hours/)
    expect(copy(53).body).toMatch(/^Starts in 1 hour ·/)
    expect(copy(30).body).toMatch(/^Starts in 30 minutes/)
    expect(copy(0).body).toMatch(/^Starts in 1 minute ·/)
  })

  it('uses Austin time for the clock and for "tomorrow"', () => {
    // 9:30 AM Austin = 15:30 UTC; reminded 12 hours earlier, at 9:30 PM the evening before.
    const morning = Date.UTC(2026, 0, 16, 15, 30)
    expect(reminderCopy({ title: 'Drills', location: null, startsAtMs: morning, nowMs: morning - 12 * H })).toEqual({
      title: 'Drills at 9:30 AM',
      body: 'Tomorrow at 9:30 AM',
    })
    // Same local day although UTC dates differ: 8 PM Austin is 02:00 UTC the next day.
    const evening = Date.UTC(2026, 0, 16, 2, 0)
    expect(reminderCopy({ title: 'Night 6s', location: 'Gym', startsAtMs: evening, nowMs: evening - 2 * H }).title).toBe('Night 6s at 8:00 PM')
    expect(reminderCopy({ title: 'Night 6s', location: 'Gym', startsAtMs: evening, nowMs: evening - 2 * H }).body).toBe('Starts in 2 hours · Gym')
  })

  it('falls back when the title or location is blank', () => {
    expect(copy(120, { title: '  ', location: ' ' })).toEqual({ title: 'Your event at 4:00 PM', body: 'Starts in 2 hours' })
  })

  it('previews each lead time with the same 4:00 PM event', () => {
    expect(REMINDER_LEAD_OPTIONS.map(o => reminderPreview(o.minutes).body)).toEqual([
      'Starts in 1 hour · Butler Park',
      'Starts in 2 hours · Butler Park',
      'Tomorrow at 4:00 PM · Butler Park',
    ])
  })

  it('accepts only the lead times the column allows', () => {
    expect([60, 120, 1440].every(isReminderLead)).toBe(true)
    expect([0, 5, 90, null, '120'].some(isReminderLead)).toBe(false)
  })
})

describe('event reminders migration', () => {
  const dir = join(__dirname, '..', 'supabase', 'migrations')
  const up = readFileSync(join(dir, '20261101090000_event_reminders.sql'), 'utf8')
  const down = readFileSync(join(dir, '20261101090000_event_reminders.down.sql'), 'utf8')
  const typesIn = (sql: string, from: number) => {
    const block = sql.slice(sql.indexOf('add constraint notifications_notification_type_check', from))
    return [...block.slice(0, block.indexOf(');')).matchAll(/'([a-z_]+)'/g)].map(m => m[1])
  }

  it('widens the type constraint to exactly NOTIFICATION_TYPES', () => {
    expect(typesIn(up, 0).sort()).toEqual([...NOTIFICATION_TYPES].sort())
  })

  it('restores the previous list on the way down', () => {
    expect(typesIn(down, 0).sort()).toEqual(NOTIFICATION_TYPES.filter(t => t !== 'event_reminder' && t !== 'late_dropout').sort())
  })

  it('allows the same lead times as the settings chips', () => {
    expect(up).toMatch(new RegExp(`reminder_lead_minutes in \\(${REMINDER_LEAD_OPTIONS.map(o => o.minutes).join(', ')}\\)`))
  })

  it('keeps the reminder function off the client API', () => {
    expect(up).toMatch(/revoke execute on function public\.send_event_reminders\(\) from public, anon, authenticated/)
  })
})
