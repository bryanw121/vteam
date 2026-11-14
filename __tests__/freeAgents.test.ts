import { draftColumns, draftFrom, freeAgentStripText, takesFreeAgents, visibleFreeAgents, FREE_AGENT_NOTE_MAX } from '../utils/freeAgents'
import { routes } from '../utils/routes'
import type { FreeAgent } from '../types'

const agent = (user_id: string, over: Partial<FreeAgent> = {}): FreeAgent => ({
  id: `id-${user_id}`, program_id: 'p1', user_id, want: 'team', positions: [], note: null, program_title: 'Turkey Spikes',
  expires_on: '2026-11-20', created_at: '2026-11-14T10:00:00Z', updated_at: '2026-11-14T10:00:00Z', profiles: null, ...over,
})

describe('Find a team (#304)', () => {
  it('opens for tournaments and leagues until their last day', () => {
    expect(takesFreeAgents({ kind: 'tournament', starts_on: '2026-11-20', ends_on: '2026-11-21' }, '2026-11-21')).toBe(true)
    expect(takesFreeAgents({ kind: 'tournament', starts_on: '2026-11-20', ends_on: '2026-11-21' }, '2026-11-22')).toBe(false)
    expect(takesFreeAgents({ kind: 'league', starts_on: '2026-12-01', ends_on: null }, '2026-11-14')).toBe(true)
    expect(takesFreeAgents({ kind: 'clinic' as 'league', starts_on: null, ends_on: null }, '2026-11-14')).toBe(false)
  })

  it('says how many are looking, or invites the first', () => {
    expect(freeAgentStripText(null)).toBe('Need a team or players?')
    expect(freeAgentStripText(0)).toBe('Need a team or players?')
    expect(freeAgentStripText(3)).toBe('3 looking for a team')
  })

  it('starts a first entry from the profile positions, an edit from the row', () => {
    expect(draftFrom(null, ['setter', 'nonsense'])).toEqual({ want: 'team', positions: ['setter'], note: '' })
    expect(draftFrom(agent('u1', { want: 'partner', positions: ['libero'], note: 'Sunday' }), ['setter'])).toEqual({ want: 'partner', positions: ['libero'], note: 'Sunday' })
  })

  it('saves a trimmed, capped note and unique positions', () => {
    expect(draftColumns({ want: 'players', positions: ['setter', 'setter'], note: '  ' })).toEqual({ want: 'players', positions: ['setter'], note: null })
    expect(draftColumns({ want: 'team', positions: [], note: 'x'.repeat(300) }).note).toHaveLength(FREE_AGENT_NOTE_MAX)
  })

  it('filters by position and want, the viewer first, then newest', () => {
    const list = [
      agent('old', { positions: ['setter'], created_at: '2026-11-10T00:00:00Z' }),
      agent('new', { positions: ['setter'], want: 'partner', created_at: '2026-11-13T00:00:00Z' }),
      agent('me', { positions: ['libero'], created_at: '2026-11-01T00:00:00Z' }),
    ]
    expect(visibleFreeAgents(list, { pos: 'any', want: 'any' }, 'me').map(a => a.user_id)).toEqual(['me', 'new', 'old'])
    expect(visibleFreeAgents(list, { pos: 'setter', want: 'any' }, 'me').map(a => a.user_id)).toEqual(['new', 'old'])
    expect(visibleFreeAgents(list, { pos: 'setter', want: 'partner' }, null).map(a => a.user_id)).toEqual(['new'])
  })

  it('links carry the filters, and defaults stay out of the URL', () => {
    expect(routes.findATeam('shots program')).toBe('/find-a-team/shots%20program')
    expect(routes.findATeam('p1', { pos: 'setter', want: 'any' })).toBe('/find-a-team/p1?pos=setter')
  })
})
