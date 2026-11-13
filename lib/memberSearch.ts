import { supabase } from './supabase'
import type { MemberSearchResult } from '../types'

/**
 * Find members by username / first / last name (substring, case-insensitive)
 * for the new-DM, co-host and tournament-invite boxes. Runs the
 * `search_members` RPC, which escapes the term server-side and is rate limited
 * (#11: 120 searches a minute per user; over that it fails with a "Too many
 * requests" error the caller can show). `exclude` drops ids (yourself, the host).
 */
export async function searchMembers(
  term: string,
  opts: { limit?: number; exclude?: ReadonlyArray<string | null | undefined> } = {},
): Promise<MemberSearchResult[]> {
  const trimmed = term.trim()
  if (!trimmed) return []
  const limit = opts.limit ?? 10
  const exclude = new Set((opts.exclude ?? []).filter((id): id is string => !!id))
  const { data, error } = await supabase.rpc('search_members', { p_query: trimmed, p_limit: limit + exclude.size })
  if (error) throw error
  return ((data ?? []) as MemberSearchResult[])
    .map(p => ({ ...p, position: p.position ?? [] }))
    .filter(p => !exclude.has(p.id))
    .slice(0, limit)
}
