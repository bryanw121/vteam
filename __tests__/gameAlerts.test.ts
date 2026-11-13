import { DEFAULT_GAME_ALERTS } from '../constants/gameAlerts'
import { gameAlertSummary, parseGameAlerts, toggleGameAlertFilter } from '../utils/gameAlerts'

describe('parseGameAlerts', () => {
  it('reads the column default', () => {
    expect(parseGameAlerts({ clubs: true, hosts: false, surfaces: [], levels: [], times: [] })).toEqual(DEFAULT_GAME_ALERTS)
  })

  it('falls back to the defaults for anything missing or malformed', () => {
    expect(parseGameAlerts(null)).toEqual(DEFAULT_GAME_ALERTS)
    expect(parseGameAlerts([])).toEqual(DEFAULT_GAME_ALERTS)
    expect(parseGameAlerts({ clubs: 'yes', surfaces: 'sand' })).toEqual(DEFAULT_GAME_ALERTS)
  })

  it('keeps known values only, once each', () => {
    expect(parseGameAlerts({ hosts: true, surfaces: ['sand', 'lava', 'sand'], levels: ['bb', 'zz'], times: ['weekend', 'noon'] })).toEqual({
      clubs: true,
      hosts: true,
      surfaces: ['sand'],
      levels: ['bb'],
      times: ['weekend'],
    })
  })
})

describe('toggleGameAlertFilter', () => {
  it('adds and removes a chip without touching the other rows', () => {
    const on = toggleGameAlertFilter(DEFAULT_GAME_ALERTS, 'surfaces', 'sand')
    expect(on.surfaces).toEqual(['sand'])
    expect(on.times).toEqual([])
    const off = toggleGameAlertFilter(on, 'surfaces', 'sand')
    expect(off.surfaces).toEqual([])
    expect(DEFAULT_GAME_ALERTS.surfaces).toEqual([])
  })
})

describe('gameAlertSummary', () => {
  it('names the sources and the daily cap', () => {
    expect(gameAlertSummary(DEFAULT_GAME_ALERTS)).toBe('New games from your clubs, at most 3 a day.')
    expect(gameAlertSummary({ ...DEFAULT_GAME_ALERTS, hosts: true, times: ['weekend'] })).toBe(
      'New games from your clubs and hosts you play with that fit your filters, at most 3 a day.',
    )
    expect(gameAlertSummary({ ...DEFAULT_GAME_ALERTS, clubs: false })).toMatch(/^Off/)
  })
})
