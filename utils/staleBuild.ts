/**
 * A deploy while a tab is open (#359). Web routes are lazy chunks named by
 * content hash, and a deploy removes the old build's files: a tab that loaded
 * build A asks for a chunk build B no longer serves the first time it opens a
 * screen it hasn't opened yet. These pure rules decide what to do about it;
 * lib/staleBuild(.web).ts does it.
 */

/** At most one automatic reload per tab in this window, so a reload that doesn't help can't loop. */
export const UPDATE_RELOAD_GUARD_MS = 5 * 60_000
/** A tab back after being hidden this long checks whether a newer build is live. */
export const RESUME_CHECK_AFTER_MS = 10 * 60_000

/**
 * A lazy chunk that couldn't load. Two shapes: the file is missing (404,
 * Metro's `AsyncRequireError: Loading module … failed`), or the host answered
 * with a web page instead (`Unexpected token '<'`, then `Requiring unknown module`).
 */
export function isChunkLoadError(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false
  const err = e as { name?: unknown; message?: unknown }
  const name = typeof err.name === 'string' ? err.name : ''
  const message = typeof err.message === 'string' ? err.message : ''
  if (name === 'AsyncRequireError' || name === 'ChunkLoadError') return true
  return /Loading module .+ failed/.test(message)
    || /Requiring unknown module/.test(message)
    || /Unexpected token '<'/.test(message)
    || /Loading chunk .+ failed/i.test(message)
}

/** True when no automatic reload ran within the guard window. */
export function reloadAllowed(lastAt: number | null, now: number): boolean {
  return lastAt === null || !Number.isFinite(lastAt) || now - lastAt >= UPDATE_RELOAD_GUARD_MS || now < lastAt
}

const SHA_RE = /^[0-9a-f]{7,40}$/

/** The commit in `/version.json` (`{ sha, builtAt }`, scripts/build-version.mjs), or null. */
export function parseServedBuild(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null
  const sha = (body as { sha?: unknown }).sha
  return typeof sha === 'string' && SHA_RE.test(sha) ? sha : null
}

/** The running build's commit, as inlined at build time; null when it wasn't (dev, the mocked export). */
export function parseRunningBuild(value: string | undefined | null): string | null {
  return value && SHA_RE.test(value) ? value : null
}

export type BuildRelation = 'newer' | 'same' | 'unknown'

/** Is the build the host serves newer than the one running in this tab? */
export function buildRelation(running: string | null, served: string | null): BuildRelation {
  if (!served || !running) return 'unknown'
  return served === running ? 'same' : 'newer'
}

export type ChunkErrorAction = 'reload' | 'offline' | 'crash'

/**
 * After a chunk failed to load: reload once when the host answers with another
 * build (or we can't tell which build we are: a reload can only help, and the
 * guard stops a loop); say the screen couldn't load when the host doesn't
 * answer at all; otherwise it's a real crash (same build, file really missing).
 */
export function chunkErrorAction(o: { reachable: boolean; relation: BuildRelation; allowed: boolean }): ChunkErrorAction {
  if (!o.reachable) return 'offline'
  if (o.relation === 'same' || !o.allowed) return 'crash'
  return 'reload'
}

/** Coming back to a hidden tab: reload into the new build now, unless something typed would be lost. */
export function shouldReloadOnResume(o: { hiddenMs: number; relation: BuildRelation; typing: boolean; allowed: boolean }): boolean {
  return o.hiddenMs >= RESUME_CHECK_AFTER_MS && o.relation === 'newer' && !o.typing && o.allowed
}

export type UpdateReloadHow = 'chunk' | 'resume'

/** What the tab keeps across the reload (sessionStorage): when, and why, for the guard and the toast. */
export function parseReloadMark(raw: string | null): { at: number; how: UpdateReloadHow; noticed: boolean } | null {
  if (!raw) return null
  try {
    const v = JSON.parse(raw) as { at?: unknown; how?: unknown; noticed?: unknown }
    if (typeof v.at !== 'number' || (v.how !== 'chunk' && v.how !== 'resume')) return null
    return { at: v.at, how: v.how, noticed: v.noticed === true }
  } catch {
    return null
  }
}
