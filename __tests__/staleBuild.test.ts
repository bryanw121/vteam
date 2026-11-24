import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  RESUME_CHECK_AFTER_MS,
  UPDATE_RELOAD_GUARD_MS,
  buildRelation,
  chunkErrorAction,
  isChunkLoadError,
  parseReloadMark,
  parseRunningBuild,
  parseServedBuild,
  reloadAllowed,
  shouldReloadOnResume,
} from '../utils/staleBuild'

const A = 'a'.repeat(40)
const B = 'b'.repeat(40)

describe('a deploy while a tab is open (#359)', () => {
  it('recognises both shapes of a missing lazy chunk', () => {
    // 404: Metro's async require
    expect(isChunkLoadError(Object.assign(new Error('Loading module http://x/_expo/static/js/web/leagues-1.js failed.'), { name: 'AsyncRequireError' }))).toBe(true)
    expect(isChunkLoadError(new Error('Loading module http://x/a.js failed.'))).toBe(true)
    // The host answered with index.html (vercel.json's fallback before this change)
    expect(isChunkLoadError(new Error('Requiring unknown module "793".'))).toBe(true)
    expect(isChunkLoadError(new SyntaxError("Unexpected token '<'"))).toBe(true)
    expect(isChunkLoadError(Object.assign(new Error('x'), { name: 'ChunkLoadError' }))).toBe(true)
  })

  it('leaves real crashes alone', () => {
    expect(isChunkLoadError(new TypeError("Cannot read properties of undefined (reading 'map')"))).toBe(false)
    expect(isChunkLoadError(null)).toBe(false)
    expect(isChunkLoadError('Loading module x failed')).toBe(false)
  })

  it('reloads at most once per 5 minutes', () => {
    expect(reloadAllowed(null, 1000)).toBe(true)
    expect(reloadAllowed(1000, 1000 + UPDATE_RELOAD_GUARD_MS - 1)).toBe(false)
    expect(reloadAllowed(1000, 1000 + UPDATE_RELOAD_GUARD_MS)).toBe(true)
    // A clock that went backwards doesn't lock the tab out.
    expect(reloadAllowed(5000, 1000)).toBe(true)
  })

  it('reads the served and running builds', () => {
    expect(parseServedBuild({ sha: B, builtAt: '2026-11-24T00:00:00Z' })).toBe(B)
    expect(parseServedBuild({ sha: 'unknown' })).toBeNull()
    expect(parseServedBuild('<html>')).toBeNull()
    expect(parseRunningBuild(A)).toBe(A)
    expect(parseRunningBuild('')).toBeNull()
    expect(parseRunningBuild(undefined)).toBeNull()
    expect(buildRelation(A, B)).toBe('newer')
    expect(buildRelation(A, A)).toBe('same')
    expect(buildRelation(null, B)).toBe('unknown')
    expect(buildRelation(A, null)).toBe('unknown')
  })

  it('after a chunk error: reload, offline or a real crash', () => {
    expect(chunkErrorAction({ reachable: true, relation: 'newer', allowed: true })).toBe('reload')
    // Can't tell which build we are: a reload can only help, and the guard stops a loop.
    expect(chunkErrorAction({ reachable: true, relation: 'unknown', allowed: true })).toBe('reload')
    expect(chunkErrorAction({ reachable: true, relation: 'newer', allowed: false })).toBe('crash')
    expect(chunkErrorAction({ reachable: true, relation: 'same', allowed: true })).toBe('crash')
    expect(chunkErrorAction({ reachable: false, relation: 'unknown', allowed: true })).toBe('offline')
  })

  it('on resume: reloads only after 10+ minutes hidden, into a newer build, with nothing typed', () => {
    const base = { hiddenMs: RESUME_CHECK_AFTER_MS, relation: 'newer' as const, typing: false, allowed: true }
    expect(shouldReloadOnResume(base)).toBe(true)
    expect(shouldReloadOnResume({ ...base, hiddenMs: RESUME_CHECK_AFTER_MS - 1 })).toBe(false)
    expect(shouldReloadOnResume({ ...base, relation: 'same' })).toBe(false)
    expect(shouldReloadOnResume({ ...base, relation: 'unknown' })).toBe(false)
    expect(shouldReloadOnResume({ ...base, typing: true })).toBe(false)
    expect(shouldReloadOnResume({ ...base, allowed: false })).toBe(false)
  })

  it('keeps the reload mark across the reload', () => {
    expect(parseReloadMark(JSON.stringify({ at: 5, how: 'chunk', noticed: false }))).toEqual({ at: 5, how: 'chunk', noticed: false })
    expect(parseReloadMark(JSON.stringify({ at: 5, how: 'resume' }))).toEqual({ at: 5, how: 'resume', noticed: false })
    expect(parseReloadMark(JSON.stringify({ at: 'x', how: 'chunk' }))).toBeNull()
    expect(parseReloadMark('{')).toBeNull()
    expect(parseReloadMark(null)).toBeNull()
  })

  it('vercel.json answers a missing static file 404 before the app fallback', () => {
    const routes = (JSON.parse(readFileSync(join(__dirname, '..', 'vercel.json'), 'utf8')) as { routes: Array<Record<string, unknown>> }).routes
    const fs = routes.findIndex(r => r.handle === 'filesystem')
    const miss = routes.findIndex(r => r.status === 404 && String(r.src).includes('_expo/static'))
    const fallback = routes.findIndex(r => r.src === '/.*')
    expect(fs).toBeGreaterThanOrEqual(0)
    expect(miss).toBeGreaterThan(fs)
    expect(miss).toBeLessThan(fallback)
    expect((routes[miss].headers as Record<string, string>)['cache-control']).toBe('no-store')
  })
})
