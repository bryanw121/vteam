/**
 * Price parsing and display. No imports, so the Vercel functions in `api/`
 * (link previews, #130) can use it too. Re-exported from `utils/index`.
 */

/** Max digits after the decimal point in a price. USD — cents. */
const PRICE_DECIMALS = 2
/** Guards against a paste like "999999999999" producing nonsense. */
const PRICE_MAX_INTEGER_DIGITS = 6

/**
 * Clean a price field's raw text **without normalising it**.
 *
 * Deliberately returns a string and preserves in-progress input like `"5."` or
 * `"2.50"`. The price field used to hold a `number` and round-trip every
 * keystroke through `parseFloat` → `String`, which destroyed exactly those:
 * typing `5` `.` `5` `0` gave `5` → `5` (the dot vanished, because
 * `String(parseFloat("5."))` is `"5"`) → `55` → `550`. Trailing zeros were
 * unreachable for the same reason, so no host could enter $5.50.
 *
 * Also collapses multiple decimal points. `"1.2.3"` previously reached
 * `parseFloat`, which silently returns `1.2` — an event priced $1.20 with no
 * indication anything was dropped.
 */
export function sanitizePriceInput(raw: string): string {
  const stripped = raw.replace(/[^0-9.]/g, '')
  if (stripped === '') return ''

  const firstDot = stripped.indexOf('.')
  let intPart = firstDot === -1 ? stripped : stripped.slice(0, firstDot)
  let decPart = firstDot === -1 ? null : stripped.slice(firstDot + 1).replace(/\./g, '')

  // Trim a runaway integer part, but keep a lone "." usable as ".5".
  if (intPart.length > PRICE_MAX_INTEGER_DIGITS) intPart = intPart.slice(0, PRICE_MAX_INTEGER_DIGITS)
  if (decPart !== null) decPart = decPart.slice(0, PRICE_DECIMALS)

  return decPart === null ? intPart : `${intPart}.${decPart}`
}

/**
 * Price text → the number to persist. Empty or zero means a free event (null),
 * matching how the rest of the app tests for a paid event (`price > 0`).
 */
export function parsePrice(text: string): number | null {
  const cleaned = sanitizePriceInput(text)
  if (cleaned === '' || cleaned === '.') return null
  const n = Number.parseFloat(cleaned)
  if (!Number.isFinite(n) || n <= 0) return null
  // Round to cents so float noise never reaches the DB.
  return Math.round(n * 100) / 100
}

/** Normalise for display on blur: `5.5` → `5.50`, `.5` → `0.50`, `5.` → `5.00`. */
export function normalizePriceText(text: string): string {
  const n = parsePrice(text)
  return n === null ? '' : n.toFixed(PRICE_DECIMALS)
}

/**
 * Price for display. Whole dollars stay clean (`$5`), fractional amounts always
 * show both cents digits (`$5.50`, never `$5.5`).
 */
export function formatPrice(price: number | null | undefined): string {
  if (price == null || price <= 0) return 'Free'
  return `$${price % 1 === 0 ? price : price.toFixed(PRICE_DECIMALS)}`
}

/** Bare amount for a payment deep link — no currency symbol. */
export function formatPriceAmount(price: number): string {
  return price % 1 === 0 ? String(price) : price.toFixed(PRICE_DECIMALS)
}
