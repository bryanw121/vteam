import { planBadgeAwards, badgeStatValue, mergeAwardedBadges } from '../utils/badges'
import type { BadgeStats } from '../types'
import { BADGE_DEFINITIONS, VEX_MEMBER_ACTIVE } from '../constants/badges'
import type { UserBadge } from '../types'

/**
 * Guards for the badge award planner.
 *
 * `planBadgeAwards` is the pure half of `checkAndAwardBadges` — extracted so the
 * threshold logic can be tested without a database. The write half batches the
 * plan into one insert (it previously awaited an insert *and* a notification
 * insert inside a loop over all 14 badge definitions).
 */

const noStats: BadgeStats = {
  events_attended_past: 0,
  events_hosted_past: 0,
  cheers_received_total: 0,
  cheers_given_events: 0,
  spike_cheers: 0,
  serve_cheers: 0,
  block_cheers: 0,
  set_cheers: 0,
  dig_pass_cheers: 0,
  communication_cheers: 0,
  tournament_hosted: false,
  profile_complete: false,
}

function badge(badge_type: string, tier: number): UserBadge {
  return {
    id: `id-${badge_type}`,
    user_id: 'user-1',
    badge_type,
    tier,
    awarded_at: '2026-01-01T00:00:00Z',
    display_order: null,
  } as UserBadge
}

describe('badgeStatValue', () => {
  it('maps boolean criteria to 1/0', () => {
    const def = BADGE_DEFINITIONS.find(d => d.stat === 'profile_complete')!
    expect(badgeStatValue(def, { ...noStats, profile_complete: true })).toBe(1)
    expect(badgeStatValue(def, { ...noStats, profile_complete: false })).toBe(0)
  })

  it('reads numeric criteria straight off the stats', () => {
    const def = BADGE_DEFINITIONS.find(d => d.stat === 'events_attended_past')!
    expect(badgeStatValue(def, { ...noStats, events_attended_past: 7 })).toBe(7)
  })
})

describe('planBadgeAwards', () => {
  it('awards nothing when no threshold is met', () => {
    const plan = planBadgeAwards(noStats, [])
    expect(plan.inserts.filter(i => i.badge_type === 'event_attendee')).toHaveLength(0)
    expect(plan.upgrades).toHaveLength(0)
  })

  it('awards the highest qualifying tier in one step, not each tier in turn', () => {
    // 25 events attended clears Newcomer/Regular/Veteran/Elite — a new user
    // should land on Elite directly rather than being awarded four times.
    const plan = planBadgeAwards({ ...noStats, events_attended_past: 25 }, [])
    const attendee = plan.inserts.filter(i => i.badge_type === 'event_attendee')
    expect(attendee).toHaveLength(1)
    expect(attendee[0].tier).toBe(4)
  })

  it('upgrades an existing badge when a higher tier is reached', () => {
    const plan = planBadgeAwards(
      { ...noStats, events_attended_past: 10 },
      [badge('event_attendee', 1)],
    )
    expect(plan.inserts.filter(i => i.badge_type === 'event_attendee')).toHaveLength(0)
    expect(plan.upgrades).toContainEqual(expect.objectContaining({ badge_type: 'event_attendee', tier: 3 }))
  })

  it('does not re-insert a badge the user already holds', () => {
    const plan = planBadgeAwards(
      { ...noStats, events_attended_past: 1 },
      [badge('event_attendee', 1)],
    )
    expect(plan.inserts.filter(i => i.badge_type === 'event_attendee')).toHaveLength(0)
    expect(plan.upgrades.filter(u => u.badge_type === 'event_attendee')).toHaveLength(0)
  })

  it('never downgrades a badge when stats drop below the earned tier', () => {
    const plan = planBadgeAwards(
      { ...noStats, events_attended_past: 1 },
      [badge('event_attendee', 4)],
    )
    expect(plan.upgrades).toHaveLength(0)
    expect(plan.inserts.filter(i => i.badge_type === 'event_attendee')).toHaveLength(0)
  })

  // ── Manual grants must survive automated checks ─────────────────────────────
  it('leaves a manually granted Vex badge alone', () => {
    // The Vex is granted by hand via SQL (VEX_MEMBER_ACTIVE is false so it is
    // never auto-awarded). A badge check must never revoke or duplicate it.
    expect(VEX_MEMBER_ACTIVE).toBe(false)
    const plan = planBadgeAwards(noStats, [badge('vex_spirit', 1)])
    expect(plan.inserts.filter(i => i.badge_type === 'vex_spirit')).toHaveLength(0)
    expect(plan.upgrades.filter(u => u.badge_type === 'vex_spirit')).toHaveLength(0)
  })

  it('does not auto-award the Vex to someone who lacks it', () => {
    const plan = planBadgeAwards(noStats, [])
    expect(plan.inserts.filter(i => i.badge_type === 'vex_spirit')).toHaveLength(0)
  })

  it('carries the tier label and description for the notification', () => {
    const plan = planBadgeAwards({ ...noStats, events_attended_past: 1 }, [])
    const attendee = plan.inserts.find(i => i.badge_type === 'event_attendee')!
    expect(attendee.label).toBe('Newcomer')
    expect(attendee.description).toBeTruthy()
  })

  it('plans several badges together so they can be written in one batch', () => {
    const plan = planBadgeAwards(
      { ...noStats, events_attended_past: 5, events_hosted_past: 1, profile_complete: true },
      [],
    )
    const types = plan.inserts.map(i => i.badge_type)
    expect(types).toEqual(expect.arrayContaining(['event_attendee', 'event_host', 'profile_complete']))
  })
})

describe('mergeAwardedBadges (#224)', () => {
  const badge = (id: string, badge_type: string, tier: number, display_order: number | null = null) =>
    ({ id, user_id: 'u1', badge_type, tier, awarded_at: '2026-11-01T00:00:00Z', display_order, display_tier: null }) as UserBadge

  it('replaces upgraded rows in place and adds new ones last', () => {
    const existing = [badge('a', 'regular', 1, 1), badge('b', 'host', 1)]
    const merged = mergeAwardedBadges(existing, [badge('c', 'spike', 1), badge('a', 'regular', 2, 1)])
    expect(merged.map(b => [b.id, b.tier])).toEqual([['a', 2], ['b', 1], ['c', 1]])
  })

  it('leaves the list as it was when nothing was awarded', () => {
    const existing = [badge('a', 'regular', 1)]
    expect(mergeAwardedBadges(existing, [])).toEqual(existing)
  })
})
