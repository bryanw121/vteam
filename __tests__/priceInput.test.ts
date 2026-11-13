import {
  formatPrice,
  formatPriceAmount,
  normalizePriceText,
  parsePrice,
  sanitizePriceInput,
} from '../utils'

/**
 * Replays a keystroke sequence through the controlled-input loop the way the
 * form actually runs it: the rendered value is always the sanitized text, and
 * each keystroke appends to what is currently displayed.
 *
 * The original bug only reproduces under this loop — the old handler stored a
 * `number`, so `String(parseFloat("5."))` fed `"5"` back into the field and the
 * decimal point disappeared as you typed.
 */
function typeInto(keys: string): string {
  let displayed = ''
  for (const k of keys) displayed = sanitizePriceInput(displayed + k)
  return displayed
}

describe('typing a decimal price', () => {
  it('lets a host type 5.50 (the reported bug)', () => {
    expect(typeInto('5.50')).toBe('5.50')
  })

  it('keeps the decimal point the moment it is typed', () => {
    // The exact keystroke where the old field failed: "5." rendered back "5".
    expect(typeInto('5.')).toBe('5.')
  })

  it('keeps a trailing zero', () => {
    expect(typeInto('2.50')).toBe('2.50')
    expect(typeInto('2.5')).toBe('2.5')
  })

  it('allows a leading decimal point', () => {
    expect(typeInto('.5')).toBe('.5')
    expect(typeInto('.50')).toBe('.50')
  })

  it.each([
    ['5', '5'],
    ['12.75', '12.75'],
    ['100', '100'],
    ['0.50', '0.50'],
    ['2.00', '2.00'],
  ])('types %s cleanly', (keys, expected) => {
    expect(typeInto(keys)).toBe(expected)
  })

  it('does not let the old round-trip reappear', () => {
    // Regression sentinel: parseFloat->String on each keystroke turns "5.50"
    // into "550" through the same loop.
    const broken = (keys: string) => {
      let displayed = ''
      for (const k of keys) {
        const trimmed = (displayed + k).replace(/[^0-9.]/g, '')
        if (trimmed === '' || trimmed === '.') { displayed = ''; continue }
        const n = Number.parseFloat(trimmed)
        displayed = Number.isNaN(n) ? '' : String(n)
      }
      return displayed
    }
    expect(broken('5.50')).toBe('550')
    expect(typeInto('5.50')).toBe('5.50')
  })
})

describe('sanitizePriceInput', () => {
  it('caps at two decimal places', () => {
    expect(sanitizePriceInput('5.555')).toBe('5.55')
  })

  it('collapses a second decimal point rather than silently truncating', () => {
    // parseFloat("1.2.3") returns 1.2 with no error — an event priced $1.20
    // and no indication anything was dropped.
    expect(sanitizePriceInput('1.2.3')).toBe('1.23')
  })

  it('strips currency symbols and separators from a paste', () => {
    expect(sanitizePriceInput('$5.50')).toBe('5.50')
    expect(sanitizePriceInput('5,50')).toBe('550')
    expect(sanitizePriceInput('  12.30  ')).toBe('12.30')
  })

  it('drops letters', () => {
    expect(sanitizePriceInput('abc')).toBe('')
    expect(sanitizePriceInput('12abc.50')).toBe('12.50')
  })

  it('bounds a runaway integer part', () => {
    expect(sanitizePriceInput('999999999999').length).toBeLessThanOrEqual(6)
  })

  it('is idempotent', () => {
    for (const v of ['5.50', '5.', '.5', '', '1.23', '100']) {
      expect(sanitizePriceInput(sanitizePriceInput(v))).toBe(sanitizePriceInput(v))
    }
  })
})

describe('parsePrice', () => {
  it.each([
    ['5.50', 5.5],
    ['0.50', 0.5],
    ['.5', 0.5],
    ['5.', 5],
    ['12.75', 12.75],
    ['100', 100],
  ])('parses %s to %s', (text, expected) => {
    expect(parsePrice(text)).toBe(expected)
  })

  it.each([['', null], ['.', null], ['abc', null], ['0', null], ['0.00', null]])(
    'treats %s as free (null)',
    (text, expected) => {
      expect(parsePrice(text as string)).toBe(expected)
    },
  )

  it('rounds to cents so float noise never reaches the DB', () => {
    expect(parsePrice('0.1')).toBe(0.1)
    expect(parsePrice('5.55')).toBe(5.55)
    expect(Number.isInteger((parsePrice('5.55') as number) * 100)).toBe(true)
  })
})

describe('normalizePriceText (on blur)', () => {
  it.each([
    ['5.5', '5.50'],
    ['.5', '0.50'],
    ['5.', '5.00'],
    ['5', '5.00'],
    ['', ''],
    ['0', ''],
  ])('normalizes %s to %s', (input, expected) => {
    expect(normalizePriceText(input)).toBe(expected)
  })

  it('round-trips: an edited event re-renders the same value', () => {
    const stored = parsePrice('5.50')
    expect(stored).toBe(5.5)
    expect((stored as number).toFixed(2)).toBe('5.50')
    expect(parsePrice((stored as number).toFixed(2))).toBe(5.5)
  })
})

describe('formatPrice (display)', () => {
  it.each([
    [5.5, '$5.50'],
    [0.5, '$0.50'],
    [5, '$5'],
    [12.75, '$12.75'],
    [null, 'Free'],
    [0, 'Free'],
    [undefined, 'Free'],
  ])('formats %s as %s', (price, expected) => {
    expect(formatPrice(price as number | null | undefined)).toBe(expected)
  })

  it('never renders a single-digit cents value', () => {
    // "$5.5" on a card is the display half of the same bug.
    expect(formatPrice(5.5)).not.toBe('$5.5')
  })

  it('formats a bare amount for payment links', () => {
    expect(formatPriceAmount(5.5)).toBe('5.50')
    expect(formatPriceAmount(5)).toBe('5')
  })
})

describe('form wiring', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { readFileSync } = require('fs')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { resolve } = require('path')
  const host: string = readFileSync(resolve(__dirname, '../app/(app)/host.tsx'), 'utf8')

  it('binds the input to raw text, not a parsed number', () => {
    const details: string = readFileSync(resolve(__dirname, '../components/host/DetailsSection.tsx'), 'utf8')
    expect(details).toMatch(/value=\{form\.priceText\}/)
    expect(details + host).not.toMatch(/setField\('price',/)
  })

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { emptyForm, eventColumns, formFromEvent } = require('../utils/hostForm') as typeof import('../utils/hostForm')

  it('parses once at the write boundary (utils/hostForm, used by create and edit)', () => {
    expect(eventColumns({ ...emptyForm(), priceText: '5.50' }, null).price).toBe(5.5)
    expect(host).not.toMatch(/parsePrice\(form\.priceText\)[^>]*price:/)
  })

  it('gates the Venmo handle on the parsed price, so a decimal price keeps its handle', () => {
    expect(eventColumns({ ...emptyForm(), priceText: '0.50', venmoHandle: 'ana' }, null).venmo_handle).toBe('ana')
    expect(eventColumns({ ...emptyForm(), priceText: '0', venmoHandle: 'ana' }, null).venmo_handle).toBeNull()
    expect(eventColumns({ ...emptyForm(), priceText: '', venmoHandle: 'ana' }, null).venmo_handle).toBeNull()
  })

  it('hydrates the edit form with two decimal places', () => {
    expect(formFromEvent({ title: 't', event_date: '2026-11-20T00:00:00Z', price: 5.5 } as never).priceText).toBe('5.50')
  })
})
