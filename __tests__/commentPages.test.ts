import {
  COMMENTS_PAGE, keepLoadedOlder, mergeComments, missingParentIds, pageFromNewestFirst, patchCommentRow, withOlderPage,
} from '../utils/commentPages'
import type { CommentPage } from '../types'

type Row = { id: string; created_at: string; parent_id: string | null; body?: string }
const row = (i: number, extra: Partial<Row> = {}): Row => ({
  id: `c${i}`, created_at: new Date(Date.UTC(2030, 0, 1, 0, i)).toISOString(), parent_id: null, ...extra,
})
const newestFirst = (n: number, from = 0) => Array.from({ length: n }, (_, i) => row(from + n - 1 - i))

describe('commentPages', () => {
  it('pageFromNewestFirst: oldest first, extra row means hasEarlier, cursor is the oldest paged row', () => {
    const page = pageFromNewestFirst(newestFirst(COMMENTS_PAGE + 1))
    expect(page.rows).toHaveLength(COMMENTS_PAGE)
    expect(page.rows[0].id).toBe('c1')
    expect(page.hasEarlier).toBe(true)
    expect(page.cursor).toBe(row(1).created_at)
    expect(pageFromNewestFirst(newestFirst(3)).hasEarlier).toBe(false)
    expect(pageFromNewestFirst([]).cursor).toBeNull()
  })

  it('mergeComments dedupes by id (later wins) and sorts oldest first', () => {
    const merged = mergeComments([row(2), row(1)], [row(1, { body: 'new' }), row(3)])
    expect(merged.map(r => r.id)).toEqual(['c1', 'c2', 'c3'])
    expect(merged[0].body).toBe('new')
  })

  it('missingParentIds lists each absent parent once', () => {
    expect(missingParentIds([row(5, { parent_id: 'c1' }), row(6, { parent_id: 'c1' }), row(7, { parent_id: 'c5' })])).toEqual(['c1'])
  })

  it('keepLoadedOlder keeps pages loaded before the new window, and only then', () => {
    const latest: CommentPage<Row> = { rows: [row(10), row(11)], hasEarlier: true, cursor: row(10).created_at }
    expect(keepLoadedOlder(undefined, latest)).toBe(latest)
    const prev: CommentPage<Row> = { rows: [row(5), row(6), row(9), row(10)], hasEarlier: true, cursor: row(5).created_at }
    const kept = keepLoadedOlder(prev, latest)
    expect(kept.rows.map(r => r.id)).toEqual(['c5', 'c6', 'c9', 'c10', 'c11'])
    expect(kept.cursor).toBe(prev.cursor)
    // The new page already reaches the start of the thread: nothing to keep.
    expect(keepLoadedOlder(prev, { ...latest, hasEarlier: false })).toEqual({ ...latest, hasEarlier: false })
  })

  it('withOlderPage prepends and moves the cursor back', () => {
    const base: CommentPage<Row> = { rows: [row(10)], hasEarlier: true, cursor: row(10).created_at }
    const older: CommentPage<Row> = { rows: [row(8), row(9)], hasEarlier: false, cursor: row(8).created_at }
    expect(withOlderPage(base, older)).toEqual({ rows: [row(8), row(9), row(10)], hasEarlier: false, cursor: row(8).created_at })
  })

  it('patchCommentRow replaces one row in place, or leaves the page alone', () => {
    const page: CommentPage<Row> = { rows: [row(1), row(2)], hasEarlier: false, cursor: null }
    expect(patchCommentRow(page, 'c2', { body: 'edited' }).rows[1].body).toBe('edited')
    expect(patchCommentRow(page, 'nope', { body: 'x' })).toBe(page)
  })
})
