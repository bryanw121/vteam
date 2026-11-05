import type { CommentPage } from '../types'

/**
 * Paged discussions (event and tournament comments, #36 / #8): the newest
 * COMMENTS_PAGE comments first, older pages on "Load earlier". Rows are kept
 * oldest first. Pure helpers; the fetchers live next to each feature's API.
 */

/** Newest comments fetched per page. A fetch asks for one more to learn whether older ones exist. */
export const COMMENTS_PAGE = 100

type Row = { id: string; created_at: string; parent_id: string | null }

function byCreatedAt(a: Row, b: Row): number {
  return a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0
}

/** Union by id (later lists win), oldest first. */
export function mergeComments<T extends Row>(...lists: T[][]): T[] {
  const byId = new Map<string, T>()
  lists.forEach(list => list.forEach(c => byId.set(c.id, c)))
  return Array.from(byId.values()).sort(byCreatedAt)
}

/**
 * From a newest-first response of up to COMMENTS_PAGE + 1 rows: the page
 * (oldest first), whether older rows exist, and the cursor for the next page.
 */
export function pageFromNewestFirst<T extends Row>(newestFirst: T[]): CommentPage<T> {
  const rows = newestFirst.slice(0, COMMENTS_PAGE)
  return {
    rows: rows.slice().reverse(),
    hasEarlier: newestFirst.length > COMMENTS_PAGE,
    cursor: rows[rows.length - 1]?.created_at ?? null,
  }
}

/** Parents of replies in `rows` that are not in `rows` (a thread renders under its root). */
export function missingParentIds<T extends Row>(rows: T[]): string[] {
  const have = new Set(rows.map(c => c.id))
  return Array.from(new Set(rows.filter(c => c.parent_id && !have.has(c.parent_id)).map(c => c.parent_id as string)))
}

/**
 * A refetched newest page, keeping older pages the viewer already loaded (a
 * focus refetch or a write's invalidate must not collapse the thread).
 */
export function keepLoadedOlder<T extends Row>(prev: CommentPage<T> | undefined, latest: CommentPage<T>): CommentPage<T> {
  const windowStart = latest.cursor
  if (!prev?.cursor || !latest.hasEarlier || !windowStart || prev.cursor >= windowStart) return latest
  const older = prev.rows.filter(c => c.created_at < windowStart)
  return { rows: mergeComments(older, latest.rows), hasEarlier: prev.hasEarlier, cursor: prev.cursor }
}

/** `base` with an older page merged in. */
export function withOlderPage<T extends Row>(base: CommentPage<T>, older: CommentPage<T>): CommentPage<T> {
  const cursor = older.cursor && (!base.cursor || older.cursor < base.cursor) ? older.cursor : base.cursor
  return { rows: mergeComments(older.rows, base.rows), hasEarlier: older.hasEarlier, cursor }
}

/** Replace one cached row in place (an edit or soft delete of a comment possibly older than the newest page). */
export function patchCommentRow<T extends Row>(page: CommentPage<T>, id: string, patch: Partial<T>): CommentPage<T> {
  const idx = page.rows.findIndex(c => c.id === id)
  if (idx === -1) return page
  const rows = page.rows.slice()
  rows[idx] = { ...rows[idx], ...patch }
  return { ...page, rows }
}
