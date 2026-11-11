import { supabase } from '../lib/supabase'
import { BADGE_DEFINITIONS, BETA_ACTIVE, VEX_MEMBER_ACTIVE, badgeTierLabel } from '../constants/badges'
import type { BadgeDef } from '../constants/badges'
import type { BadgeAwardPlan, BadgeStats, CheersReceived, UserBadge, Profile } from '../types'
import { countCheers } from './cheers'
import { USER_BADGE_SELECT } from '../constants/selects'

// ─── Stats ────────────────────────────────────────────────────────────────────

/**
 * `received`: the player's received cheers by type when the caller already has
 * them (Profile's shared read, #224); otherwise they are read here.
 */
export async function collectBadgeStats(
  userId: string,
  profile: Pick<Profile, 'first_name' | 'last_name' | 'position' | 'avatar_url'>,
  received?: CheersReceived,
): Promise<BadgeStats> {
  const now = new Date().toISOString()

  const [attendedRes, hostedRes, receivedCheers, cheersGivenRes] = await Promise.all([
    // Past events attended (status = attending, event already started).
    // head+count — only the tally is used, so the rows are never transferred.
    supabase
      .from('event_attendees')
      .select('event_id, events!inner(event_date)', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'attending')
      .lt('events.event_date', now),

    // Past events hosted (with tags to detect tournaments)
    supabase
      .from('events')
      .select('id, event_tags(tags(name))')
      .eq('created_by', userId)
      .lt('event_date', now),

    // All cheers received (with type breakdown)
    received
      ? Promise.resolve(received)
      : supabase.from('cheers').select('cheer_type').eq('receiver_id', userId)
          .then(res => countCheers((res.data ?? []) as { cheer_type: string }[])),

    // Events where this user gave cheers (for distinct-event count)
    supabase
      .from('cheers')
      .select('event_id')
      .eq('giver_id', userId),
  ])

  // Attendee count — from the head+count query above, so `data` is always null here
  const attendedCount = attendedRes.count ?? 0

  // Hosted count + tournament check
  const hostedEvents = hostedRes.data ?? []
  const hostedCount = hostedEvents.length
  const tournamentHosted = hostedEvents.some((e: any) =>
    (e.event_tags ?? []).some((et: any) =>
      et.tags?.name?.toLowerCase().includes('tournament'),
    ),
  )

  // Cheer breakdown
  const byType = receivedCheers.byType

  // Distinct events where cheers were given
  const cheersGiven = cheersGivenRes.data ?? []
  const distinctCheersGivenEvents = new Set(
    (cheersGiven as { event_id: string }[]).map(c => c.event_id),
  ).size

  const profileComplete = !!(
    profile.first_name &&
    profile.last_name &&
    (profile.position?.length ?? 0) > 0 &&
    profile.avatar_url
  )

  return {
    events_attended_past: attendedCount,
    events_hosted_past: hostedCount,
    cheers_received_total: receivedCheers.total,
    cheers_given_events: distinctCheersGivenEvents,
    spike_cheers: byType['spike'] ?? 0,
    serve_cheers: byType['serve'] ?? 0,
    block_cheers: byType['block'] ?? 0,
    set_cheers: byType['set'] ?? 0,
    dig_pass_cheers: (byType['dig'] ?? 0) + (byType['pass'] ?? 0),
    communication_cheers: byType['communication'] ?? 0,
    tournament_hosted: tournamentHosted,
    profile_complete: profileComplete,
  }
}

/**
 * The badge list after an award: changed rows replace theirs (upgrades), new
 * ones go last (they have no display slot, and the list is ordered by slot).
 * Lets the check update the cache from the rows the award returned instead of
 * reading the whole list again (#224).
 */
export function mergeAwardedBadges(existing: UserBadge[], awarded: UserBadge[]): UserBadge[] {
  const byId = new Map(awarded.map(b => [b.id, b]))
  const merged = existing.map(b => byId.get(b.id) ?? b)
  const known = new Set(existing.map(b => b.id))
  return [...merged, ...awarded.filter(b => !known.has(b.id))]
}

// ─── Award logic ──────────────────────────────────────────────────────────────

/**
 * Compares current stats to badge thresholds. Inserts new badges and upgrades
 * existing tiers as needed. Fires a notification for each new award/upgrade.
 * Returns the list of newly awarded / upgraded badges.
 */
