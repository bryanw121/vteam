/**
 * Undo / redo and timeline editing for a match. The log only changes through these operations,
 * and each one is stored with its inverse, so undo covers taps *and* edits to past rallies, and
 * the history survives the app being closed (it is saved with the match).
 */
import type { LogOp, MatchDoc, MatchHistory, ScoreEvent, ScoreEventInput } from '../../types/scoresheet'

/** Undo depth kept on the device (a long five-set match is about 250 taps). */
export const HISTORY_LIMIT = 500

export function newId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

export function stamp(input: ScoreEventInput, now: number = Date.now()): ScoreEvent {
  return { ...input, id: newId(), at: now } as ScoreEvent
}

function apply(log: ScoreEvent[], op: LogOp): ScoreEvent[] {
  const next = log.slice()
  switch (op.kind) {
    case 'append':
      next.push(op.event)
      break
    case 'insert':
      next.splice(op.index, 0, op.event)
      break
    case 'remove':
      next.splice(op.index, 1)
      break
    case 'replace':
      next[op.index] = op.after
      break
  }
  return next
}

function invert(op: LogOp, log: ScoreEvent[]): LogOp {
  switch (op.kind) {
    case 'append':
      return { kind: 'remove', index: log.length - 1, event: op.event }
    case 'insert':
      return { kind: 'remove', index: op.index, event: op.event }
    case 'remove':
      return { kind: 'insert', index: op.index, event: op.event }
    case 'replace':
      return { kind: 'replace', index: op.index, before: op.after, after: op.before }
  }
}

type DocWithHistory = MatchDoc

/** Runs a new operation: clears redo. */
export function perform(doc: DocWithHistory, op: LogOp, now: number = Date.now()): DocWithHistory {
  const undo = [...doc.undo, op]
  if (undo.length > HISTORY_LIMIT) undo.splice(0, undo.length - HISTORY_LIMIT)
  return { ...doc, log: apply(doc.log, op), undo, redo: [], updatedAt: now }
}

export function record(doc: DocWithHistory, input: ScoreEventInput, now: number = Date.now()): { doc: DocWithHistory; event: ScoreEvent } {
  const event = stamp(input, now)
  return { doc: perform(doc, { kind: 'append', event }, now), event }
}

export function canUndo(doc: MatchHistory) {
  return doc.undo.length > 0
}
export function canRedo(doc: MatchHistory) {
  return doc.redo.length > 0
}

export function undo(doc: DocWithHistory, now: number = Date.now()): DocWithHistory {
  const op = doc.undo.at(-1)
  if (!op) return doc
  const nextLog = apply(doc.log, inverse(op, doc.log))
  return { ...doc, log: nextLog, undo: doc.undo.slice(0, -1), redo: [...doc.redo, op], updatedAt: now }
}

export function redo(doc: DocWithHistory, now: number = Date.now()): DocWithHistory {
  const op = doc.redo.at(-1)
  if (!op) return doc
  return { ...doc, log: apply(doc.log, op), undo: [...doc.undo, op], redo: doc.redo.slice(0, -1), updatedAt: now }
}

/** The inverse of an op that has already been applied to `log`. */
function inverse(op: LogOp, log: ScoreEvent[]): LogOp {
  if (op.kind === 'append') {
    // The appended event may no longer be last if edits were undone in between; find it.
    const index = log.findIndex(e => e.id === op.event.id)
    return { kind: 'remove', index: index >= 0 ? index : log.length - 1, event: op.event }
  }
  return invert(op, log)
}

/** Edits a past event (e.g. the rally went to the other team). */
export function editEvent(doc: DocWithHistory, eventId: string, patch: Partial<ScoreEventInput>, now: number = Date.now()): DocWithHistory {
  const index = doc.log.findIndex(e => e.id === eventId)
  if (index < 0) return doc
  const before = doc.log[index]
  const after = { ...before, ...patch, id: before.id, at: before.at } as ScoreEvent
  return perform(doc, { kind: 'replace', index, before, after }, now)
}

/** Deletes a past event (recorded by mistake). */
export function deleteEvent(doc: DocWithHistory, eventId: string, now: number = Date.now()): DocWithHistory {
  const index = doc.log.findIndex(e => e.id === eventId)
  if (index < 0) return doc
  return perform(doc, { kind: 'remove', index, event: doc.log[index] }, now)
}

/** Inserts a missed event before another one (a rally nobody tapped). */
export function insertBefore(doc: DocWithHistory, beforeEventId: string, input: ScoreEventInput, now: number = Date.now()): DocWithHistory {
  const index = doc.log.findIndex(e => e.id === beforeEventId)
  if (index < 0) return doc
  const target = doc.log[index]
  // Keep the timeline in order: the missed event happened just before the one it precedes.
  const event = { ...stamp(input, now), at: target.at - 1 } as ScoreEvent
  return perform(doc, { kind: 'insert', index, event }, now)
}
