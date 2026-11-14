import { parseRosterText, rosterToText, ROSTER_MAX } from '../lib/scoresheet/rosterText'

describe('parseRosterText', () => {
  it('takes a line of numbers as one player each, first six on court in order', () => {
    const r = parseRosterText('1 4 7 9 12 15 3 22')
    expect(r.court.map(p => p.number)).toEqual([1, 4, 7, 9, 12, 15])
    expect(r.bench.map(p => p.number)).toEqual([3, 22])
    expect(r.issues).toEqual([])
  })

  it('reads numbers with names, one per line, in either order', () => {
    const r = parseRosterText('7 Maya Chen\n#12 Ana\nKai 3\n\n  9  ')
    expect(r.players).toEqual([{ number: 7, name: 'Maya Chen' }, { number: 12, name: 'Ana' }, { number: 3, name: 'Kai' }, { number: 9 }])
  })

  it('splits a line on commas or semicolons', () => {
    expect(parseRosterText('7 Maya, 12 Ana; 3').players.map(p => p.number)).toEqual([7, 12, 3])
    expect(parseRosterText('1,2,3').players.map(p => p.number)).toEqual([1, 2, 3])
  })

  it('marks liberos and keeps them off the starting six', () => {
    const r = parseRosterText('5 Lee L\n1\n2\n3\n4\n6\n8\n10 (libero)')
    expect(r.court.map(p => p.number)).toEqual([1, 2, 3, 4, 6, 8])
    expect(r.bench).toEqual([{ number: 5, name: 'Lee', libero: true }, { number: 10, libero: true }])
  })

  it('keeps one captain', () => {
    const r = parseRosterText('9 Dana C\n4 (C)')
    expect(r.players).toEqual([{ number: 9, name: 'Dana', captain: true }, { number: 4 }])
  })

  it('reports lines without a number and duplicate numbers, and keeps the rest', () => {
    const r = parseRosterText('7 Maya\nPriya\n7 Again\n100')
    expect(r.players.map(p => p.number)).toEqual([7])
    expect(r.issues.map(i => [i.line, i.message])).toEqual([
      [2, 'No jersey number (0–99).'],
      [3, '#7 is already on this team.'],
      [4, 'No jersey number (0–99).'],
    ])
  })

  it('caps a team at the roster size', () => {
    const r = parseRosterText(Array.from({ length: ROSTER_MAX + 2 }, (_, i) => String(i)).join(' '))
    expect(r.players).toHaveLength(ROSTER_MAX)
    expect(r.issues).toHaveLength(2)
  })

  it('fills fewer than six spots when fewer are typed', () => {
    const r = parseRosterText('1 2 3')
    expect(r.court).toHaveLength(3)
    expect(r.bench).toEqual([])
  })

  it('round-trips a team through rosterToText', () => {
    const court = [{ number: 1, name: 'Maya' }, null, { number: 7 }]
    const bench = [{ number: 5, libero: true }, { number: 9, name: 'Dana', captain: true }]
    const text = rosterToText(court, bench)
    expect(text).toBe('1 Maya\n7\n5 L\n9 Dana C')
    expect(parseRosterText(text).players).toEqual([{ number: 1, name: 'Maya' }, { number: 7 }, { number: 5, libero: true }, { number: 9, name: 'Dana', captain: true }])
  })
})
