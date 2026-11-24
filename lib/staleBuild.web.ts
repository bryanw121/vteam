import { currentScreen, flush, track } from './analytics'
import { ANALYTICS_EVENTS } from '../constants/analytics'
import {
  buildRelation,
  chunkErrorAction,
  parseReloadMark,
  parseRunningBuild,
  parseServedBuild,
  reloadAllowed,
  shouldReloadOnResume,
  type ChunkErrorAction,
  type UpdateReloadHow,
} from '../utils/staleBuild'

/**
 * Web: move a tab to the new build instead of crashing (#359). Rules in
 * utils/staleBuild.ts. Two ways in:
 * - `handleChunkError` (ErrorFallback): a screen's code failed to load. Ask the
 *   host which build it serves; reload this address once, or say the screen
 *   couldn't load when the host doesn't answer.
 * - `startStaleBuildWatch` (root layout): a tab back after 10+ minutes hidden
 *   asks the same, and reloads straight away into the new build unless
 *   someone is typing, so the next tap never hits a missing chunk.
 * The reload is marked in sessionStorage (5-minute guard, and the toast after it).
 */
const MARK_KEY = 'vteam.updateReload'
const VERSION_TIMEOUT_MS = 3000

/** Inlined by `npm run build:web` (scripts/build-version.mjs --print); unset in dev and the mocked export. */
const RUNNING = parseRunningBuild(process.env.EXPO_PUBLIC_BUILD_SHA)

function session(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage : null
  } catch {
    return null
  }
}

function readMark() {
  try {
    return parseReloadMark(session()?.getItem(MARK_KEY) ?? null)
  } catch {
    return null
  }
}

function writeMark(mark: { at: number; how: UpdateReloadHow; noticed: boolean }): void {
  try {
    session()?.setItem(MARK_KEY, JSON.stringify(mark))
  } catch { /* storage blocked: the reload still happens, without the guard */ }
}

/** The build the host serves now, or `reachable: false` when it doesn't answer. */
async function servedBuild(): Promise<{ reachable: boolean; sha: string | null }> {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
  const timer = controller ? setTimeout(() => controller.abort(), VERSION_TIMEOUT_MS) : null
  try {
    const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store', signal: controller?.signal })
    if (!res.ok) return { reachable: true, sha: null }
    return { reachable: true, sha: parseServedBuild(await res.json().catch(() => null)) }
  } catch {
    return { reachable: false, sha: null }
  } finally {
    if (timer) clearTimeout(timer)
  }
}

async function reloadInto(how: UpdateReloadHow): Promise<void> {
  writeMark({ at: Date.now(), how, noticed: false })
  track(ANALYTICS_EVENTS.appUpdatedInTab, { how, screen: currentScreen() ?? 'unknown' })
  await Promise.race([flush(), new Promise(r => setTimeout(r, 800))])
  // The address is still the screen the player was on (the failed one never
  // committed), so they land where they were, on the new build.
  window.location.reload()
}

/** A screen's code failed to load: what ErrorFallback should show. Reloads the page itself for 'reload'. */
export async function handleChunkError(now = Date.now()): Promise<ChunkErrorAction> {
  const served = await servedBuild()
  const action = chunkErrorAction({
    reachable: served.reachable,
    relation: buildRelation(RUNNING, served.sha),
    allowed: reloadAllowed(readMark()?.at ?? null, now),
  })
  if (action === 'reload') void reloadInto('chunk')
  else if (action === 'offline') track(ANALYTICS_EVENTS.screenLoadFailed, { cause: 'network', screen: currentScreen() ?? 'unknown' })
  return action
}

/** Something typed that a reload would throw away. */
function isTyping(): boolean {
  if (typeof document === 'undefined') return false
  const active = document.activeElement as HTMLElement | null
  if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) return true
  return Array.from(document.querySelectorAll('textarea, input:not([type]), input[type=text], input[type=email], input[type=search]'))
    .some(el => (el as HTMLInputElement).value.trim() !== '')
}

/** Watch for the tab coming back; returns a stop function. Safe to call more than once. */
let stopWatch: (() => void) | null = null
export function startStaleBuildWatch(): () => void {
  if (stopWatch || typeof document === 'undefined' || !RUNNING) return stopWatch ?? (() => {})
  let hiddenAt: number | null = document.visibilityState === 'hidden' ? Date.now() : null
  let checking = false
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') {
      hiddenAt = Date.now()
      return
    }
    const hiddenMs = hiddenAt === null ? 0 : Date.now() - hiddenAt
    hiddenAt = null
    if (checking || hiddenMs <= 0) return
    checking = true
    void servedBuild().then(served => {
      const reload = shouldReloadOnResume({
        hiddenMs,
        relation: buildRelation(RUNNING, served.sha),
        typing: isTyping(),
        allowed: reloadAllowed(readMark()?.at ?? null, Date.now()),
      })
      if (reload) void reloadInto('resume')
    }).finally(() => { checking = false })
  }
  document.addEventListener('visibilitychange', onVisibility)
  stopWatch = () => {
    document.removeEventListener('visibilitychange', onVisibility)
    stopWatch = null
  }
  return stopWatch
}

/** Once after an automatic reload: why it happened, for the toast. */
export function takeUpdateNotice(): UpdateReloadHow | null {
  const mark = readMark()
  if (!mark || mark.noticed) return null
  writeMark({ ...mark, noticed: true })
  return mark.how
}
