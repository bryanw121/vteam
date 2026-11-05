import type { MatchDoc, MatchSummary } from '../../types/scoresheet'

export type KeyValueStore = {
  get: (key: string) => Promise<string | null> | string | null
  set: (key: string, value: string) => Promise<void> | void
  remove: (key: string) => Promise<void> | void
}

export const INDEX_KEY = 'vteam.scoresheet.index'
export const slotKey = (id: string, slot: number) => `vteam.scoresheet.match.${id}.${slot}`

function parse(raw: string | null): MatchDoc | null {
  if (!raw) return null
  try {
    const doc = JSON.parse(raw) as MatchDoc
    if (!doc || typeof doc.id !== 'string' || !Array.isArray(doc.log) || !doc.setup) return null
    return { ...doc, undo: Array.isArray(doc.undo) ? doc.undo : [], redo: Array.isArray(doc.redo) ? doc.redo : [] }
  } catch {
    return null
  }
}

/** The newer of the two saved copies that parses; a torn or corrupt copy is skipped. */
export function pickNewest(a: string | null, b: string | null): MatchDoc | null {
  const docs = [parse(a), parse(b)].filter((d): d is MatchDoc => d != null)
  if (!docs.length) return null
  return docs.reduce((x, y) => ((y.seq ?? 0) > (x.seq ?? 0) ? y : x))
}

export function upsertSummary(index: MatchSummary[], summary: MatchSummary): MatchSummary[] {
  return [summary, ...index.filter(m => m.id !== summary.id)].sort((x, y) => y.updatedAt - x.updatedAt)
}
