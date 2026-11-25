/**
 * Teams for a solo sign-up tournament (#282), pure so they can be tested: the
 * organizer pins friends together, then draws teams at random or balanced by
 * level. Unlike the event team board (`balanceAssignments`), sign-ups rarely
 * divide evenly, so teams may differ by one player, and pins are "keep these
 * together" groups rather than a team number.
 */
import { SKILL_POINTS, levelForPoints } from '../hooks/event/derive'
import { soloTeamCount } from './soloTeamCount'
import type { BalancePlayer, SoloTeamDraft, TeamMode, VolleyballSkillLevel } from '../types'

export { soloTeamCount }

/** Each team's size for `players` over `teams` teams: the first ones take the extra players. */
export function soloTeamSizes(players: number, teams: number): number[] {
  if (teams <= 0) return []
  const base = Math.floor(players / teams)
  const extra = players % teams
  return Array.from({ length: teams }, (_, i) => base + (i < extra ? 1 : 0))
}

/**
 * Pin groups cleaned against who is signed up now: ids not signed up dropped,
 * a player in two groups kept in the first, groups of one dropped.
 */
export function cleanPins(pins: unknown, signedUp: readonly string[]): string[][] {
  if (!Array.isArray(pins)) return []
  const here = new Set(signedUp)
  const used = new Set<string>()
  const out: string[][] = []
  for (const g of pins) {
    if (!Array.isArray(g)) continue
    const group = g.filter((id): id is string => typeof id === 'string' && here.has(id) && !used.has(id))
    const unique = [...new Set(group)]
    if (unique.length < 2) continue
    unique.forEach(id => used.add(id))
    out.push(unique)
  }
  return out
}

/** Pins after keeping `ids` together: they leave any group they were in, and groups left with one player go. */
export function addPinGroup(pins: string[][], ids: readonly string[]): string[][] {
  const take = new Set(ids)
  const rest = pins.map(g => g.filter(id => !take.has(id))).filter(g => g.length >= 2)
  return ids.length >= 2 ? [...rest, [...new Set(ids)]] : rest
}

export function removePinGroup(pins: string[][], index: number): string[][] {
  return pins.filter((_, i) => i !== index)
}

function shuffle<T>(arr: T[], random: () => number): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * Draws teams from the solo sign-ups. Pinned groups always land on one team;
 * team sizes follow `soloTeamSizes` unless a pin group forces one over. Random
 * fills teams in a random order. Balanced puts setters on different teams,
 * then gives each next-strongest unit to the team with the lowest average
 * (players without a level count as the mean), then swaps unpinned players
 * while it narrows the gap. The first player listed on a team is its captain.
 */
