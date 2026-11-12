import {
  eventPoints,
  hostWillBeTold,
  leaveConsequenceText,
  leaveConsequences,
  leaveDmText,
  leaveSubtitle,
} from '../utils/leaveConsequences'
import type { LeaveEventInfo, LeaveRosterInfo, LeaveViewerInfo, Tag } from '../types'

// The start is 2026-11-12 19:00 in EVENT_TIME_ZONE (Thu, CST) = 01:00Z on the 13th. Text that
// reaches the host is written in that zone, so these pass whatever TZ the tests run in.
const START = '2026-11-13T01:00:00'
const START_MS = Date.parse('2026-11-13T01:00:00Z')
const HOUR = 3_600_000
const FAR = START_MS - 6 * 24 * HOUR

const tag = (name: string) => ({ tag_id: name, tags: { id: name, name, category: 'event_type', display_order: 1, created_at: '' } as Tag })

const event = (over: Partial<LeaveEventInfo> = {}): LeaveEventInfo => ({
  event_date: START,
  max_attendees: 12,
  requires_approval: false,
  price: 0,
  event_tags: [tag('Open Play')],
  hostName: 'Maya C.',
  ...over,
})
const roster = (over: Partial<LeaveRosterInfo> = {}): LeaveRosterInfo => ({ count: 8, isFull: false, spotsLeft: 4, waitlistCount: 0, ...over })
const me = (over: Partial<LeaveViewerInfo> = {}): LeaveViewerInfo => ({ isHostOrCohost: false, paid: false, ...over })

const kinds = (...args: Parameters<typeof leaveConsequences>) => leaveConsequences(...args).map(l => l.kind)
const texts = (...args: Parameters<typeof leaveConsequences>) => leaveConsequences(...args).map(leaveConsequenceText)

describe('leaveConsequences: capacity', () => {
  it('full with a waitlist says how many wait and where you would rejoin', () => {
    const lines = texts(event(), roster({ count: 12, isFull: true, spotsLeft: 0, waitlistCount: 2 }), me(), FAR)
    expect(lines[0]).toBe("It's full, 2 people are waiting. If you change your mind you'd join the waitlist as #3.")
  })

  it('uses the singular for one person waiting', () => {
    expect(texts(event(), roster({ isFull: true, spotsLeft: 0, waitlistCount: 1 }), me(), FAR)[0])
      .toBe("It's full, 1 person is waiting. If you change your mind you'd join the waitlist as #2.")
  })

  it('full with no waitlist warns you may not get back in', () => {
    expect(texts(event(), roster({ isFull: true, spotsLeft: 0 }), me(), FAR)[0])
      .toBe("It's full. If a spot doesn't open you won't get back in.")
  })

  it('open spots: you can rejoin any time', () => {
    expect(texts(event(), roster(), me(), FAR)[0]).toBe('4 spots are open, so you can rejoin any time.')
    expect(texts(event(), roster({ spotsLeft: 1 }), me(), FAR)[0]).toBe('1 spot is open, so you can rejoin any time.')
  })

  it('no cap: you can rejoin any time', () => {
    expect(texts(event({ max_attendees: null }), roster({ spotsLeft: null }), me(), FAR)[0])
      .toBe("There's no player limit, so you can rejoin any time.")
  })

  it('the low-stakes leave is two lines', () => {
    expect(kinds(event(), roster(), me(), FAR)).toEqual(['open', 'points'])
  })
})

