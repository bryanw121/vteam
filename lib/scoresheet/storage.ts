/**
 * Saving scorekeeper matches on the device, so closing the app (or the tab, or a crash) never
 * loses a tap. Every change is written before the screen updates. Each match is kept in two
 * copies written alternately with a save counter: a write cut off halfway leaves the other copy
 * intact, and loading takes the newest copy that reads back cleanly.
 *
 * Native uses AsyncStorage (writes are queued so they land in order). Web uses localStorage
 * directly (storage.web.ts): synchronous, so the save is done before the page can close.
 */
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { MatchDoc, MatchSummary } from '../../types/scoresheet'
import { pickNewest, slotKey, INDEX_KEY, type KeyValueStore, upsertSummary } from './storageCore'

const store: KeyValueStore = {
  get: key => AsyncStorage.getItem(key),
  set: (key, value) => AsyncStorage.setItem(key, value),
  remove: key => AsyncStorage.removeItem(key),
}

let queue: Promise<unknown> = Promise.resolve()
/** Runs storage work in order, one write at a time. */
function enqueue<T>(work: () => Promise<T>): Promise<T> {
  const next = queue.then(work, work)
  queue = next.catch(() => {})
  return next
}

/** Last save counter per match, so quick taps never reuse one. */
const seqs = new Map<string, number>()

export async function loadMatch(id: string): Promise<MatchDoc | null> {
  await queue
  const [a, b] = await Promise.all([store.get(slotKey(id, 0)), store.get(slotKey(id, 1))])
  return pickNewest(a, b)
}

/** Saves the match (both the doc and its row in the list). Resolves when written. */
export function saveMatch(doc: MatchDoc, summary: MatchSummary): Promise<MatchDoc> {
  return enqueue(async () => {
    const seq = Math.max(doc.seq ?? 0, seqs.get(doc.id) ?? 0) + 1
    seqs.set(doc.id, seq)
    const saved = { ...doc, seq }
    await store.set(slotKey(doc.id, seq % 2), JSON.stringify(saved))
    const index = await listMatchesNow()
    await store.set(INDEX_KEY, JSON.stringify(upsertSummary(index, summary)))
    return saved
  })
}

async function listMatchesNow(): Promise<MatchSummary[]> {
  try {
    const raw = await store.get(INDEX_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? (parsed as MatchSummary[]) : []
  } catch {
    return []
  }
}

export async function listMatches(): Promise<MatchSummary[]> {
  await queue
  return listMatchesNow()
}

export function deleteMatch(id: string): Promise<void> {
  return enqueue(async () => {
    await Promise.all([store.remove(slotKey(id, 0)), store.remove(slotKey(id, 1))])
    const index = await listMatchesNow()
    await store.set(INDEX_KEY, JSON.stringify(index.filter(m => m.id !== id)))
  })
}
