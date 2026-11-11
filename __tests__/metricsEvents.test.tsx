import { act, fireEvent, render, renderHook } from '@testing-library/react-native'
import { useOutsideSessionLink } from '../hooks/useOutsideSessionLink'
import { createMatch, matchStageProps, useScoreMatch } from '../hooks/useScoreMatch'
import { ExternalProgramCard } from '../components/ExternalProgramCard'
import { ANALYTICS_EVENTS } from '../constants/analytics'
import { exampleMatch } from '../lib/scoresheet/exampleMatch'
import type { ExternalProgram, ScoreEventInput } from '../types'

// Usage metrics part 3: the client events behind the Overview's outside links, shares, filters
// and Scorekeeper counts. Props carry kinds and organizer names only, never ids or URLs.

jest.mock('../lib/analytics', () => ({ track: jest.fn() }))
jest.mock('../lib/openExternalUrl', () => ({ openExternalUrl: jest.fn(async () => true) }))
jest.mock('../lib/scoresheet/storage', () => {
  const store = new Map<string, unknown>()
  return {
    saveMatch: jest.fn(async (doc: { id: string }) => { store.set(doc.id, doc); return doc }),
    loadMatch: jest.fn(async (id: string) => store.get(id) ?? null),
  }
})
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { track } = require('../lib/analytics') as { track: jest.Mock }
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { saveMatch } = require('../lib/scoresheet/storage') as { saveMatch: jest.Mock }

afterEach(() => track.mockClear())

describe('outside_link_opened', () => {
  const realFetch = global.fetch
  afterEach(() => { global.fetch = realFetch })

  it('records the venue (not the URL) when an outside session opens', async () => {
    global.fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({ status: 'scheduled' }) })) as unknown as typeof fetch
    const { result } = renderHook(() => useOutsideSessionLink({ id: 'x', signup_url: 'https://reclub.co/m/X', venue: 'Volleyworld' }))
    await act(async () => { await result.current.open() })
    expect(track).toHaveBeenCalledWith(ANALYTICS_EVENTS.outsideLinkOpened, { kind: 'session', org: 'Volleyworld' })
  })

  it('records the kind and organizer when an outside league or tournament card is tapped', () => {
    const program = {
      id: 'p1', kind: 'league', surface: 'indoor', region: 'austin', state: 'TX', series: null, org: 'ACES', title: 'Winter League',
      venue: null, city: 'Austin', address: null, format: null, divisions: [], starts_on: '2026-12-01', ends_on: null, weekdays: [],
      registration_opens: null, registration_deadline: null, waitlist_on: null, team_price: null, individual_price: null,
      price_note: null, price_changes_on: null, status: 'open', signup_url: 'https://aces.example/winter', source_url: null, checked_at: null,
    } as unknown as ExternalProgram
    const { getByTestId } = render(<ExternalProgramCard program={program} />)
    fireEvent.press(getByTestId('external-program-card'))
    expect(track).toHaveBeenCalledWith(ANALYTICS_EVENTS.outsideLinkOpened, { kind: 'league', org: 'ACES' })
  })
})

describe('scorekeeper_match', () => {
  it('counts the sets played', () => {
    expect(matchStageProps('finished', { setsWon: { A: 2, B: 1 } })).toEqual({ stage: 'finished', sets: 3 })
  })

  it('records a start when a match is created', async () => {
    await createMatch(exampleMatch().setup)
    expect(track).toHaveBeenCalledWith(ANALYTICS_EVENTS.scorekeeperMatch, { stage: 'started', sets: 0 })
  })

  it('records a finish once, when the last point ends the match', async () => {
    const full = exampleMatch()
    const last = full.log[full.log.length - 1]
    const { id: _id, at: _at, ...lastInput } = last
    await saveMatch({ ...full, id: 'finish-me', example: false, log: full.log.slice(0, -1), undo: [], redo: [] })
    const { result } = renderHook(() => useScoreMatch('finish-me'))
    await act(async () => {})
    expect(result.current.state?.over).toBe(false)

    act(() => result.current.add(lastInput as ScoreEventInput))
    expect(result.current.state?.over).toBe(true)
    const finished = track.mock.calls.filter(([name, props]) => name === ANALYTICS_EVENTS.scorekeeperMatch && props.stage === 'finished')
    expect(finished).toEqual([[ANALYTICS_EVENTS.scorekeeperMatch, { stage: 'finished', sets: result.current.state!.setsWon.A + result.current.state!.setsWon.B }]])

    // Editing the header, or undoing and redoing the last point, records nothing more.
    act(() => result.current.updateInfo({}))
    act(() => result.current.undo())
    expect(result.current.state?.over).toBe(false)
    act(() => result.current.redo())
    expect(result.current.state?.over).toBe(true)
    expect(track.mock.calls.filter(([, props]) => props.stage === 'finished')).toHaveLength(1)
  })

  it('never records the built-in example', async () => {
    const full = exampleMatch()
    await saveMatch({ ...full, id: 'example-copy', log: full.log.slice(0, -1), undo: [], redo: [] })
    const { id: _id, at: _at, ...lastInput } = full.log[full.log.length - 1]
    const { result } = renderHook(() => useScoreMatch('example-copy'))
    await act(async () => {})
    act(() => result.current.add(lastInput as ScoreEventInput))
    expect(track).not.toHaveBeenCalledWith(ANALYTICS_EVENTS.scorekeeperMatch, expect.anything())
  })
})