describe('leaveConsequences: approval, host notice, money, points', () => {
  it('approval: rejoining means asking the host again', () => {
    const lines = texts(event({ requires_approval: true }), roster(), me(), FAR)
    expect(lines).toContain('Rejoining means asking Maya C. again.')
  })

  it('the host is told at exactly 24h and at 23h59m, not at 24h01m or after the start', () => {
    const notice = (now: number) => kinds(event(), roster(), me(), now).includes('hostNotified')
    expect(notice(START_MS - 24 * HOUR)).toBe(true)
    expect(notice(START_MS - 24 * HOUR + 60_000)).toBe(true)
    expect(notice(START_MS - 24 * HOUR - 60_000)).toBe(false)
    expect(notice(START_MS)).toBe(false)
    expect(notice(START_MS + 60_000)).toBe(false)
    expect(hostWillBeTold(START, START_MS - 5 * HOUR)).toBe(true)
  })

  it('a host or co-host on their own roster gets no notice line', () => {
    expect(kinds(event(), roster(), me({ isHostOrCohost: true }), START_MS - 5 * HOUR)).not.toContain('hostNotified')
  })

  it('names the host in the notice line', () => {
    expect(texts(event(), roster(), me(), START_MS - 5 * HOUR)).toContain('Maya C. (host) will be told you dropped out, since it starts within 24 hours.')
  })

  it('paid: only when you marked paid on a paid event', () => {
    expect(texts(event({ price: 10 }), roster(), me({ paid: true }), FAR)).toContain('You marked $10 paid. Refunds are up to Maya C..')
    expect(kinds(event({ price: 10 }), roster(), me({ paid: false }), FAR)).not.toContain('paid')
    expect(kinds(event({ price: 0 }), roster(), me({ paid: true }), FAR)).not.toContain('paid')
  })

  it('points: 2 for open play, 5 for an event tagged Tournament, always last', () => {
    expect(texts(event(), roster(), me(), FAR).at(-1)).toBe("You won't get the 2 points for this game.")
    expect(texts(event({ event_tags: [tag('Tournament')] }), roster(), me(), FAR).at(-1)).toBe("You won't get the 5 points for this game.")
    expect(eventPoints({ event_tags: undefined })).toBe(2)
  })

  it('everything that applies, in order', () => {
    expect(kinds(
      event({ requires_approval: true, price: 10 }),
      roster({ isFull: true, spotsLeft: 0, waitlistCount: 2 }),
      me({ paid: true }),
      START_MS - 5 * HOUR,
    )).toEqual(['waitlist', 'approval', 'hostNotified', 'paid', 'points'])
  })
})

describe('leaveSubtitle', () => {
  // The subtitle is the player's own screen: device time. Build the start in
  // the device's zone (Thu Nov 12, 7 PM local) so this holds in any TZ.
  const LOCAL_MS = new Date(2026, 10, 12, 19, 0).getTime()
  const LOCAL = new Date(LOCAL_MS).toISOString()

  it('says how soon, then the day and time', () => {
    expect(leaveSubtitle(LOCAL, LOCAL_MS - 5 * HOUR)).toBe('Starts in 5 hours · Thu 7:00 PM')
    expect(leaveSubtitle(LOCAL, LOCAL_MS - 6 * 24 * HOUR)).toBe('In 6 days · Thu 7:00 PM')
    expect(leaveSubtitle(LOCAL, LOCAL_MS - 30 * 60_000)).toBe('Starts in 30 minutes · Thu 7:00 PM')
    expect(leaveSubtitle(LOCAL, LOCAL_MS + 60_000)).toBe('Already started · Thu 7:00 PM')
  })
})

describe('leaveDmText', () => {
  const base = { title: 'Thursday Indoor Reverse 4s', eventDate: START }

  it('reason and note', () => {
    expect(leaveDmText({ ...base, reasonLabel: 'Something came up', note: 'Sorry for the late notice!' }))
      .toBe('Left Thursday Indoor Reverse 4s (Thu 7:00 PM): Something came up. Sorry for the late notice!')
  })

  it('reason only, note only', () => {
    expect(leaveDmText({ ...base, reasonLabel: 'Sick', note: '  ' })).toBe('Left Thursday Indoor Reverse 4s (Thu 7:00 PM): Sick.')
    expect(leaveDmText({ ...base, reasonLabel: null, note: ' Back next week ' })).toBe('Left Thursday Indoor Reverse 4s (Thu 7:00 PM): Back next week')
  })

  it("writes the game's time in the event zone, not the sender's device zone", () => {
    // Host-facing: the same text whatever TZ the leaving player's phone is in.
    expect(leaveDmText({ ...base, reasonLabel: 'Sick', note: '' })).toContain('(Thu 7:00 PM)')
  })

  it('nothing to say: no message', () => {
    expect(leaveDmText({ ...base, reasonLabel: null, note: '' })).toBeNull()
  })
})
