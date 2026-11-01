/**
 * The scorekeeper engine: replays the scorer's event log into the match state shown on screen
 * and on the finished scoresheet. Pure (no React, no storage), so every rule is unit-tested and
 * any past mistake can be fixed by editing the log and replaying.
 *
 * Principle: the app never refuses to record what happened on the court. Anything that breaks
 * the rules (a 13th substitution, a wrong re-entry, a third time-out) is recorded and raises a
 * warning; only actions that are physically impossible (substituting a player who isn't on the
 * court, scoring before the set starts) are skipped, and they raise a warning too.
 */
import type {
  Lineup,
  MatchSetup,
  MatchState,
  PointMark,
  ScoreEvent,
  SetState,
  TeamSetState,
  TeamSide,
  Warning,
  WarningCode,
} from '../../types/scoresheet'
import { isDecidingSet, setIsWon, setTarget } from './rules'

export const other = (t: TeamSide): TeamSide => (t === 'A' ? 'B' : 'A')
export const POSITION_LABELS = ['I', 'II', 'III', 'IV', 'V', 'VI'] as const

/** Court position (0 = I ... 5 = VI) of a lineup slot at a rotation. */
export const positionOfSlot = (slot: number, rotation: number) => (slot - rotation + 6) % 6
/** Lineup slot standing in a court position at a rotation. */
export const slotAtPosition = (position: number, rotation: number) => (position + rotation) % 6
/** Positions II, III and IV are the front row. */
export const isFrontRow = (position: number) => position >= 1 && position <= 3

function emptyTeam(lineup: Lineup, liberos: number[]): TeamSetState {
  return {
    lineup,
    slots: [...lineup],
    rotation: 0,
    score: 0,
    marks: [],
    turns: [[], [], [], [], [], []],
    timeouts: [],
    subs: [],
    slotHistory: lineup.map(n => [n]),
    libero: null,
    liberos: [...liberos],
    liberoServeSlot: null,
    cancelled: 0,
  }
}

/** The player who serves for a team right now (the libero when they replace position I). */
export function serverOf(team: TeamSetState): number {
  const slot = slotAtPosition(0, team.rotation)
  const player = team.slots[slot]
  return team.libero && team.libero.replaces === player ? team.libero.libero : player
}

/** Who stands in each court position (I..VI), with the libero shown in place of who they replace. */
export function courtOf(team: TeamSetState): { position: number; slot: number; player: number; libero: boolean }[] {
  return POSITION_LABELS.map((_, position) => {
    const slot = slotAtPosition(position, team.rotation)
    const regular = team.slots[slot]
    const libero = team.libero && team.libero.replaces === regular ? team.libero.libero : null
    return { position, slot, player: libero ?? regular, libero: libero != null }
  })
}

type Ctx = {
  setup: MatchSetup
  state: MatchState
  /** Rallies to score as cancelled (wrong server discovered later). */
  cancelled: Set<string>
  /** Per rally: was the winner serving? (filled by the first pass) */
  winnerWasServing: Map<string, boolean>
  /** Per rally: the score it produced ("12–10"). */
  scoreAfter: Map<string, string>
}

function warn(ctx: Ctx, code: WarningCode, message: string, ev: ScoreEvent) {
  const set = ctx.state.current ?? Math.max(0, ctx.state.sets.length - 1)
  ctx.state.warnings.push({ code, message, eventId: ev.id, set })
}

const label = (ctx: Ctx, team: TeamSide) => ctx.setup.teams[team].name || `Team ${team}`
const scoreText = (set: SetState) => `${set.teams.A.score}–${set.teams.B.score}`

function remark(ctx: Ctx, set: SetState | null, text: string) {
  ctx.state.remarks.push(set ? `Set ${set.index + 1} (${scoreText(set)}): ${text}` : text)
}

function activeSet(ctx: Ctx, ev: ScoreEvent): SetState | null {
  const { state } = ctx
  if (state.current == null) {
    warn(ctx, state.over ? 'match-over' : 'set-not-started', state.over ? 'The match is over.' : 'No set is in progress.', ev)
    return null
  }
  return state.sets[state.current]
}

/** Opens a service turn for the team's player in position I. */
function openTurn(ctx: Ctx, set: SetState, team: TeamSide, ev: ScoreEvent) {
  const t = set.teams[team]
  const slot = slotAtPosition(0, t.rotation)
  const server = serverOf(t)
  t.turns[slot].push({ endScore: null, points: 0, server })
  checkLiberoServe(ctx, t, slot, server, ev)
}