/** Numeric value of the stat a badge is judged on. Booleans count as 1/0. */
export function badgeStatValue(def: BadgeDef, stats: BadgeStats): number {
  switch (def.stat) {
    case 'beta_active':       return BETA_ACTIVE ? 1 : 0
    case 'vex_member':        return VEX_MEMBER_ACTIVE ? 1 : 0
    case 'tournament_hosted': return stats.tournament_hosted ? 1 : 0
    case 'profile_complete':  return stats.profile_complete ? 1 : 0
    default:                  return stats[def.stat as keyof BadgeStats] as number
  }
}

/**
 * Pure planning step: what should be awarded or upgraded, given stats and the
 * badges a user already holds. Separated from the writes so the threshold logic
 * is unit-testable without a database.
 *
 * A badge is never downgraded or revoked — manually granted badges (the Vex is
 * awarded by hand; see `VEX_MEMBER_ACTIVE`) must survive every check.
 */
export function planBadgeAwards(stats: BadgeStats, existingBadges: UserBadge[]): BadgeAwardPlan {
  const plan: BadgeAwardPlan = { inserts: [], upgrades: [] }

  for (const def of BADGE_DEFINITIONS) {
    const statValue = badgeStatValue(def, stats)

    // Highest tier the user qualifies for
    const qualifyingTiers = def.tiers.filter(t => statValue >= t.threshold)
    if (qualifyingTiers.length === 0) continue
    const highest = qualifyingTiers[qualifyingTiers.length - 1]

    const existing = existingBadges.find(b => b.badge_type === def.type)

    if (!existing) {
      plan.inserts.push({
        badge_type: def.type, tier: highest.tier,
        label: highest.label, description: def.description,
      })
    } else if (highest.tier > existing.tier) {
      plan.upgrades.push({
        id: existing.id, badge_type: def.type, tier: highest.tier,
        label: badgeTierLabel(def, highest.tier), description: def.description,
      })
    }
  }

  return plan
}

/**
 * Compares current stats to badge thresholds. Inserts new badges and upgrades
 * existing tiers as needed. Fires a notification for each new award/upgrade.
 * Returns the list of newly awarded / upgraded badges.
 *
 * Writes are batched: this previously awaited a badge insert *and* a
 * notification insert inside a loop over every badge definition, so a user
 * qualifying for several badges paid that many serial round-trips.
 */
export async function checkAndAwardBadges(
  userId: string,
  stats: BadgeStats,
  existingBadges: UserBadge[],
): Promise<UserBadge[]> {
  const plan = planBadgeAwards(stats, existingBadges)
  if (plan.inserts.length === 0 && plan.upgrades.length === 0) return []

  const awarded: UserBadge[] = []
  const notifications: { badge_type: string; title: string; body: string }[] = []

  // New badges — one insert for all of them.
  if (plan.inserts.length > 0) {
    const { data, error } = await supabase
      .from('user_badges')
      .insert(plan.inserts.map(i => ({ user_id: userId, badge_type: i.badge_type, tier: i.tier })))
      .select(USER_BADGE_SELECT)

    if (!error && data) {
      awarded.push(...(data as UserBadge[]))
      for (const row of data as UserBadge[]) {
        const planned = plan.inserts.find(i => i.badge_type === row.badge_type)
        if (planned) {
          notifications.push({
            badge_type: planned.badge_type,
            title: `Badge unlocked: ${planned.label}`,
            body: planned.description,
          })
        }
      }
    }
  }

  // Tier upgrades — each targets a different row, so they run concurrently
  // rather than one after another.
  if (plan.upgrades.length > 0) {
    const awardedAt = new Date().toISOString()
    const results = await Promise.all(
      plan.upgrades.map(u =>
        supabase
          .from('user_badges')
          .update({ tier: u.tier, awarded_at: awardedAt })
          .eq('id', u.id)
          .select(USER_BADGE_SELECT)
          .single(),
      ),
    )
    results.forEach((res, i) => {
      if (!res.error && res.data) {
        awarded.push(res.data as UserBadge)
        notifications.push({
          badge_type: plan.upgrades[i].badge_type,
          title: `Badge upgraded: ${plan.upgrades[i].label}`,
          body: plan.upgrades[i].description,
        })
      }
    })
  }

  // One insert for every notification this check produced.
  if (notifications.length > 0) {
    await supabase.from('notifications').insert(
      notifications.map(n => ({
        user_id: userId,
        notification_type: 'badge_earned',
        title: n.title,
        body: n.body,
        data: { badge_type: n.badge_type },
      })),
    )
  }

  return awarded
}
