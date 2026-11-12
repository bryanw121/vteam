import { LIVE_SCORE_SHEETS } from '../constants/liveScores'
import type {
  PoolStandings,
  SetScore,
  SheetLiveMatch,
  SheetMatch,
  SheetScheduledGame,
  SheetStanding,
  SheetState,
  SheetTeamDetail,
  SheetTeamGame,
  TournamentMatchRow,
} from '../types'

/**
 * Pure helpers for live scores from the Google Sheet tournament app (`?format=json`). They turn
 * its rows into the shapes vteam's own tournament components draw (StandingsTable, BracketView),
 * using team names as team ids: the Sheet has no ids, and names are unique within a tournament.
 */

/** The Sheet web app's JSON URL for an outside tournament, or null when it doesn't run on one. */
export function sheetScoresUrl(programId: string | null | undefined): string | null {
  const base = programId ? LIVE_SCORE_SHEETS[programId] : undefined
  if (!base || !/^https?:\/\//.test(base)) return null
  return `${base}${base.includes('?') ? '&' : '?'}format=json`
}

/** Checks the response is the Sheet app's state, so a wrong URL shows an error instead of a crash. */
export function parseSheetState(json: unknown): SheetState {
  const s = json as Partial<SheetState> | null
  if (!s || typeof s !== 'object' || !Array.isArray(s.matches) || typeof s.standings !== 'object' || !s.standings) {
    throw new Error('Not a tournament scores feed')
  }
  return {
    settings: s.settings ?? {},
    pools: s.pools ?? {},
    schedule: Array.isArray(s.schedule) ? s.schedule : [],
    matches: s.matches.filter(m => m && m.status !== 'void'),
    standings: s.standings,
    seeds: Array.isArray(s.seeds) ? s.seeds : [],
    serverTime: s.serverTime,
  }
}

function num(v: unknown): number | null {
  if (v === '' || v == null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** Sets with a score, in order. A live match's last set is the one being played. */
export function setsOf(m: SheetMatch): { a: number; b: number }[] {
  const out: { a: number; b: number }[] = []
  for (const i of [1, 2, 3, 4, 5] as const) {
    const a = num(m[`s${i}_a`])
    const b = num(m[`s${i}_b`])
    if (a == null && b == null) continue
    out.push({ a: a ?? 0, b: b ?? 0 })
  }
  return out
}

const ROUND_NAMES: Record<string, string> = { F: 'Final', SF: 'Semifinal', QF: 'Quarterfinal' }

/** "Gold-QF2" → "Quarterfinal 2", "Gold-R16-3" → "Round of 16 #3" (the Sheet app's own labels). */
export function roundLabel(m: Pick<SheetMatch, 'match_id' | 'group'>): string {
  let id = String(m.match_id)
  if (m.group && id.startsWith(`${m.group}-`)) id = id.slice(m.group.length + 1)
  const x = id.match(/^(F|SF|QF|R\d+)-?(\d*)$/)
  if (!x) return id
  const name = ROUND_NAMES[x[1]] ?? `Round of ${x[1].slice(1)}`
  return name + (x[2] ? (x[1].startsWith('R') ? ' #' : ' ') + x[2] : '')
}

/** "Pool A" for pool games, "Gold · Semifinal 1" for bracket games. */
export function stageLabel(m: SheetMatch): string {
  return m.stage === 'pool' ? `Pool ${m.group ?? ''}`.trim() : `${m.group ?? ''} · ${roundLabel(m)}`
}

/** Matches on a court right now, by court number (no court last). */
export function liveMatches(state: SheetState): SheetLiveMatch[] {
  return state.matches
    .filter(m => m.status === 'live')
    .map(m => ({
      id: m.match_id,
      court: num(m.court),
      label: stageLabel(m),
      teamA: m.team_a ?? 'TBD',
      teamB: m.team_b ?? 'TBD',
      sets: setsOf(m),
    }))
    .sort((x, y) => (x.court ?? Infinity) - (y.court ?? Infinity))
}

const pairKey = (a?: string, b?: string) => [a ?? '', b ?? ''].sort().join('\u0000')

/** Scheduled pool games no one has started yet, in the organizer's order. */
export function upNext(state: SheetState, limit = 12): SheetScheduledGame[] {
  const started = new Set(state.matches.filter(m => m.stage === 'pool').map(m => `${m.group}|${pairKey(m.team_a, m.team_b)}`))
  return state.schedule
    .filter(g => g.a && g.b && !started.has(`${g.pool}|${pairKey(g.a, g.b)}`))
    .slice(0, limit)
}

/** Every pool's standings in StandingsTable's shape. Teams level on every tiebreaker share a rank. */
export function poolStandings(state: SheetState): PoolStandings[] {
  return Object.keys(state.standings).sort().map(pool => {
    const rows = state.standings[pool] ?? []
    const ranks = rows.map(r => r.rank)
    return {
      poolKey: pool,
      name: `Pool ${pool}`,
      rows: rows.map(r => ({
        teamId: r.team,
        played: r.played,
        wins: r.wins,
        losses: r.losses,
        ties: r.ties ?? 0,
        setsWon: r.sets_won,
        setsLost: r.sets_lost,
        pointsFor: r.points_for,
        pointsAgainst: r.points_against,
        rank: r.rank,
        tied: ranks.filter(x => x === r.rank).length > 1,
      })),
    }
  })
}

/** Divisions (and side-game groups) that have bracket games: Settings order first, then the rest. */
export function bracketGroups(state: SheetState): string[] {
  const have = new Set(state.matches.filter(m => m.stage === 'bracket' && m.group).map(m => m.group as string))
  const ordered = (state.settings.divisions ?? []).filter(d => have.has(d))
  return [...ordered, ...[...have].filter(g => !ordered.includes(g)).sort()]
}

/**
 * One division's bracket as BracketView rows. Games typed in without a round ("3rd place") go in
 * a last "Other games" column, like the Sheet app. A BYE side shows as empty.
 */
export function bracketRows(state: SheetState, group: string): TournamentMatchRow[] {
  const games = state.matches.filter(m => m.stage === 'bracket' && m.group === group)
  const lastRound = Math.max(0, ...games.map(m => num(m.round) ?? 0))
  return games.map((m, i): TournamentMatchRow => {
    const round = num(m.round)
    const team = (t?: string) => (t && t !== 'BYE' ? t : null)
    const sets: SetScore[] = setsOf(m).map((s, k) => ({ set_number: k + 1, team_a_score: s.a, team_b_score: s.b }))
    return {
      id: m.match_id,
      tournament_id: 'sheet',
      pool_id: null,
      stage: 'bracket',
      round: round ?? lastRound + 1,
      match_number: Number(m.match_id.match(/(\d+)$/)?.[1] ?? i + 1),
      team_a_id: team(m.team_a),
      team_b_id: team(m.team_b),
      court: num(m.court) ? `Court ${m.court}` : null,
      scheduled_at: null,
      status: m.status === 'live' ? 'in_progress' : m.status === 'final' ? 'completed' : 'scheduled',
      winner_id: m.status === 'final' && m.winner && m.winner !== 'TIE' ? m.winner : null,
      bracket_round_name: round == null ? 'Other games' : roundLabel(m).replace(/ #?\d+$/, ''),
      is_losers_bracket: false,
      ref_team_id: null,
      sets,
    }
  })
}

/** Every team with its pool standing, A–Z. `query` keeps names containing it (any case). */
export function teamList(state: SheetState, query = ''): SheetStanding[] {
  const q = query.trim().toLowerCase()
  return Object.values(state.standings).flat()
    .filter(s => !q || s.team.toLowerCase().includes(q))
    .sort((a, b) => a.team.localeCompare(b.team))
}

/** "1-1-2" in two-set pools, where a 1–1 split is a tie; "3-1" otherwise. */
export function record(s: Pick<SheetStanding, 'wins' | 'losses' | 'ties'>): string {
  return `${s.wins}-${s.losses}${s.ties ? `-${s.ties}` : ''}`
}

/**
 * A team's page: its standing, division seed, and every game (pool games, then bracket games by
 * round, then scheduled pool games not started yet). Null when no pool lists the team.
 */
export function teamDetail(state: SheetState, name: string): SheetTeamDetail | null {
  const standing = Object.values(state.standings).flat().find(s => s.team === name)
  if (!standing) return null
  const seed = state.seeds.find(s => s.team === name)
  const played: SheetTeamGame[] = state.matches
    .filter(m => m.team_a === name || m.team_b === name)
    .sort((a, b) =>
      (a.stage === b.stage ? 0 : a.stage === 'pool' ? -1 : 1)
      || ((num(a.round) ?? 0) - (num(b.round) ?? 0))
      || a.match_id.localeCompare(b.match_id, undefined, { numeric: true }))
    .map(m => {
      const isA = m.team_a === name
      const opp = isA ? m.team_b : m.team_a
      const final = m.status === 'final'
      return {
        id: m.match_id,
        status: final ? 'final' : m.status === 'live' ? 'live' : 'upcoming',
        result: !final ? null : m.winner === 'TIE' ? 'T' : m.winner === name ? 'W' : m.winner ? 'L' : null,
        opponent: opp && opp !== 'BYE' ? opp : null,
        bye: opp === 'BYE',
        label: stageLabel(m),
        detail: setsOf(m).map(s => (isA ? `${s.a}–${s.b}` : `${s.b}–${s.a}`)).join(', ')
          || (m.court ? `Court ${m.court}` : ''),
      }
    })
  const upcoming: SheetTeamGame[] = upNext(state, Infinity)
    .filter(g => g.a === name || g.b === name)
    .map(g => ({
      id: `${g.pool}-schedule-${g.game ?? `${g.a}-${g.b}`}`,
      status: 'upcoming',
      result: null,
      opponent: g.a === name ? g.b : g.a,
      bye: false,
      label: `Pool ${g.pool}`,
      detail: [g.court ? `Court ${g.court}` : null, g.time].filter(Boolean).join(' · '),
    }))
  return {
    name,
    standing,
    poolSize: state.standings[standing.pool]?.length ?? 0,
    seed: seed ? { division: seed.division, seed: seed.seed } : null,
    games: [...played, ...upcoming],
  }
}
