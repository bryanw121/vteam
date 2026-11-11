import type { UrlCodec } from '../types'

/**
 * View state in the URL: which tab, filter, day or search a screen shows, so a
 * copied or shared link opens the same view. Pure: screens use these through
 * `useUrlParam` (hooks/useUrlParam). Every value from a link is checked here and
 * anything unknown falls back to the screen's default, so a bad or old link
 * never errors. Defaults are left out of the URL, so a plain visit stays a plain URL.
 * Never put anything private or typed into a form in the URL.
 */

/** A param may arrive as an array (`?a=1&a=2`): keep the first. */
export function firstParam(raw: string | string[] | undefined | null): string | undefined {
  const v = Array.isArray(raw) ? raw[0] : raw
  return typeof v === 'string' ? v : undefined
}

/** One of a fixed list of words; the fallback is the default and stays out of the URL. */
export function oneOf<T extends string>(allowed: readonly T[], fallback: T): UrlCodec<T> {
  return {
    parse: raw => (allowed as readonly string[]).includes(raw ?? '') ? (raw as T) : fallback,
    format: v => (v === fallback ? undefined : v),
  }
}

/** One of a fixed list, or nothing (no chip picked). */
export function optionalOneOf<T extends string>(allowed: readonly T[]): UrlCodec<T | null> {
  return {
    parse: raw => (allowed as readonly string[]).includes(raw ?? '') ? (raw as T) : null,
    format: v => v ?? undefined,
  }
}

/** A short free-text value (a search box): trimmed of control characters, capped. Empty stays out. */
export function text(max = 80): UrlCodec<string> {
  return {
    parse: raw => (raw ?? '').replace(/[\u0000-\u001f\u007f]/g, '').slice(0, max),
    format: v => (v.trim() ? v.trim().slice(0, max) : undefined),
  }
}

/** `1` / `true` → on. Off stays out. */
export const flag: UrlCodec<boolean> = {
  parse: raw => raw === '1' || raw === 'true',
  format: v => (v ? '1' : undefined),
}

/** A real calendar day written `YYYY-MM-DD`, or null. */
export function parseIsoDay(raw: string | undefined): string | null {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null
  const [y, m, d] = raw.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? raw : null
}

/** A day the Events feed can open: a real day from today up to `maxDaysAhead` out; anything else is today (null). */
export function feedDay(raw: string | undefined, today: string, maxDaysAhead = 120): string | null {
  const day = parseIsoDay(raw)
  if (!day || day <= today) return null
  const ahead = (Date.parse(`${day}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000
  return ahead <= maxDaysAhead ? day : null
}

/** Tab labels → URL words: 'Overview' → 'overview'. */
export const tabSlug = (label: string) => label.toLowerCase().replace(/[^a-z0-9]+/g, '-')

/**
 * A screen's tabs by index. The first tab is the default. Words in the URL
 * (`?tab=people`); an index (`?tab=1`) still works for older links and
 * notifications that wrote numbers.
 */
export function tabIndexCodec(labels: readonly string[]): UrlCodec<number> {
  const slugs = labels.map(tabSlug)
  return {
    parse: raw => {
      if (!raw) return 0
      const byWord = slugs.indexOf(raw.toLowerCase())
      if (byWord >= 0) return byWord
      if (/^\d+$/.test(raw)) {
        const n = Number(raw)
        return n >= 0 && n < labels.length ? n : 0
      }
      return 0
    },
    format: i => (i > 0 && i < slugs.length ? slugs[i] : undefined),
  }
}

/** `{ a: 'x', b: undefined }` → `?a=x` (or '' when empty). Keys keep their order. */
export function queryString(values: Record<string, string | undefined | null>): string {
  const parts = Object.entries(values)
    .filter((e): e is [string, string] => typeof e[1] === 'string' && e[1] !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
  return parts.length ? `?${parts.join('&')}` : ''
}

/** Path plus the formatted values of each codec (values left undefined are skipped). */
export function withView(
  path: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  codecs: Readonly<Record<string, UrlCodec<any>>>,
  values: Readonly<Record<string, unknown>>,
): string {
  const out: Record<string, string | undefined> = {}
  for (const key of Object.keys(codecs)) {
    if (values[key] === undefined) continue
    out[key] = codecs[key].format(values[key])
  }
  return path + queryString(out)
}