function checkLiberoServe(ctx: Ctx, t: TeamSetState, slot: number, server: number, ev: ScoreEvent) {
  if (!t.libero || server !== t.libero.libero) return
  const rule = ctx.setup.rules.liberoServe
  if (rule === 'never') warn(ctx, 'libero-serve', `Libero #${server} can't serve under these rules: #${t.libero.replaces} must come back in to serve.`, ev)
  else if (rule === 'one-position') {
    if (t.liberoServeSlot == null) t.liberoServeSlot = slot
    else if (t.liberoServeSlot !== slot)
      warn(ctx, 'libero-serve', `Libero #${server} already served in position ${POSITION_LABELS[t.liberoServeSlot]} this set; a libero serves in one position only.`, ev)
  }
}

/** After a libero change before the serve, the open turn belongs to whoever now stands in position I. */
function refreshServer(ctx: Ctx, set: SetState, team: TeamSide, ev: ScoreEvent) {
  const t = set.teams[team]
  if (set.serving !== team) return
  const slot = slotAtPosition(0, t.rotation)
  const open = t.turns[slot].at(-1)
  if (!open || open.endScore != null || open.points > 0) return
  const server = serverOf(t)
  if (open.server === server) return
  open.server = server
  checkLiberoServe(ctx, t, slot, server, ev)
}

function closeTurn(set: SetState, team: TeamSide) {
  const t = set.teams[team]
  for (const turns of t.turns) {
    const open = turns[turns.length - 1]
    if (open && open.endScore == null) open.endScore = t.score
  }
}

function checkLiberoFrontRow(ctx: Ctx, set: SetState, team: TeamSide, ev: ScoreEvent) {
  const t = set.teams[team]
  if (!t.libero || !ctx.setup.rules.trackLibero) return
  const slot = t.slots.indexOf(t.libero.replaces)
  if (slot >= 0 && isFrontRow(positionOfSlot(slot, t.rotation)))
    warn(ctx, 'libero-front-row', `${label(ctx, team)}: libero #${t.libero.libero} has rotated to the front row; #${t.libero.replaces} must come back in.`, ev)
}

function endSet(ctx: Ctx, set: SetState, winner: TeamSide, at: number, reason: string | null) {
  closeTurn(set, set.serving)
  set.winner = winner
  set.endedAt = at
  set.endReason = reason
  const { state, setup } = ctx
  state.setsWon[winner] += 1
  state.current = null
  const { setsToWin, maxSets } = setup.rules.format
  if (setsToWin != null && state.setsWon[winner] >= setsToWin) {
    state.over = true
    state.winner = winner
  } else if (state.sets.length >= maxSets) {
    state.over = true
    state.winner = state.setsWon.A === state.setsWon.B ? null : state.setsWon.A > state.setsWon.B ? 'A' : 'B'
  }
}

function award(ctx: Ctx, set: SetState, team: TeamSide, mark: PointMark, ev: ScoreEvent) {
  const t = set.teams[team]
  if (set.serving === team) {
    t.score += 1
    t.marks.push(mark)
    const open = t.turns[slotAtPosition(0, t.rotation)].at(-1)
    if (open && open.endScore == null) open.points += 1
  } else {
    // Side-out: the serving team's turn ends at its score, the receiving team rotates and serves.
    closeTurn(set, set.serving)
    t.score += 1
    t.marks.push(mark)
    t.rotation = (t.rotation + 1) % 6
    set.serving = team
    openTurn(ctx, set, team, ev)
    checkLiberoFrontRow(ctx, set, team, ev)
  }
  set.firstRally = false
  set.rallies += 1
  const opp = set.teams[other(team)]
  if (setIsWon(ctx.setup.rules.format, set.target, t.score, opp.score)) endSet(ctx, set, team, ev.at, null)
}

