import { Dimensions, Platform } from 'react-native'
import { removeAllQueries } from './query'
import { clearQuerySnapshot } from './querySnapshot'
import { clearFeedSnapshot } from '../utils/feedSnapshot'
import { currentScreen, flush, track } from './analytics'
import { ANALYTICS_EVENTS } from '../constants/analytics'
import { currentAppVersion } from '../utils/appVersion'
import { BREAKPOINTS } from '../constants/layout'
import { crashAttemptAfter, crashedRecently, parseCrashMarker, parseCrashReport, type CrashMarker } from '../utils/crashRecovery'
import type { CrashReport } from '../types'

/**
 * A crash never sticks (#316). When the error boundary catches a render error:
 * - `noteCrash` records it (`app_crash`, sent at once) and keeps a marker on the
 *   device, so a crash within `CRASH_REPEAT_MS` (utils) counts as a repeat;
 * - `recoverFromCrash` drops every cached read and both device snapshots, so a
 *   copy saved by an older build (Nov 13: `ads:feed`) can't throw again;
 * - for `SAFE_START_MS` after a crash, the next open seeds nothing from the
 *   device (`isSafeStart`), even if the player never tapped anything.
 * Pure rules are in utils/crashRecovery.ts.
 */
const MARKER_KEY = 'vteam.crashMarker'
/** The bug report prefill survives the page reload "Report the problem" does on web (tab only, never a URL). */
const REPORT_KEY = 'vteam.crashReport'
let memoryMarker: CrashMarker | null = null
let report: CrashReport | null = null

function session(): Storage | null {
  if (Platform.OS !== 'web') return null
  try {
    return typeof window !== 'undefined' ? window.sessionStorage : null
  } catch {
    return null
  }
}

function storage(): Storage | null {
  if (Platform.OS !== 'web') return null
  try {
    return typeof window !== 'undefined' ? window.localStorage : null
  } catch {
    return null
  }
}

function readMarker(): CrashMarker | null {
  const store = storage()
  if (!store) return memoryMarker
  try {
    const raw = store.getItem(MARKER_KEY)
    return raw ? parseCrashMarker(JSON.parse(raw)) : null
  } catch {
    return null
  }
}

function writeMarker(marker: CrashMarker): void {
  memoryMarker = marker
  try {
    storage()?.setItem(MARKER_KEY, JSON.stringify(marker))
  } catch { /* storage full or blocked: the in-memory copy still counts repeats */ }
}

function hadSnapshot(): boolean {
  try {
    const store = storage()
    return !!store && (store.getItem('vteam.querySnapshot') !== null || store.getItem('vteam.feedSnapshot') !== null)
  } catch {
    return false
  }
}

/** Record a crash; returns how many crashes in a row this is (1, 2, ...). Never throws. */
export function noteCrash(now = Date.now()): number {
  try {
    const screen = currentScreen() ?? 'unknown'
    const { attempt, duplicate } = crashAttemptAfter(readMarker(), now)
    if (duplicate) return attempt
    writeMarker({ at: now, count: attempt, screen, recovered: false })
    track(ANALYTICS_EVENTS.appCrash, { screen, attempt, had_snapshot: hadSnapshot() })
    void flush()
    return attempt
  } catch {
    return 1
  }
}

/** Forget everything read so far, in memory and on the device. Safe to call more than once. */
export function recoverFromCrash(): void {
  const marker = readMarker()
  if (marker) writeMarker({ ...marker, recovered: true })
  clearQuerySnapshot()
  clearFeedSnapshot()
  removeAllQueries()
}

/** True for a while after a crash: the app then starts without anything saved on the device. */
export function isSafeStart(now = Date.now()): boolean {
  return crashedRecently(readMarker(), now)
}

/** Keep what to prefill in the bug report (memory only, never in a URL). */
export function prepareCrashReport(now = Date.now()): void {
  const marker = readMarker()
  const width = Dimensions.get('window').width
  report = {
    screen: marker?.screen ?? currentScreen() ?? 'unknown',
    at: now,
    version: currentAppVersion(),
    platform: Platform.OS === 'ios' ? 'iOS'
      : Platform.OS === 'android' ? 'Android'
        : width >= BREAKPOINTS.sidebar ? 'Desktop web' : 'Mobile web',
  }
  try { session()?.setItem(REPORT_KEY, JSON.stringify(report)) } catch { /* memory copy still works on native */ }
}

/** The bug report prefill, handed over once. */
export function takeCrashReport(): CrashReport | null {
  let r = report
  report = null
  try {
    const store = session()
    const raw = store?.getItem(REPORT_KEY)
    store?.removeItem(REPORT_KEY)
    if (!r && raw) r = parseCrashReport(JSON.parse(raw))
  } catch { /* nothing to prefill */ }
  return r
}

/** Test-only. */
export function __resetCrashRecovery(): void {
  memoryMarker = null
  report = null
  try { storage()?.removeItem(MARKER_KEY); session()?.removeItem(REPORT_KEY) } catch { /* ignore */ }
}
