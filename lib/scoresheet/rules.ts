import type { MatchFormat, RulesPreset, ScoreRules } from '../../types/scoresheet'

/** Common match formats, offered at setup. */
export const MATCH_FORMATS = {
  bestOf3: { maxSets: 3, setsToWin: 2, setPoints: [25, 25, 15], winBy: 2, cap: null },
  bestOf5: { maxSets: 5, setsToWin: 3, setPoints: [25, 25, 25, 25, 15], winBy: 2, cap: null },
  /** Pool play: both sets are played and a match can split 1-1. */
  twoSets: { maxSets: 2, setsToWin: null, setPoints: [25, 25], winBy: 2, cap: null },
  /** Pool play: three sets are always played (the third to 15). */
  threeSetsAllPlayed: { maxSets: 3, setsToWin: null, setPoints: [25, 25, 15], winBy: 2, cap: null },
} as const satisfies Record<string, MatchFormat>

export type MatchFormatKey = keyof typeof MATCH_FORMATS

/**
 * Rule presets. Everything stays editable at setup; the app warns when something breaks these
 * rules but always records it (the scorer writes down what happened on the court).
 */
export const RULE_PRESETS: Record<RulesPreset, Omit<ScoreRules, 'format'>> = {
  // USA Volleyball domestic: 30-second time-outs, 12 substitutions a set, unlimited entries, a player keeps one
  // position in the serving order; one libero serving position per set.
  usav: { preset: 'usav', subsPerSet: 12, timeoutsPerSet: 2, timeoutSeconds: 30, reentry: 'same-position', liberoServe: 'one-position', trackLibero: true },
  // International: 6 substitutions, a starter leaves and returns once; the libero never serves.
  international: { preset: 'international', subsPerSet: 6, timeoutsPerSet: 2, timeoutSeconds: 30, reentry: 'starter-once', liberoServe: 'never', trackLibero: true },
  // Rec play: count things, never warn about limits.
  casual: { preset: 'casual', subsPerSet: null, timeoutsPerSet: 2, timeoutSeconds: 60, reentry: 'free', liberoServe: 'any', trackLibero: false },
}

export function makeRules(preset: RulesPreset, format: MatchFormat = MATCH_FORMATS.bestOf3): ScoreRules {
  return { ...RULE_PRESETS[preset], format: { ...format, setPoints: [...format.setPoints] } }
}

/** Target score for a set (0-based index). */
export function setTarget(format: MatchFormat, setIndex: number): number {
  return format.setPoints[Math.min(setIndex, format.setPoints.length - 1)]
}

/** Cap for a set (0-based index): its own entry in `setCaps`, else the match-wide `cap`. */
export function setCap(format: MatchFormat, setIndex: number): number | null {
  const own = format.setCaps?.[setIndex]
  return own !== undefined ? own : format.cap
}

/** Score both teams start a set from (0 unless `setStarts` says otherwise). */
export function setStart(format: MatchFormat, setIndex: number): number {
  return Math.max(0, format.setStarts?.[setIndex] ?? 0)
}

/** True when `a` wins a set against `b` at this target and cap. */
export function setIsWon(format: Pick<MatchFormat, 'winBy'>, target: number, a: number, b: number, cap: number | null = null): boolean {
  if (cap != null && a >= cap) return true
  return a >= target && a - b >= format.winBy
}

/**
 * A format with tournament options applied: sets to 21+ start at `start` and stop at `cap`;
 * shorter (deciding) sets start at 0 with no cap.
 */
export function withOptions(format: MatchFormat, opts: { start?: number; cap?: number | null; timeLimitMinutes?: number | null }): MatchFormat {
  const long = (p: number) => p >= 21
  return {
    ...format,
    setPoints: [...format.setPoints],
    cap: null,
    setStarts: format.setPoints.map(p => (long(p) ? opts.start ?? 0 : 0)),
    setCaps: format.setPoints.map(p => (long(p) ? opts.cap ?? null : null)),
    timeLimitMinutes: opts.timeLimitMinutes ?? null,
  }
}

/**
 * Whether this set is the deciding set: the last possible set of a match that has a winner
 * (best of 3 / 5) with the sets tied going in. Teams switch courts at the halfway point.
 */
export function isDecidingSet(format: MatchFormat, setIndex: number): boolean {
  return format.setsToWin != null && setIndex === format.maxSets - 1
}