function applyOverride(ctx: Ctx, set: SetState, ev: Extract<ScoreEvent, { type: 'override' }>) {
  const parts: string[] = []
  if (ev.score) {
    for (const side of ['A', 'B'] as const) {
      const t = set.teams[side]
      const target = Math.max(0, Math.floor(ev.score[side]))
      if (target > t.marks.length) t.marks.push(...Array<PointMark>(target - t.marks.length).fill('rally'))
      else t.marks.length = target
      t.score = target
    }
    parts.push(`score set to ${scoreText(set)}`)
  }
  const servingBefore = set.serving
  const rotationChanged = (side: TeamSide) => ev.rotation?.[side] != null && ev.rotation[side] !== set.teams[side].rotation
  if ((ev.serving && ev.serving !== servingBefore) || rotationChanged(servingBefore)) closeTurn(set, servingBefore)
  for (const side of ['A', 'B'] as const) {
    const r = ev.rotation?.[side]
    if (r != null) set.teams[side].rotation = ((Math.floor(r) % 6) + 6) % 6
  }
  if (ev.rotation) parts.push('rotation corrected')
  if (ev.serving) set.serving = ev.serving
  const servingTeam = set.teams[set.serving]
  const open = servingTeam.turns[slotAtPosition(0, servingTeam.rotation)].at(-1)
  if (!open || open.endScore != null) openTurn(ctx, set, set.serving, ev)
  if (ev.serving) parts.push(`${label(ctx, set.serving)} serving`)
  remark(ctx, set, `Corrected: ${parts.join(', ') || 'no change'}. Reason: ${ev.reason}`)
  const { A, B } = set.teams
  const fmt = ctx.setup.rules.format
  if (setIsWon(fmt, set.target, A.score, B.score)) endSet(ctx, set, 'A', ev.at, ev.reason)
  else if (setIsWon(fmt, set.target, B.score, A.score)) endSet(ctx, set, 'B', ev.at, ev.reason)
}

function applySub(ctx: Ctx, set: SetState, ev: Extract<ScoreEvent, { type: 'sub' }>) {
  const { rules } = ctx.setup
  const t = set.teams[ev.team]
  const name = label(ctx, ev.team)
  const slot = t.slots.indexOf(ev.out)
  if (slot < 0) return warn(ctx, 'sub-not-on-court', `${name}: #${ev.out} isn't on the court.`, ev)
  if (t.slots.includes(ev.in)) return warn(ctx, 'sub-already-on-court', `${name}: #${ev.in} is already on the court.`, ev)
  if (t.libero?.replaces === ev.out) return warn(ctx, 'sub-not-on-court', `${name}: #${ev.out} is off for the libero; bring them back in first.`, ev)

  const roster = ctx.setup.teams[ev.team].players
  if (roster.length && !roster.some(p => p.number === ev.in))
    warn(ctx, 'sub-not-on-roster', `${name}: #${ev.in} isn't on the roster.`, ev)
  if (t.liberos.includes(ev.in) || roster.some(p => p.number === ev.in && p.libero))
    warn(ctx, 'sub-libero', `${name}: #${ev.in} is a libero; liberos come in as libero replacements, not substitutions.`, ev)

  const exceptional = !!ev.exceptional
  const counted = t.subs.filter(s => !s.exceptional).length
  if (!exceptional && rules.subsPerSet != null && counted >= rules.subsPerSet)
    warn(ctx, 'sub-limit', `${name} has used all ${rules.subsPerSet} substitutions this set.`, ev)

  if (!exceptional) {
    const history = t.slotHistory[slot]
    if (rules.reentry === 'same-position') {
      const elsewhere = t.slotHistory.findIndex((h, i) => i !== slot && h.includes(ev.in))
      if (elsewhere >= 0)
        warn(ctx, 'sub-reentry', `${name}: #${ev.in} played position ${POSITION_LABELS[elsewhere]} this set and can only come back in there.`, ev)
    } else if (rules.reentry === 'starter-once') {
      const starter = t.lineup[slot]
      const elsewhere = t.slotHistory.some((h, i) => i !== slot && h.includes(ev.in))
      const ok =
        ev.in === starter
          ? history.length === 2 && ev.out === history[1]
          : history.length === 1 && ev.out === starter && !elsewhere && !t.lineup.includes(ev.in)
      if (!ok)
        warn(
          ctx,
          'sub-reentry',
          ev.in === starter
            ? `${name}: starter #${starter} can come back once, only for the player who replaced them.`
            : `${name}: #${ev.in} can't come in for #${ev.out} (a substitute enters once, for one starter).`,
          ev,
        )
    }
  }

  const opp = set.teams[other(ev.team)]
  t.slots[slot] = ev.in
  t.slotHistory[slot].push(ev.in)
  t.subs.push({ team: ev.team, slot, out: ev.out, in: ev.in, score: [t.score, opp.score], exceptional, eventId: ev.id })
  if (exceptional) remark(ctx, set, `Exceptional substitution, ${name}: #${ev.in} for #${ev.out}.`)
  // A substitute who comes in at position I while their team serves takes over the serve.
  if (set.serving === ev.team && slotAtPosition(0, t.rotation) === slot) {
    const open = t.turns[slot].at(-1)
    if (open && open.endScore == null && open.points === 0) open.server = ev.in
  }
}

