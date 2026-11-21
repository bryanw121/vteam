/**
 * Date and time labels through cached formatters (#342).
 *
 * `date.toLocaleDateString('en-US', { … })` builds a new ICU formatter on every
 * call: about 0.4 ms on a 4× slower phone, against 0.008 ms for `format` on a
 * formatter that already exists. The Events first paint made 30–141 such calls
 * (43–124 ms). These helpers keep one `Intl.DateTimeFormat` per locale and
 * options and give byte-identical output to the `toLocale*String` they replace:
 * each applies the same default fields as its `Date.prototype` counterpart
 * (ECMA-402 ToDateTimeOptions), so `formatTime(d, { hour: 'numeric' })` is
 * `d.toLocaleTimeString('en-US', { hour: 'numeric' })`.
 *
 * Every date label goes through here; `__tests__/noAdHocDateFormat.test.ts`
 * fails on a new `toLocaleDateString` / `toLocaleTimeString` / `new
 * Intl.DateTimeFormat` elsewhere. Pure, no React Native: `api/` can import it.
 */

type Options = Intl.DateTimeFormatOptions
/** `'en-US'` by default; `[]` (or undefined) is the device's locale, like `toLocale*String([], …)`. */
type Locale = string | readonly string[] | undefined

const DATE_FIELDS = ['weekday', 'year', 'month', 'day'] as const
const TIME_FIELDS = ['dayPeriod', 'hour', 'minute', 'second', 'fractionalSecondDigits'] as const

const cache = new Map<string, Intl.DateTimeFormat>()

/**
 * The device zone is fixed into a formatter when it is made, so formatters for
 * the device's zone are kept per UTC offset: a phone that changes zone mid-visit
 * gets new ones. (Explicit `timeZone` options are part of the key already.)
 */
function zoneKey(options: Options): string {
  return options.timeZone ? '' : String(new Date().getTimezoneOffset())
}

function has(options: Options, fields: readonly string[]): boolean {
  return fields.some(f => (options as Record<string, unknown>)[f] !== undefined)
}

function withDefaults(options: Options, required: 'date' | 'time' | 'any', defaults: 'date' | 'time' | 'all'): Options {
  if (options.dateStyle !== undefined || options.timeStyle !== undefined) return options
  let needDefaults = true
  if ((required === 'date' || required === 'any') && has(options, DATE_FIELDS)) needDefaults = false
  if ((required === 'time' || required === 'any') && has(options, TIME_FIELDS)) needDefaults = false
  if (!needDefaults) return options
  const out: Options = { ...options }
  if (defaults === 'date' || defaults === 'all') Object.assign(out, { year: 'numeric', month: 'numeric', day: 'numeric' })
  if (defaults === 'time' || defaults === 'all') Object.assign(out, { hour: 'numeric', minute: 'numeric', second: 'numeric' })
  return out
}

function formatter(locale: Locale, options: Options): Intl.DateTimeFormat {
  const loc = locale === undefined ? undefined : typeof locale === 'string' ? locale : locale.length ? [...locale] : undefined
  const key = `${loc === undefined ? '' : String(loc)}|${zoneKey(options)}|${JSON.stringify(options)}`
  let f = cache.get(key)
  if (!f) {
    f = new Intl.DateTimeFormat(loc, options)
    cache.set(key, f)
  }
  return f
}

/** Same as `date.toLocaleDateString(locale, options)`. */
export function formatDate(date: Date | number, options: Options = {}, locale: Locale = 'en-US'): string {
  return formatter(locale, withDefaults(options, 'date', 'date')).format(date)
}

/** Same as `date.toLocaleTimeString(locale, options)`. */
export function formatTime(date: Date | number, options: Options = {}, locale: Locale = 'en-US'): string {
  return formatter(locale, withDefaults(options, 'time', 'time')).format(date)
}

/** Same as `date.toLocaleString(locale, options)`. */
export function formatDateTime(date: Date | number, options: Options = {}, locale: Locale = 'en-US'): string {
  return formatter(locale, withDefaults(options, 'any', 'all')).format(date)
}

/** `new Intl.DateTimeFormat(locale, options).formatToParts(date)`, with the formatter kept. */
export function formatDateParts(date: Date | number, options: Options, locale: Locale = 'en-US'): Intl.DateTimeFormatPart[] {
  return formatter(locale, options).formatToParts(date)
}

/** `new Intl.DateTimeFormat(locale, options).format(date)`, with the formatter kept. */
export function formatWith(date: Date | number, options: Options, locale: Locale = 'en-US'): string {
  return formatter(locale, options).format(date)
}

/** The device's IANA time zone (one formatter, made once). */
export function deviceTimeZone(): string {
  return formatter(undefined, {}).resolvedOptions().timeZone
}

/** Test-only. */
export function __resetDateFormatCache(): void {
  cache.clear()
}
