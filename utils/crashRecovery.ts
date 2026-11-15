import type { CrashMarker, CrashReport } from '../types'
import { EVENT_TIME_ZONE } from '../constants/time'

export type { CrashMarker }

/** A crash this soon after the previous one counts as "again" (the screen offers a reload). */
export const CRASH_REPEAT_MS = 30_000
/** For this long after a crash, opening the app seeds nothing from the device. */
export const SAFE_START_MS = 10 * 60_000

/** The stored marker, or null when it isn't one (pure, unit tested). */
export function parseCrashMarker(raw: unknown): CrashMarker | null {
  if (!raw || typeof raw !== 'object') return null
  const m = raw as Partial<CrashMarker>
  if (typeof m.at !== 'number' || !Number.isFinite(m.at)) return null
  if (typeof m.count !== 'number' || m.count < 1) return null
  return { at: m.at, count: Math.floor(m.count), screen: typeof m.screen === 'string' ? m.screen : 'unknown', recovered: m.recovered === true }
}

/**
 * Which crash in a row a new one at `now` is, and whether it is the same crash seen
 * again (no recovery tried in between: the layout swapping boundaries remounts the
 * error screen, which must not count, or be recorded, twice).
 */
export function crashAttemptAfter(previous: CrashMarker | null, now: number): { attempt: number; duplicate: boolean } {
  if (!previous || now < previous.at || now - previous.at > CRASH_REPEAT_MS) return { attempt: 1, duplicate: false }
  if (!previous.recovered) return { attempt: previous.count, duplicate: true }
  return { attempt: previous.count + 1, duplicate: false }
}

/** Whether a crash was recent enough that the app should start without saved data. */
export function crashedRecently(marker: CrashMarker | null, now: number): boolean {
  return !!marker && now >= marker.at && now - marker.at < SAFE_START_MS
}

const REPORT_PLATFORMS: CrashReport['platform'][] = ['iOS', 'Android', 'Mobile web', 'Desktop web']

/** A saved bug report prefill, or null when it isn't one. */
export function parseCrashReport(raw: unknown): CrashReport | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Partial<CrashReport>
  if (typeof r.screen !== 'string' || typeof r.at !== 'number' || typeof r.version !== 'string') return null
  if (!REPORT_PLATFORMS.includes(r.platform as CrashReport['platform'])) return null
  return { screen: r.screen.slice(0, 80), at: r.at, version: r.version.slice(0, 20), platform: r.platform as CrashReport['platform'] }
}

/** When it crashed, in the club's time zone (the report is read by the team, not the player). */
export function crashReportTime(at: number): string {
  return new Date(at).toLocaleString('en-US', { timeZone: EVENT_TIME_ZONE, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })
}