function applyLiberoIn(ctx: Ctx, set: SetState, ev: Extract<ScoreEvent, { type: 'libero_in' }>) {
  const t = set.teams[ev.team]
  const name = label(ctx, ev.team)
  const roster = ctx.setup.teams[ev.team].players
  const isLibero = t.liberos.includes(ev.libero) || roster.some(p => p.number === ev.libero && p.libero)
  if (!isLibero) warn(ctx, 'libero-not-libero', `${name}: #${ev.libero} isn't listed as a libero this set.`, ev)
  // Libero for libero: the new libero takes over the same player.
  const replaces = t.libero && ev.replaces === t.libero.libero ? t.libero.replaces : ev.replaces
  const slot = t.slots.indexOf(replaces)
  if (slot < 0) return warn(ctx, 'libero-not-on-court', `${name}: #${replaces} isn't on the court.`, ev)
  t.libero = { libero: ev.libero, replaces }
  if (isFrontRow(positionOfSlot(slot, t.rotation)) && ctx.setup.rules.trackLibero)
    warn(ctx, 'libero-front-row', `${name}: a libero can only replace a back-row player (#${replaces} is in the front row).`, ev)
  refreshServer(ctx, set, ev.team, ev)
}

function startSet(ctx: Ctx, ev: Extract<ScoreEvent, { type: 'set_start' }>) {
  const { state, setup } = ctx
  if (state.over) return warn(ctx, 'match-over', 'The match is over.', ev)
  if (state.current != null) return warn(ctx, 'set-over', 'Finish the current set before starting another.', ev)
  const index = state.sets.length
  for (const side of ['A', 'B'] as const) {
    const lineup = ev.lineups[side]
    const roster = setup.teams[side].players
    const unique = new Set(lineup).size === 6 && lineup.length === 6
    const liberoInLineup = lineup.some(n => ev.liberos[side].includes(n))
    const offRoster = roster.length > 0 && lineup.some(n => !roster.some(p => p.number === n))
    if (!unique || liberoInLineup || offRoster)
      ctx.state.warnings.push({
        code: 'lineup-invalid',
        set: index,
        eventId: ev.id,
        message: `${label(ctx, side)}'s set ${index + 1} lineup ${!unique ? 'needs six different players' : liberoInLineup ? "can't include a libero" : 'has a number not on the roster'}.`,
      })
  }
  const target = setTarget(setup.rules.format, index)
  const set: SetState = {
    index,
    teams: { A: emptyTeam(ev.lineups.A, ev.liberos.A), B: emptyTeam(ev.lineups.B, ev.liberos.B) },
    firstServe: ev.firstServe,
    serving: ev.firstServe,
    firstRally: true,
    startedAt: ev.at,
    endedAt: null,
    winner: null,
    endReason: null,
    target,
    courtSwitchAt: isDecidingSet(setup.rules.format, index) ? Math.ceil(target / 2) : null,
    courtSwitched: false,
    rallies: 0,
  }
  state.sets.push(set)
  state.current = index
  openTurn(ctx, set, ev.firstServe, ev)
}

