import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { replay, warningsFor } from '../lib/scoresheet/engine'
import { deleteEvent, editEvent, insertBefore, newId, record, redo as redoDoc, undo as undoDoc } from '../lib/scoresheet/history'
import { loadMatch, saveMatch } from '../lib/scoresheet/storage'
import { matchSummary } from '../lib/scoresheet/summary'
import { exampleMatch } from '../lib/scoresheet/exampleMatch'
import { Sentry } from '../lib/sentry'
import type { MatchDoc, MatchInfo, MatchState, ScoreEventInput, Warning } from '../types'

export type ScoreMatchApi = {
  doc: MatchDoc | null
  state: MatchState | null
  loading: boolean
  /** Set when the device refused a save (storage full or blocked). */
  saveError: string | null
  /** Warnings raised by the latest tap. */
  lastWarnings: Warning[]
  dismissWarnings: () => void
  add: (input: ScoreEventInput) => void
  undo: () => void
  redo: () => void
  edit: (eventId: string, patch: Partial<ScoreEventInput>) => void
  remove: (eventId: string) => void
  insert: (beforeEventId: string, input: ScoreEventInput) => void
  /** Edit the match details (sheet header, officials). Not part of undo. */
  updateInfo: (patch: Partial<MatchInfo>) => void
  /** Tick or untick a "Copy to paper" step. Not part of undo. */
  setCopied: (stepId: string, done: boolean) => void
}

/**
 * One scorekeeper match: loads it from the device, and saves every change as it is made, so a
 * closed app or tab comes back exactly where it was (score, rotations, undo/redo history).
 */
export function useScoreMatch(id: string | undefined): ScoreMatchApi {
  const [doc, setDoc] = useState<MatchDoc | null>(null)
  const [loading, setLoading] = useState(true)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [lastWarnings, setLastWarnings] = useState<Warning[]>([])
  // The latest doc, so quick taps build on each other even before React re-renders.
  const latest = useRef<MatchDoc | null>(null)

  useEffect(() => {
    let cancelled = false
    if (!id) return
    setLoading(true)
    void loadMatch(id).then(loaded => {
      if (cancelled) return
      latest.current = loaded
      setDoc(loaded)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [id])

  const state = useMemo(() => (doc ? replay(doc.setup, doc.log) : null), [doc])

  const commit = useCallback((next: MatchDoc, newEventId?: string) => {
    latest.current = next
    // The write starts before the screen re-renders (on web it has already finished).
    saveMatch(next, matchSummary(next, replay(next.setup, next.log)))
      .then(saved => {
        if (latest.current?.id === saved.id && (latest.current.seq ?? 0) < (saved.seq ?? 0)) latest.current = { ...latest.current, seq: saved.seq }
        setSaveError(null)
      })
      .catch((err: unknown) => {
        Sentry.captureException(err)
        setSaveError("Couldn't save to this device. Keep this screen open; your taps are kept here.")
      })
    setDoc(next)
    if (newEventId) {
      const s = replay(next.setup, next.log)
      setLastWarnings(warningsFor(s, newEventId))
    } else setLastWarnings([])
  }, [])

  const withDoc = useCallback((fn: (d: MatchDoc) => MatchDoc | { doc: MatchDoc; eventId?: string }) => {
    const current = latest.current
    if (!current) return
    const out = fn(current)
    if ('setup' in out) commit(out)
    else commit(out.doc, out.eventId)
  }, [commit])

  return {
    doc,
    state,
    loading: loading && !!id,
    saveError,
    lastWarnings,
    dismissWarnings: useCallback(() => setLastWarnings([]), []),
    add: useCallback(input => withDoc(d => {
      const { doc: next, event } = record(d, input)
      return { doc: next, eventId: event.id }
    }), [withDoc]),
    undo: useCallback(() => withDoc(d => undoDoc(d)), [withDoc]),
    redo: useCallback(() => withDoc(d => redoDoc(d)), [withDoc]),
    edit: useCallback((eventId, patch) => withDoc(d => ({ doc: editEvent(d, eventId, patch), eventId })), [withDoc]),
    remove: useCallback(eventId => withDoc(d => deleteEvent(d, eventId)), [withDoc]),
    insert: useCallback((beforeEventId, input) => withDoc(d => {
      const next = insertBefore(d, beforeEventId, input)
      return { doc: next, eventId: next.log.find(e => !d.log.includes(e))?.id }
    }), [withDoc]),
    updateInfo: useCallback(patch => withDoc(d => ({ ...d, updatedAt: Date.now(), setup: { ...d.setup, info: { ...d.setup.info, ...patch } } })), [withDoc]),
    setCopied: useCallback((stepId, done) => withDoc(d => {
      const copied = (d.copied ?? []).filter(x => x !== stepId)
      return { ...d, copied: done ? [...copied, stepId] : copied }
    }), [withDoc]),
  }
}

/** Creates and saves a new match, optionally starting set 1 (undoable); resolves with its id. */
/** Saves a fresh copy of the built-in example match (lib/scoresheet/exampleMatch) and returns its id. */
export async function openExampleMatch(): Promise<string> {
  const doc = exampleMatch()
  await saveMatch(doc, matchSummary(doc, replay(doc.setup, doc.log)))
  return doc.id
}

export async function createMatch(setup: MatchDoc['setup'], firstSet?: ScoreEventInput): Promise<string> {
  const now = Date.now()
  const id = newId()
  let doc: MatchDoc = { id, createdAt: now, updatedAt: now, setup, log: [], undo: [], redo: [] }
  if (firstSet) doc = record(doc, firstSet, now).doc
  await saveMatch(doc, matchSummary(doc, replay(setup, doc.log)))
  return id
}
