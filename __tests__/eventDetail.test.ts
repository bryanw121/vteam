import { EVENT_TAB, initialMountedTabs, joinIntentOnReturn, joinIntentWhen, mentionTargets, usesDocScroll } from '../utils/eventDetail'
import { localDate } from './helpers/clock'
import type { AttendanceStatus, Profile } from '../types'

const p = (id: string, username: string, first: string | null = null): Profile =>
  ({ id, username, first_name: first, last_name: null } as unknown as Profile)

const STATUS: AttendanceStatus = {
  count: 3, spotsLeft: 5, isFull: false, isAttending: false, isOwner: false, isWaitlisted: false,
  waitlistPosition: null, waitlistCount: 0, isRequested: false, isDenied: false, denialReason: null,
}
const OPEN = { cancelled: false, over: false, requiresApproval: false }

describe('initialMountedTabs', () => {
  it('mounts Details and prefetches People when the link opens Details', () => {
    expect([...initialMountedTabs(EVENT_TAB.details)].sort()).toEqual([EVENT_TAB.details, EVENT_TAB.people])
  })
  it('mounts Details and the linked tab, not People, for any other tab', () => {
    expect([...initialMountedTabs(EVENT_TAB.discussion)].sort()).toEqual([EVENT_TAB.details, EVENT_TAB.discussion])
  })
})

describe('usesDocScroll', () => {
  it('is on for Details and People on mobile web only', () => {
    expect(usesDocScroll(true, EVENT_TAB.details)).toBe(true)
    expect(usesDocScroll(true, EVENT_TAB.people)).toBe(true)
    expect(usesDocScroll(true, EVENT_TAB.discussion)).toBe(false)
    expect(usesDocScroll(true, EVENT_TAB.cheers)).toBe(false)
    expect(usesDocScroll(false, EVENT_TAB.details)).toBe(false)
  })
})

describe('mentionTargets', () => {
  it('lists attendees, co-hosts and the host once each, never the viewer', () => {
    const host = p('h', 'hosty', 'Hana')
    const { mentionableUsers } = mentionTargets([p('a', 'ana', 'Ana'), p('me', 'me'), host, null, p('a', 'ana', 'Ana'), host], 'me')
    expect(mentionableUsers.map(u => u.id)).toEqual(['a', 'h'])
    expect(mentionableUsers[0]).toMatchObject({ username: 'ana' })
  })
  it('maps every username, the viewer included, to an id for tappable mentions', () => {
    const { usernameToId } = mentionTargets([p('a', 'ana'), p('me', 'me'), undefined], 'me')
    expect(Object.fromEntries(usernameToId)).toEqual({ ana: 'a', me: 'me' })
  })
})

describe('joinIntentOnReturn', () => {
  const action = { kind: 'join' as const, eventId: 'e1', title: 'Sand', startsAt: '2030-01-01T19:00:00', at: 0 }
  it('does nothing when nothing was saved', () => {
    expect(joinIntentOnReturn(null, STATUS, OPEN)).toBeNull()
  })
  it('records an expired intent without offering anything', () => {
    expect(joinIntentOnReturn({ status: 'expired' }, STATUS, OPEN)).toEqual({ outcome: 'expired' })
  })
  it('offers the same signup the footer would', () => {
    expect(joinIntentOnReturn({ status: 'ok', action }, STATUS, OPEN)).toEqual({ offer: 'join' })
    expect(joinIntentOnReturn({ status: 'ok', action }, { ...STATUS, isFull: true, spotsLeft: 0 }, OPEN)).toEqual({ offer: 'waitlist' })
    expect(joinIntentOnReturn({ status: 'ok', action }, STATUS, { ...OPEN, requiresApproval: true })).toEqual({ offer: 'request' })
  })
  it('skips when the viewer is already in, or the game is over or cancelled', () => {
    expect(joinIntentOnReturn({ status: 'ok', action }, { ...STATUS, isAttending: true }, OPEN)).toEqual({ outcome: 'skipped' })
    expect(joinIntentOnReturn({ status: 'ok', action }, STATUS, { ...OPEN, over: true })).toEqual({ outcome: 'skipped' })
    expect(joinIntentOnReturn({ status: 'ok', action }, STATUS, { ...OPEN, cancelled: true })).toEqual({ outcome: 'skipped' })
  })
})

describe('joinIntentWhen', () => {
  it('reads as weekday and time', () => {
    expect(joinIntentWhen(localDate(2026, 11, 28, 16, 0).getTime())).toBe('Sat 4:00 PM')
  })
})