function step(ctx: Ctx, ev: ScoreEvent) {
  const { state } = ctx
  switch (ev.type) {
    case 'set_start':
      return startSet(ctx, ev)
    case 'note':
      return remark(ctx, state.current != null ? state.sets[state.current] : null, ev.text)
    default:
      break
  }
  // Sanctions and improper requests can be given between sets too.
  if (ev.type === 'sanction') {
    const set = state.current != null ? state.sets[state.current] : state.sets.at(-1) ?? null
    const t = set?.teams[ev.team]
    const o = set?.teams[other(ev.team)]
    state.sanctions.push({
      team: ev.team,
      kind: ev.kind,
      who: ev.who,
      set: set ? set.index : 0,
      score: [t?.score ?? 0, o?.score ?? 0],
      eventId: ev.id,
    })
    if (ev.kind === 'improper-request') state.improperRequests[ev.team] = true
    if ((ev.kind === 'penalty' || ev.kind === 'delay-penalty') && state.current != null && set)
      award(ctx, set, other(ev.team), 'penalty', ev)
    else if ((ev.kind === 'penalty' || ev.kind === 'delay-penalty') && state.current == null)
      remark(ctx, set, `Penalty to ${label(ctx, ev.team)} given between sets: award the point at the start of the next set.`)
    return
  }
  const set = activeSet(ctx, ev)
  if (!set) return
  switch (ev.type) {
    case 'rally': {
      if (ctx.cancelled.has(ev.id)) {
        // Scored by a wrong server and cancelled: kept on the record, not on the score.
        set.rallies += 1
        set.teams[ev.winner].cancelled += 1
        return
      }
      ctx.winnerWasServing.set(ev.id, set.serving === ev.winner)
      award(ctx, set, ev.winner, 'rally', ev)
      ctx.scoreAfter.set(ev.id, scoreText(set))
      return
    }
    case 'replay':
      return
    case 'sub':
      return applySub(ctx, set, ev)
    case 'libero_in':
      return applyLiberoIn(ctx, set, ev)
    case 'libero_out': {
      const t = set.teams[ev.team]
      if (t.libero?.libero !== ev.libero) return warn(ctx, 'libero-not-on-court', `${label(ctx, ev.team)}: libero #${ev.libero} isn't on the court.`, ev)
      t.libero = null
      refreshServer(ctx, set, ev.team, ev)
      return
    }
    case 'timeout': {
      const t = set.teams[ev.team]
      if (t.timeouts.length >= ctx.setup.rules.timeoutsPerSet)
        warn(ctx, 'timeout-limit', `${label(ctx, ev.team)} has used all ${ctx.setup.rules.timeoutsPerSet} time-outs this set.`, ev)
      t.timeouts.push({ team: ev.team, score: [t.score, set.teams[other(ev.team)].score], eventId: ev.id })
      return
    }
    case 'wrong_server': {
      const name = label(ctx, ev.team)
      if (ev.when === 'before-serve') return remark(ctx, set, `${name}: wrong server caught before the serve; corrected, no penalty.`)
      if (set.serving !== ev.team) warn(ctx, 'set-over', `${name} isn't serving; recorded the fault anyway.`, ev)
      const cancelledHere = ctx.cancelled.size
      remark(
        ctx,
        set,
        ev.when === 'discovered-later' && cancelledHere
          ? `${name} served out of rotation; points scored while serving out of order were cancelled and the rally went to ${label(ctx, other(ev.team))}.`
          : `${name} served out of rotation; the rally went to ${label(ctx, other(ev.team))}.`,
      )
      return award(ctx, set, other(ev.team), 'rally', ev)
    }
    case 'rotation_fault':
      remark(ctx, set, `${label(ctx, ev.team)} out of rotation (positional fault); point to ${label(ctx, other(ev.team))}.`)
      return award(ctx, set, other(ev.team), 'rally', ev)
    case 'override':
      return applyOverride(ctx, set, ev)
    case 'end_set':
      remark(ctx, set, `Set ended: ${label(ctx, ev.winner)} wins. Reason: ${ev.reason}`)
      return endSet(ctx, set, ev.winner, ev.at, ev.reason)
  }
}

function emptyState(): MatchState {
  return {
    sets: [],
    current: null,
    setsWon: { A: 0, B: 0 },
    winner: null,
    over: false,
    sanctions: [],
    improperRequests: { A: false, B: false },
    warnings: [],
    remarks: [],
  }
}

function run(setup: MatchSetup, log: readonly ScoreEvent[], cancelled: Set<string>): Ctx {
  const ctx: Ctx = { setup, state: emptyState(), cancelled, winnerWasServing: new Map(), scoreAfter: new Map() }
  for (const ev of log) {
    step(ctx, ev)
    const set = ctx.state.sets.at(-1)
    if (set?.courtSwitchAt != null && !set.courtSwitched && Math.max(set.teams.A.score, set.teams.B.score) >= set.courtSwitchAt)
      set.courtSwitched = true
  }
  return ctx
}

/**
 * Rallies cancelled by "wrong server discovered later": from the first rally the wrong player
 * served up to the fault, every rally the faulty team won while serving.
 */
function cancelledRallies(setup: MatchSetup, log: readonly ScoreEvent[]): Set<string> {
  const faults = log.filter((e): e is Extract<ScoreEvent, { type: 'wrong_server' }> => e.type === 'wrong_server' && e.when === 'discovered-later')
  if (!faults.length) return new Set()
  const first = run(setup, log, new Set())
  const out = new Set<string>()
  for (const fault of faults) {
    const end = log.findIndex(e => e.id === fault.id)
    const start = fault.sinceEventId ? log.findIndex(e => e.id === fault.sinceEventId) : -1
    if (start < 0 || start > end) continue
    // Stop at a set boundary: a fault never reaches back into an earlier set.
    for (let i = start; i < end; i++) {
      const e = log[i]
      if (e.type === 'set_start') break
      if (e.type === 'rally' && e.winner === fault.team && first.winnerWasServing.get(e.id)) out.add(e.id)
    }
  }
  return out
}

