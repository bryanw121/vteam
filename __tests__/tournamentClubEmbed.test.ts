/**
 * Tournaments reach clubs two ways since #401: tournaments.club_id and the
 * tournament_clubs junction. PostgREST refuses a bare `clubs(...)` embed from
 * tournaments (PGRST201, HTTP 300), so every one must name the foreign key.
 */
import { readFileSync } from 'fs'
import { join } from 'path'

const FILES = ['hooks/useTournamentList.ts', 'hooks/feed/fallback.ts']

describe('tournament → clubs embeds', () => {
  it.each(FILES)('%s names tournaments_club_id_fkey', file => {
    const src = readFileSync(join(__dirname, '..', file), 'utf8')
    const tournamentSelects = src.split('\n').filter(l => /tournament/i.test(l) && /clubs\s*[(!]/.test(l))
    expect(tournamentSelects.length).toBeGreaterThan(0)
    for (const line of tournamentSelects) expect(line).not.toMatch(/clubs\s*\(/)
  })
})
