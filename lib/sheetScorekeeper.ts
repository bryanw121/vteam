import type { SheetScoringFn, SheetScoringResult } from '../types'

/**
 * Calls the Google Sheet tournament app's scoring (its doPost: startMatch, submitScore, cancelMatch,
 * checkPin). Sent as text/plain so browsers make a simple request (Apps Script can't answer a CORS
 * preflight); Apps Script redirects to its content host, which fetch follows. Throws only when the
 * network or the server fails; a refused call (wrong PIN, conflict…) comes back as `ok: false`.
 */
export async function callSheet(execUrl: string, fn: SheetScoringFn, payload: Record<string, unknown>): Promise<SheetScoringResult> {
  const res = await fetch(execUrl, {
    method: 'POST',
    headers: { 'content-type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ fn, payload }),
  })
  if (!res.ok) throw new Error(`Scoring answered ${res.status}`)
  const out = (await res.json()) as SheetScoringResult
  if (!out || typeof out.ok !== 'boolean') throw new Error('Not a scoring answer')
  return out
}

/** The PIN and name a scorekeeper entered, per tournament: in memory, and for the tab on web. */
const keepers = new Map<string, { pin: string; by: string }>()
const storeKey = (programId: string) => `vteam.sheetKeeper.${programId}`

export function getKeeper(programId: string): { pin: string; by: string } | null {
  const hit = keepers.get(programId)
  if (hit) return hit
  try {
    const raw = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(storeKey(programId)) : null
    if (raw) {
      const v = JSON.parse(raw) as { pin: string; by: string }
      keepers.set(programId, v)
      return v
    }
  } catch { /* storage off: memory only */ }
  return null
}

export function setKeeper(programId: string, v: { pin: string; by: string } | null): void {
  if (v) keepers.set(programId, v)
  else keepers.delete(programId)
  try {
    if (typeof sessionStorage === 'undefined') return
    if (v) sessionStorage.setItem(storeKey(programId), JSON.stringify(v))
    else sessionStorage.removeItem(storeKey(programId))
  } catch { /* storage off */ }
}
