/**
 * "−1" on the live match screen: the event that gave `team` its latest point in the set in play,
 * so removing it takes exactly one point away (and the engine replays serve and rotation).
 * Pure and unit-tested.
 *
 * A team's point comes from a rally it won, or from the other team's out-of-rotation fault or
 * wrong server caught at the serve. Points before the set began, and scores set by hand
 * ("Match the scoreboard"), are never reached: −1 returns null there and the screen disables it.
 */
import type { ScoreEvent, TeamSide } from '../../types'

export function lastPointEventId(log: ScoreEvent[], team: TeamSide): string | null {
  for (let i = log.length - 1; i >= 0; i--) {
    const e = log[i]
    if (e.type === 'set_start' || e.type === 'override' || e.type === 'end_set') return null
    if (e.type === 'rally' && e.winner === team) return e.id
    if (e.type === 'rotation_fault' && e.team !== team) return e.id
    if (e.type === 'wrong_server' && e.when === 'after-serve' && e.team !== team) return e.id
  }
  return null
}
