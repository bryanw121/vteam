import { nextPicks, parsePrefillDate, pollDraftProblem, pollOf, pollOptionsPayload, tallyPoll, winningTimeOptions, withMyVotes } from '../utils/clubPoll'
import { routes } from '../utils/routes'
import type { ClubPoll } from '../types'

const NOW = Date.parse('2026-11-13T18:00:00Z')
const opt = (id: string, position: number, voters: string[], starts_at: string | null = null) => ({ id, position, label: id.toUpperCase(), starts_at, club_poll_votes: voters.map(user_id => ({ user_id })) })
const poll = (over: Partial<ClubPoll> = {}): ClubPoll => ({
  kind: 'time', multi: true, closes_at: '2026-11-14T18:00:00Z', event_id: null,
  club_poll_options: [opt('b', 1, ['u2', 'u3'], '2026-11-20T01:00:00Z'), opt('a', 0, ['u1', 'u2'], '2026-11-19T01:00:00Z'), opt('c', 2, [])],
  ...over,
})

describe('tallyPoll', () => {
  it('orders options, counts voters once and marks mine', () => {
    const t = tallyPoll(poll(), 'u2', NOW)
    expect(t.options.map(o => o.option.id)).toEqual(['a', 'b', 'c'])
    expect(t.voters).toBe(3)
    expect(t.myOptionIds).toEqual(['a', 'b'])
    expect(t.closed).toBe(false)
    expect(t.winners).toEqual([])
  })
  it('names all tied winners once closed, none when nobody voted', () => {
    const closed = tallyPoll(poll({ closes_at: '2026-11-13T00:00:00Z' }), null, NOW)
    expect(closed.closed).toBe(true)
    expect(closed.winners.map(o => o.id)).toEqual(['a', 'b'])
    expect(winningTimeOptions(closed).map(o => o.id)).toEqual(['a', 'b'])
    const empty = tallyPoll(poll({ closes_at: '2026-11-13T00:00:00Z', club_poll_options: [opt('x', 0, []), opt('y', 1, [])] }), null, NOW)
    expect(empty.winners).toEqual([])
  })
  it('a poll with no close time stays open', () => {
    expect(tallyPoll(poll({ closes_at: null }), null, NOW).closed).toBe(false)
  })
})

describe('voting', () => {
  it('single choice replaces (and a second tap clears), multi toggles', () => {
    expect(nextPicks(['a'], 'b', false)).toEqual(['b'])
    expect(nextPicks(['b'], 'b', false)).toEqual([])
    expect(nextPicks(['a'], 'b', true)).toEqual(['a', 'b'])
    expect(nextPicks(['a', 'b'], 'a', true)).toEqual(['b'])
  })
  it('withMyVotes replaces only the viewer\'s votes', () => {
    const next = withMyVotes(poll(), 'u2', ['c'])
    const t = tallyPoll(next, 'u2', NOW)
    expect(t.myOptionIds).toEqual(['c'])
    expect(t.options.map(o => o.count)).toEqual([1, 1, 1])
  })
})

describe('the composer', () => {
  const later = new Date(NOW + 86_400_000)
  it('explains what is missing', () => {
    expect(pollDraftProblem('', 'text', [], null, NOW)).toMatch(/question/)
    expect(pollDraftProblem('Q?', 'text', [{ label: 'x', startsAt: null }], null, NOW)).toMatch(/at least 2/)
    expect(pollDraftProblem('Q?', 'time', [{ label: '', startsAt: later }, { label: '', startsAt: null }], null, NOW)).toMatch(/date and time/)
    expect(pollDraftProblem('Q?', 'time', [{ label: '', startsAt: later }, { label: '', startsAt: new Date(NOW - 1) }], null, NOW)).toMatch(/future/)
    expect(pollDraftProblem('Q?', 'text', [{ label: 'a', startsAt: null }, { label: ' ', startsAt: null }], null, NOW)).toMatch(/every option/)
    expect(pollDraftProblem('Q?', 'text', [{ label: 'a', startsAt: null }, { label: 'b', startsAt: null }], new Date(NOW - 1), NOW)).toMatch(/close time/)
    expect(pollDraftProblem('Q?', 'text', [{ label: 'a', startsAt: null }, { label: 'b', startsAt: null }], later, NOW)).toBeNull()
  })
  it('labels time options in the club\'s zone and sends ISO starts', () => {
    const [o] = pollOptionsPayload('time', [{ label: '', startsAt: new Date('2026-11-20T01:00:00Z') }], 'America/Chicago')
    expect(o).toEqual({ label: 'Thu, Nov 19 · 7:00 PM', starts_at: '2026-11-20T01:00:00.000Z' })
    expect(pollOptionsPayload('text', [{ label: ' Sand ', startsAt: null }], 'America/Chicago')).toEqual([{ label: 'Sand' }])
  })
})

it('pollOf reads either embed shape', () => {
  const p = poll()
  expect(pollOf({ club_polls: p })).toBe(p)
  expect(pollOf({ club_polls: [p] })).toBe(p)
  expect(pollOf({ club_polls: [] })).toBeNull()
  expect(pollOf({})).toBeNull()
})

it('Host takes the poll\'s club, time and question, and only a future time', () => {
  expect(routes.host({ clubId: 'c1', date: '2026-11-20T01:00:00Z', title: 'Which night?', pollId: 'p1' }))
    .toBe('/host?clubId=c1&date=2026-11-20T01%3A00%3A00Z&title=Which%20night%3F&pollId=p1')
  expect(parsePrefillDate('2026-11-20T01:00:00Z', NOW)?.toISOString()).toBe('2026-11-20T01:00:00.000Z')
  expect(parsePrefillDate('2026-11-01T01:00:00Z', NOW)).toBeNull()
  expect(parsePrefillDate('nope', NOW)).toBeNull()
})
