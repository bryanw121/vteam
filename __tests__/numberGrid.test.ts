import {
  BENCH_MAX, BENCH_START, emptyGrid, gridBoxes, gridFromRoster, gridIsEmpty, gridIssues, gridReady, gridToRoster,
  numbersIn, typeIntoBox, withBenchRoom,
} from '../lib/scoresheet/numberGrid'

describe('number grid', () => {
  test('starts with six court boxes, four bench boxes and two libero boxes', () => {
    const g = emptyGrid()
    expect(g.court).toHaveLength(6)
    expect(g.bench).toHaveLength(BENCH_START)
    expect(g.liberos).toHaveLength(2)
    expect(gridIsEmpty(g)).toBe(true)
    expect(gridBoxes(g)).toHaveLength(12)
  })

  test('a box keeps digits only, at most two', () => {
    const { team } = typeIntoBox(emptyGrid(), { part: 'court', index: 0 }, '#7a')
    expect(team.court[0]).toBe('7')
    expect(typeIntoBox(team, { part: 'court', index: 0 }, '123').team.court[0]).toBe('12')
  })

  test('pasting a lineup into position I fills the court in order', () => {
    const { team, filled } = typeIntoBox(emptyGrid(), { part: 'court', index: 0 }, '7 12, 3 9 21 4 99')
    expect(team.court).toEqual(['7', '12', '3', '9', '21', '4'])
    expect(filled).toBe(6)
  })

  test('the bench grows a box when its last box is filled, up to the limit', () => {
    let g = emptyGrid()
    for (let i = 0; i < BENCH_START; i++) g = typeIntoBox(g, { part: 'bench', index: i }, String(30 + i)).team
    expect(g.bench).toHaveLength(BENCH_START + 1)
    g = typeIntoBox(g, { part: 'bench', index: 0 }, Array.from({ length: 20 }, (_, i) => String(40 + i)).join(' ')).team
    expect(g.bench).toHaveLength(BENCH_MAX)
    expect(withBenchRoom(['1', '', '2'])).toEqual(['1', '2', '', ''])
  })

  test('reports empty starting spots and repeated numbers', () => {
    let g = typeIntoBox(emptyGrid(), { part: 'court', index: 0 }, '1 2 3 4 5').team
    g = typeIntoBox(g, { part: 'liberos', index: 0 }, '3').team
    expect(gridIssues(g)).toEqual({ missingCourt: 1, duplicates: [3] })
    expect(gridReady(g)).toBe(false)
    g = typeIntoBox(g, { part: 'court', index: 5 }, '6').team
    g = typeIntoBox(g, { part: 'liberos', index: 0 }, '10').team
    expect(gridReady(g)).toBe(true)
  })

  test('round-trips a roster with names, captain and liberos', () => {
    const court = [1, 2, 3, 4, 5, 6].map(n => ({ number: n, ...(n === 1 ? { name: 'Maya', captain: true } : {}) }))
    const bench = [{ number: 7, name: 'Nina' }, { number: 20, libero: true }, { number: 21, libero: true }, { number: 22, libero: true }]
    const g = gridFromRoster('Aces', court, bench)
    expect(g.liberos).toEqual(['20', '21'])
    expect(g.bench.filter(Boolean)).toEqual(['7', '22'])
    const r = gridToRoster(g)
    expect(r.court.map(p => p.number)).toEqual([1, 2, 3, 4, 5, 6])
    expect(r.court[0]).toEqual({ number: 1, name: 'Maya', captain: true })
    expect(r.bench).toEqual([{ number: 7, name: 'Nina' }, { number: 22 }, { number: 20, libero: true }, { number: 21, libero: true }])
  })

  test('finds numbers in any separators', () => {
    expect(numbersIn('#7, 12;3\n9')).toEqual(['7', '12', '3', '9'])
  })
})
