import { readFileSync } from 'fs'
import { join } from 'path'
import {
  EVENT_CARD_MY_ATTENDANCE_SELECT,
  EVENT_CARD_MY_ATTENDANCE_SELECT_ATTENDING_ONLY,
} from '../constants'

/**
 * Widening the `my_attendance` embed from the attending-only view to the base
 * table makes it return waitlisted / requested / denied rows too. Anything that
 * treated *presence* of a row as "going" is now wrong — a waitlisted member
 * would see "Going ✓". These guards pin the two halves of that change.
 */

const root = join(__dirname, '..')
const eventCard = readFileSync(join(root, 'components/EventCard.tsx'), 'utf8')
const monthEvents = readFileSync(join(root, 'hooks/feed/fallback.ts'), 'utf8')

describe('the embed carries status', () => {
  it('selects the base table with a status column', () => {
    expect(EVENT_CARD_MY_ATTENDANCE_SELECT).toBe('my_attendance:event_attendees(user_id, status)')
  })

  it('keeps the previous attending-only shape available as a fallback', () => {
    expect(EVENT_CARD_MY_ATTENDANCE_SELECT_ATTENDING_ONLY)
      .toBe('my_attendance:event_attendees_attending(user_id)')
  })
})

describe('EventCard distinguishes attending from merely present', () => {
  it('routes the RSVP check through isAttendingRow', () => {
    const matches = eventCard.match(/my_attendance\.some\(a => a\.user_id === currentUserId && isAttendingRow\(a\)\)/g)
    // Both the compact card and the row card derive this independently.
    expect(matches).toHaveLength(2)
  })

  it('never treats bare row presence as attending', () => {
    expect(eventCard).not.toMatch(/my_attendance\.some\(a => a\.user_id === currentUserId\)/)
  })

  it('defaults a status-less row to attending, for rows from the old view', () => {
    expect(eventCard).toMatch(/\(row\.status \?\? 'attending'\) === 'attending'/)
  })
})

describe('the feed degrades instead of blanking if the embed is rejected', () => {
  it('retries with the attending-only select', () => {
    expect(monthEvents).toMatch(/EVENT_CARD_MY_ATTENDANCE_SELECT_ATTENDING_ONLY/)
  })

  it('only retries when the first attempt actually errored', () => {
    expect(monthEvents).toMatch(/if \(!first\.error \|\| !user\) return first/)
  })
})
