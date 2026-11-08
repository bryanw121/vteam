/**
 * No-show flag (#151): the window, who is flagged, the menu entry and the
 * migration's security shape. The database rules themselves are exercised on
 * beta by e2e/rls.spec.ts.
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { isViewerNoShow, noShowUserIds, noShowWindow, NO_SHOW_GRACE_MS } from '../hooks/event/derive'
import { memberRowActions } from '../utils/rosterActions'
import { NO_SHOW_HOST_NOTE } from '../constants/copy'
import type { RosterActionContext } from '../types'

const START = Date.parse('2026-11-04T22:00:00Z')
const event = { event_date: '2026-11-04T22:00:00', duration_minutes: 120, cancelled_at: null }
const END = START + 120 * 60_000

describe('noShowWindow', () => {
  it('opens at the start and closes 2 hours after the end', () => {
    expect(noShowWindow(event, START - 1).open).toBe(false)
    expect(noShowWindow(event, START).open).toBe(true)
    expect(noShowWindow(event, END + NO_SHOW_GRACE_MS - 1).open).toBe(true)
    expect(noShowWindow(event, END + NO_SHOW_GRACE_MS).open).toBe(false)
    expect(noShowWindow(event, START).closesAt).toBe(END + 2 * 3600_000)
  })

  it('stays closed for a cancelled event', () => {
    expect(noShowWindow({ ...event, cancelled_at: '2026-11-04T20:00:00Z' }, START + 60_000).open).toBe(false)
  })

  it('defaults to a 2-hour game and handles no event', () => {
    expect(noShowWindow({ ...event, duration_minutes: null as unknown as number }, START).closesAt).toBe(END + NO_SHOW_GRACE_MS)
    expect(noShowWindow(undefined, START)).toEqual({ open: false, closesAt: 0 })
  })
})

describe('flags', () => {
  const rows = [
    { user_id: 'a', status: 'attending' as const, no_show: true },
    { user_id: 'b', status: 'attending' as const, no_show: false },
    { user_id: 'c', status: 'attending' as const },
  ]
  it('collects flagged attending players', () => {
    expect([...noShowUserIds(rows)]).toEqual(['a'])
  })
  it('knows when the viewer is flagged', () => {
    expect(isViewerNoShow(rows, 'a')).toBe(true)
    expect(isViewerNoShow(rows, 'b')).toBe(false)
    expect(isViewerNoShow(rows, 'c')).toBe(false)
    expect(isViewerNoShow(rows, null)).toBe(false)
    expect(isViewerNoShow([{ user_id: 'a', status: 'waitlisted', no_show: true }], 'a')).toBe(false)
  })
})

describe('roster menu entry', () => {
  const ctx: RosterActionContext = { canMessage: true, viewerId: 'host', silencedUserIds: new Set(), onMessage: jest.fn(), onOpenProfile: jest.fn() }
  const remove = jest.fn()

  it('sits above Remove and says until when it can be undone', () => {
    const onToggle = jest.fn()
    const actions = memberRowActions({ id: 'amy' }, ctx, remove, { flagged: false, until: '9:00 PM', onToggle })
    expect(actions.map(a => a.key)).toEqual(['message', 'profile', 'no-show', 'remove'])
    const item = actions[2]
    expect(item).toMatchObject({ label: 'Mark as no-show', subtitle: 'No points for this event. You can undo until 9:00 PM.', caution: true })
    expect(item.destructive).toBeUndefined()
    item.onPress()
    expect(onToggle).toHaveBeenCalled()
  })

  it('reads Undo no-show on a flagged player', () => {
    const actions = memberRowActions({ id: 'amy' }, ctx, remove, { flagged: true, until: '9:00 PM', onToggle: jest.fn() })
    expect(actions.find(a => a.key === 'no-show')?.label).toBe('Undo no-show')
  })

  it('is absent without the window, and on the viewer’s own row', () => {
    expect(memberRowActions({ id: 'amy' }, ctx, remove).some(a => a.key === 'no-show')).toBe(false)
    expect(memberRowActions({ id: 'host' }, ctx, remove, { flagged: false, until: '9:00 PM', onToggle: jest.fn() }).some(a => a.key === 'no-show')).toBe(false)
  })
})

describe('host note', () => {
  it('reads one way with no flags and counts them otherwise', () => {
    expect(NO_SHOW_HOST_NOTE(0, '9:00 PM')).toBe("Game started. Tap ⋯ on anyone who didn't come. Everyone else gets points at 9:00 PM.")
    expect(NO_SHOW_HOST_NOTE(1, '9:00 PM')).toBe('1 no-show. Everyone else gets points at 9:00 PM.')
    expect(NO_SHOW_HOST_NOTE(2, '9:00 PM')).toBe('2 no-shows. Everyone else gets points at 9:00 PM.')
  })
})

describe('migration 20261104190000_event_no_show', () => {
  const dir = resolve(__dirname, '..', 'supabase', 'migrations')
  const up = readFileSync(resolve(dir, '20261104190000_event_no_show.sql'), 'utf8')
  const down = readFileSync(resolve(dir, '20261104190000_event_no_show.down.sql'), 'utf8')

  it('set_no_show is SECURITY DEFINER with a fixed search_path, for authenticated only', () => {
    expect(up).toMatch(/function public\.set_no_show[\s\S]*?security definer\s+set search_path = ''/)
    expect(up).toMatch(/revoke all on function public\.set_no_show\(uuid, uuid, boolean\) from public, anon;/)
    expect(up).toMatch(/grant execute on function public\.set_no_show\(uuid, uuid, boolean\) to authenticated;/)
  })

  it('award_event_points waits for end + 2h and skips flagged players', () => {
    expect(up).toMatch(/make_interval\(mins => e\.duration_minutes\) \+ interval '2 hours' <= now\(\)/)
    expect(up).toMatch(/and not ea\.no_show/)
  })

  it('the rollback restores the old award rule and drops everything it added', () => {
    expect(down).not.toContain('not ea.no_show')
    expect(down).toMatch(/e\.event_date \+ make_interval\(mins => e\.duration_minutes\) <= now\(\)/)
    for (const what of ['function if exists public.set_no_show', 'trigger if exists event_attendees_guard_no_show', 'function if exists public.guard_no_show_columns', 'column if exists no_show_marked_by', 'column if exists no_show_marked_at', 'column if exists no_show;']) {
      expect(down).toContain(`drop ${what}`)
    }
  })
})
