import { cheerChips, cheeredYou, groupNotifications, inboxBody, parseLegacyCheerBody } from '../utils/notificationGroups'
import type { Notification } from '../types'

const E1 = 'e1'
let n = 0
function row(over: Partial<Notification> = {}): Notification {
  n += 1
  return {
    id: `n${n}`, user_id: 'me', notification_type: 'cheers_received', title: 'You received cheers',
    body: 'rileyk gave you pass cheers · Thursday Open Play', data: { event_id: E1, deep_link: `/event/${E1}` },
    read_at: null, created_at: new Date(2026, 10, 7, 20, 60 - n).toISOString(), ...over,
  } as Notification
}

describe('groupNotifications (#194)', () => {
  it('collapses per-cheer rows from before #194 into one per game and read state', () => {
    const rows = [
      row({ body: 'sam.ortiz gave you spike cheers · Thursday Open Play' }),
      row(),
      row({ body: 'rileyk gave you dig pass cheers · Thursday Open Play' }),
      row({ read_at: '2026-11-06T00:00:00Z' }),
      row({ notification_type: 'event_material_change', title: 'Sunday Sand updated', body: 'x', data: { event_id: 'e2' } }),
    ]
    const out = groupNotifications(rows)
    expect(out).toHaveLength(3)
    const [unread, read, change] = out
    expect(unread.groupIds).toEqual([rows[0].id, rows[1].id, rows[2].id])
    expect(unread.title).toBe('3 cheers from Thursday Open Play')
    expect(unread.body).toBe('sam.ortiz and rileyk cheered you')
    expect(unread.data?.cheer_counts).toEqual({ spike: 1, pass: 1, dig_pass: 1 })
    expect(read.groupIds).toBeUndefined() // a single row stays as it was
    expect(read.title).toBe('You received cheers')
    expect(change.notification_type).toBe('event_material_change')
  })

  it('leaves rows the server already grouped alone', () => {
    const grouped = row({ title: '5 cheers from Thursday Open Play', data: { event_id: E1, giver_count: 4, cheer_counts: { pass: 2 } } })
    const out = groupNotifications([grouped, row({ data: { event_id: E1, giver_count: 1 } })])
    expect(out).toHaveLength(2)
    expect(out[0]).toBe(grouped)
  })

  it('keeps the newest-first order', () => {
    const a = row({ notification_type: 'waitlist_promoted', data: {} })
    const b = row()
    const c = row()
    expect(groupNotifications([a, b, c]).map(x => x.id)).toEqual([a.id, b.id])
  })
})

describe('helpers', () => {
  it('parses the old body', () => {
    expect(parseLegacyCheerBody('dana_v gave you dig pass cheers · Sunday Sand')).toEqual({ name: 'dana_v', type: 'dig_pass', eventTitle: 'Sunday Sand' })
    expect(parseLegacyCheerBody('dana_v gave you serve cheers')).toEqual({ name: 'dana_v', type: 'serve', eventTitle: undefined })
    expect(parseLegacyCheerBody('something else')).toEqual({})
  })

  it('names who cheered, like the server', () => {
    expect(cheeredYou(['a'])).toBe('a cheered you')
    expect(cheeredYou(['a', 'b'])).toBe('a and b cheered you')
    expect(cheeredYou(['a', 'b', 'c'])).toBe('a, b and c cheered you')
    expect(cheeredYou(['a', 'b', 'c', 'd'])).toBe('a, b and 2 others cheered you')
  })

  it('makes chips, most first', () => {
    expect(cheerChips({ spike: 1, pass: 2, dig_pass: 1 })).toEqual(['Pass ×2', 'Dig Pass', 'Spike'])
    expect(cheerChips(undefined)).toEqual([])
  })
})

describe('inboxBody', () => {
  it('drops the cheer-type tail when chips show it', () => {
    expect(inboxBody({ body: 'a and b cheered you · Pass ×2', data: { cheer_counts: { pass: 2 } } })).toBe('a and b cheered you')
    expect(inboxBody({ body: 'Court 3 tonight · side door', data: {} })).toBe('Court 3 tonight · side door')
  })
})
