import type { ScoreEvent, ScoreRules, TeamSide } from '../../types/scoresheet'

export const DEFAULT_TIMEOUT_SECONDS = 30

/** Events that can happen during a time-out without ending it (subs, libero changes, notes). */
const DURING_TIMEOUT = new Set<ScoreEvent['type']>(['sub', 'libero_in', 'libero_out', 'note', 'sanction', 'timeout'])

export type ActiveTimeout = { team: TeamSide; eventId: string; startedAt: number; seconds: number; endsAt: number }

/**
 * The time-out the countdown shows: the latest time-out, as long as play hasn't restarted since
 * (no rally, set change or correction after it). Worked out from the saved log and the time the
 * time-out was tapped, so it keeps counting correctly after the app is closed and reopened.
 */
export function activeTimeout(log: readonly ScoreEvent[], rules: Pick<ScoreRules, 'timeoutSeconds'>): ActiveTimeout | null {
  for (let i = log.length - 1; i >= 0; i--) {
    const ev = log[i]
    if (ev.type === 'timeout') {
      const seconds = rules.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS
      return { team: ev.team, eventId: ev.id, startedAt: ev.at, seconds, endsAt: ev.at + seconds * 1000 }
    }
    if (!DURING_TIMEOUT.has(ev.type)) return null
  }
  return null
}

/** "0:27" */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}