/** Replays the log into the match state. */
export function replay(setup: MatchSetup, log: readonly ScoreEvent[]): MatchState {
  const cancelled = cancelledRallies(setup, log)
  const ctx = run(setup, log, cancelled)
  for (const fault of log) {
    if (fault.type !== 'wrong_server' || fault.when !== 'discovered-later') continue
    const start = fault.sinceEventId ? log.findIndex(e => e.id === fault.sinceEventId) : -1
    if (start < 0) {
      const set = ctx.state.sets.find(s => s.startedAt <= fault.at) ?? ctx.state.sets.at(-1)
      ctx.state.warnings.push({
        code: 'wrong-server-unknown-start',
        set: set?.index ?? 0,
        eventId: fault.id,
        message: "Couldn't find when the wrong server started, so no points were cancelled; only the fault was given.",
      })
    }
  }
  return ctx.state
}

/**
 * Rallies in the current set that the given team won while serving, newest first: the choices
 * for "since when was the wrong player serving?".
 */
export function servingRalliesInCurrentSet(setup: MatchSetup, log: readonly ScoreEvent[], team: TeamSide): { eventId: string; score: string }[] {
  const ctx = run(setup, log, new Set())
  const startIndex = log.map(e => e.type).lastIndexOf('set_start')
  if (startIndex < 0 || ctx.state.current == null) return []
  const out: { eventId: string; score: string }[] = []
  for (let i = startIndex + 1; i < log.length; i++) {
    const e = log[i]
    if (e.type === 'rally' && e.winner === team && ctx.winnerWasServing.get(e.id)) out.push({ eventId: e.id, score: ctx.scoreAfter.get(e.id) ?? '' })
  }
  return out.reverse()
}

/** Defaults for the next set: lineups from the previous set and the team that serves first. */
export function nextSetDefaults(
  setup: MatchSetup,
  state: MatchState,
): { index: number; firstServe: TeamSide | null; lineups: Record<TeamSide, Lineup> | null; liberos: Record<TeamSide, number[]>; deciding: boolean } {
  const prev = state.sets.at(-1)
  const index = state.sets.length
  const deciding = isDecidingSet(setup.rules.format, index)
  const rosterLiberos = (side: TeamSide) => setup.teams[side].players.filter(p => p.libero).map(p => p.number)
  if (!prev) return { index, firstServe: null, lineups: null, liberos: { A: rosterLiberos('A'), B: rosterLiberos('B') }, deciding }
  return {
    index,
    // Teams alternate serving first; the deciding set has a new toss (the scorer picks).
    firstServe: deciding ? null : other(prev.firstServe),
    lineups: { A: prev.teams.A.lineup, B: prev.teams.B.lineup },
    liberos: { A: prev.teams.A.liberos, B: prev.teams.B.liberos },
    deciding,
  }
}

/** Warnings raised by the newest event (shown as a toast after a tap). */
export function warningsFor(state: MatchState, eventId: string): Warning[] {
  return state.warnings.filter(w => w.eventId === eventId)
}

export type TimelineEntry = {
  event: ScoreEvent
  /** Set index the event belongs to (null before the first set). */
  set: number | null
  /** Score after the event, team A first. */
  score: [number, number]
  /** Team serving after the event. */
  serving: TeamSide | null
  cancelled: boolean
}

/** Every event with the score it left, in one pass (the timeline sheet). */
export function timeline(setup: MatchSetup, log: readonly ScoreEvent[]): TimelineEntry[] {
  const cancelled = cancelledRallies(setup, log)
  const ctx: Ctx = { setup, state: emptyState(), cancelled, winnerWasServing: new Map(), scoreAfter: new Map() }
  return log.map(ev => {
    step(ctx, ev)
    const set = ctx.state.sets.at(-1) ?? null
    return {
      event: ev,
      set: set ? set.index : null,
      score: set ? [set.teams.A.score, set.teams.B.score] : [0, 0],
      serving: set && set.endedAt == null ? set.serving : null,
      cancelled: cancelled.has(ev.id),
    }
  })
}
