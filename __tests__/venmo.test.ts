import { cleanVenmoHandle, formatVenmoDate, venmoNote, venmoPayLinks } from '../utils/venmo'

const TZ = 'America/Chicago'

describe('venmoNote', () => {
  it('builds a short, readable memo: title · day · vteam', () => {
    // 2026-11-01 18:00 UTC = Sun Nov 1, 1pm in Austin
    expect(venmoNote('Open Play', '2026-11-01T18:00:00', TZ)).toBe('Open Play · Sun, Nov 1 · vteam')
  })

  it('reads a suffix-less Supabase timestamp as UTC, so a late game keeps its local day', () => {
    // 02:00 UTC on Nov 2 is still the evening of Nov 1 in Austin
    expect(formatVenmoDate('2026-11-02T02:00:00', TZ)).toBe('Sun, Nov 1')
    expect(formatVenmoDate('2026-11-02T02:00:00+00:00', TZ)).toBe('Sun, Nov 1')
    expect(formatVenmoDate('2026-11-01T20:00:00-05:00', TZ)).toBe('Sun, Nov 1')
  })

  it('collapses whitespace and trims long titles so the date stays visible', () => {
    const note = venmoNote('  Saturday   night\nmega   open play at the big gym downtown  ', '2026-11-01T18:00:00', TZ)
    expect(note).toBe('Saturday night mega open play at the bi… · Sun, Nov 1 · vteam')
  })

  it('skips an unparseable date instead of printing "Invalid Date"', () => {
    expect(venmoNote('Open Play', 'not a date', TZ)).toBe('Open Play · vteam')
  })
})

describe('venmoPayLinks', () => {
  const note = 'Open Play · Sun, Nov 1 · vteam'

  it('percent-encodes the memo (no "+" for spaces) in both links', () => {
    const { app, web } = venmoPayLinks('bryan-w', '10', note)
    const encoded = 'Open%20Play%20%C2%B7%20Sun%2C%20Nov%201%20%C2%B7%20vteam'
    expect(app).toBe(`venmo://paycharge?txn=pay&recipients=bryan-w&amount=10&note=${encoded}`)
    expect(web).toBe(`https://account.venmo.com/pay?txn=pay&recipients=bryan-w&amount=10&note=${encoded}`)
    expect(app).not.toContain('+')
    expect(web).not.toContain('+')
  })

  it('round-trips: decoding the note gives back the exact memo', () => {
    const { web } = venmoPayLinks('bryan-w', '7.50', note)
    const params = new URL(web).searchParams
    expect(params.get('note')).toBe(note)
    expect(params.get('amount')).toBe('7.50')
    expect(params.get('recipients')).toBe('bryan-w')
  })

  it('encodes a literal "+" or "&" in a title so it cannot break the query', () => {
    const { web } = venmoPayLinks('h', '5', 'A+B & C')
    expect(web).toContain('note=A%2BB%20%26%20C')
    expect(new URL(web).searchParams.get('note')).toBe('A+B & C')
  })

  it('strips a leading @ and spaces from the handle', () => {
    expect(cleanVenmoHandle('  @@bryan-w ')).toBe('bryan-w')
    expect(venmoPayLinks('@bryan-w', '5', 'x').app).toContain('recipients=bryan-w&')
  })
})