export function drawSoloTeams(
  players: readonly BalancePlayer[],
  opts: { size: number; pins: string[][]; mode: TeamMode; random?: () => number },
): SoloTeamDraft[] {
  const random = opts.random ?? Math.random
  const count = soloTeamCount(players.length, opts.size)
  if (count === 0) return []
  const caps = soloTeamSizes(players.length, count)
  const ids = players.map(p => p.id)
  const pins = cleanPins(opts.pins, ids)
  const pinned = new Set(pins.flat())

  const known = players.map(p => (p.skillLevel ? SKILL_POINTS[p.skillLevel] : null)).filter((v): v is number => v !== null)
  const mean = known.length ? known.reduce((a, b) => a + b, 0) / known.length : 0
  const score = new Map(players.map(p => [p.id, p.skillLevel ? SKILL_POINTS[p.skillLevel] : mean]))
  const setter = new Set(players.filter(p => p.isSetter).map(p => p.id))
  const balanced = opts.mode === 'balanced' && known.length > 0

  // Units: each pin group, then everyone else alone. Shuffled so ties fall randomly.
  const units = shuffle([...pins, ...shuffle(ids.filter(id => !pinned.has(id)), random).map(id => [id])], random)
  const unitScore = (u: string[]) => u.reduce((a, id) => a + (score.get(id) ?? mean), 0)
  const unitSetters = (u: string[]) => u.filter(id => setter.has(id)).length
  // Big groups first (they're the hardest to fit); balanced: setters, then strongest.
  units.sort((a, b) => b.length - a.length
    || (balanced ? (unitSetters(b) - unitSetters(a)) || (unitScore(b) / b.length - unitScore(a) / a.length) : 0))

  const teams = caps.map(() => ({ members: [] as string[], total: 0, setters: 0 }))
  const room = (t: number) => caps[t] - teams[t].members.length
  const avg = (t: number) => (teams[t].members.length ? teams[t].total / teams[t].members.length : 0)
  for (const u of units) {
    const order = shuffle(teams.map((_, i) => i), random)
    const fits = order.filter(t => room(t) >= u.length)
    const candidates = fits.length ? fits : [...order].sort((a, b) => room(b) - room(a)).slice(0, 1)
    let t: number
    if (balanced) {
      const s = unitSetters(u)
      t = [...candidates].sort((a, b) => (s ? teams[a].setters - teams[b].setters : 0) || avg(a) - avg(b) || room(b) - room(a))[0]
    } else {
      // Random: the emptiest team that fits, so sizes stay even.
      t = [...candidates].sort((a, b) => room(b) - room(a))[0]
    }
    teams[t].members.push(...u)
    teams[t].total += unitScore(u)
    teams[t].setters += unitSetters(u)
  }

  if (balanced) {
    // Swap unpinned players (a setter only with a setter) while the averages get closer.
    const spread = () => {
      const avgs = teams.map((_, i) => avg(i))
      return Math.max(...avgs) - Math.min(...avgs)
    }
    for (let iter = 0; iter < 60; iter++) {
      const before = spread()
      let best: { ta: number; tb: number; a: string; b: string; gain: number } | null = null
      for (let ta = 0; ta < teams.length; ta++) for (let tb = ta + 1; tb < teams.length; tb++) {
        for (const a of teams[ta].members) for (const b of teams[tb].members) {
          if (pinned.has(a) || pinned.has(b) || setter.has(a) !== setter.has(b)) continue
          const d = (score.get(a) ?? mean) - (score.get(b) ?? mean)
          if (d === 0) continue
          teams[ta].total -= d; teams[tb].total += d
          const gain = before - spread()
          teams[ta].total += d; teams[tb].total -= d
          if (gain > 1e-9 && (!best || gain > best.gain)) best = { ta, tb, a, b, gain }
        }
      }
      if (!best) break
      const { ta, tb, a, b } = best
      const d = (score.get(a) ?? mean) - (score.get(b) ?? mean)
      teams[ta].total -= d; teams[tb].total += d
      teams[ta].members = teams[ta].members.map(x => (x === a ? b : x))
      teams[tb].members = teams[tb].members.map(x => (x === b ? a : x))
    }
  }

  return teams.map((t, i) => ({ name: `Team ${i + 1}`, members: t.members, captain: t.members[0] ?? null }))
}

/** A drawn team's average level, or null when fewer than half its players have one. */
export function soloTeamLevel(members: readonly string[], players: readonly BalancePlayer[]): VolleyballSkillLevel | null {
  const byId = new Map(players.map(p => [p.id, p]))
  const levels = members.map(id => byId.get(id)?.skillLevel).filter((l): l is VolleyballSkillLevel => !!l)
  if (!members.length || levels.length * 2 < members.length) return null
  return levelForPoints(levels.reduce((a, l) => a + SKILL_POINTS[l], 0) / levels.length)
}

/** What `post_solo_teams(p_tournament_id, p_teams)` takes. */
export function postSoloTeamsArgs(tournamentId: string, teams: readonly SoloTeamDraft[]) {
  return {
    p_tournament_id: tournamentId,
    p_teams: teams.filter(t => t.members.length > 0).map(t => ({ name: t.name, captain: t.captain, members: t.members })),
  }
}
