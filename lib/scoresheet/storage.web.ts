/**
 * Web version of storage.ts: localStorage is synchronous, so a save has finished before the
 * tab can close or reload. Same two-copy scheme (see storage.ts).
 */
import type { MatchDoc, MatchSummary } from '../../types/scoresheet'
import { INDEX_KEY, pickNewest, slotKey, upsertSummary } from './storageCore'

function ls(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null
  } catch {
    return null
  }
}

function listNow(): MatchSummary[] {
  try {
    const raw = ls()?.getItem(INDEX_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? (parsed as MatchSummary[]) : []
  } catch {
    return []
  }
}

/** Last save counter per match, so quick taps never reuse one. */
const seqs = new Map<string, number>()

export async function loadMatch(id: string): Promise<MatchDoc | null> {
  const s = ls()
  if (!s) return null
  return pickNewest(s.getItem(slotKey(id, 0)), s.getItem(slotKey(id, 1)))
}

/** Throws when the browser refuses (storage full or blocked) so the screen can say so. */
export async function saveMatch(doc: MatchDoc, summary: MatchSummary): Promise<MatchDoc> {
  const s = ls()
  if (!s) throw new Error('Storage is not available in this browser.')
  const seq = Math.max(doc.seq ?? 0, seqs.get(doc.id) ?? 0) + 1
  seqs.set(doc.id, seq)
  const saved = { ...doc, seq }
  s.setItem(slotKey(doc.id, seq % 2), JSON.stringify(saved))
  s.setItem(INDEX_KEY, JSON.stringify(upsertSummary(listNow(), summary)))
  return saved
}

export async function listMatches(): Promise<MatchSummary[]> {
  return listNow()
}

export async function deleteMatch(id: string): Promise<void> {
  const s = ls()
  if (!s) return
  s.removeItem(slotKey(id, 0))
  s.removeItem(slotKey(id, 1))
  s.setItem(INDEX_KEY, JSON.stringify(listNow().filter(m => m.id !== id)))
}
