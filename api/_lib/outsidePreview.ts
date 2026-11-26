/**
 * Reads for outside-game link previews (#395, `api/outside-page.ts`): one row of
 * `external_sessions` or `external_programs` by id, with the public anon key, so a preview shows
 * exactly what a guest sees. Only `fetch` and import-free app modules.
 */
import { EXTERNAL_PROGRAM_SELECT, EXTERNAL_SESSION_SELECT } from '../../constants/events'
import { rowId } from '../../utils/urlState'
import type { ExternalProgram, ExternalSession } from '../../types'
import type { SupabaseRestConfig } from './eventPreview'

const FETCH_TIMEOUT_MS = 3000
type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

/** A Skelly id from a link (slugs, not uuids), or null when it isn't one. */
export function outsideId(raw: unknown): string | null {
  const id = rowId.parse(typeof raw === 'string' ? raw : undefined)
  return id || null
}

async function readOne<T>(table: string, select: string, id: string, cfg: SupabaseRestConfig, fetchImpl: FetchLike): Promise<T | null> {
  const signal = typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal ? AbortSignal.timeout(FETCH_TIMEOUT_MS) : undefined
  const url = `${cfg.url}/rest/v1/${table}?select=${encodeURIComponent(select.replace(/\s+/g, ''))}&id=eq.${encodeURIComponent(id)}&limit=1`
  const res = await fetchImpl(url, {
    headers: { apikey: cfg.anonKey, Authorization: `Bearer ${cfg.anonKey}`, Accept: 'application/json' },
    signal,
  })
  if (!res.ok) throw new Error(`PostgREST ${res.status} for ${table}`)
  const rows = (await res.json()) as T[]
  return Array.isArray(rows) && rows[0] ? rows[0] : null
}

/** The session, or null when it's gone (cancelled sessions are deleted by the import). */
export function fetchOutsideSession(id: string, cfg: SupabaseRestConfig, fetchImpl: FetchLike = fetch): Promise<ExternalSession | null> {
  return readOne<ExternalSession>('external_sessions', EXTERNAL_SESSION_SELECT, id, cfg, fetchImpl)
}

/** The tournament or league, or null when it's gone. */
export function fetchOutsideProgram(id: string, cfg: SupabaseRestConfig, fetchImpl: FetchLike = fetch): Promise<ExternalProgram | null> {
  return readOne<ExternalProgram>('external_programs', EXTERNAL_PROGRAM_SELECT, id, cfg, fetchImpl)
}
