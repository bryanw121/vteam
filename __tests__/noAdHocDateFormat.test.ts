import { readFileSync, readdirSync, statSync } from 'fs'
import { join, resolve } from 'path'

// #342: `toLocaleDateString('en-US', { … })` builds a new formatter on every
// call (~0.4 ms on a slow phone, against ~0.008 ms for a kept one); the Events
// first paint spent 43–124 ms on them. Date labels go through utils/dateFormat
// (formatDate / formatTime / formatDateTime / formatWith / formatDateParts),
// which keeps one formatter per locale and options with the same output.
const ROOT = resolve(__dirname, '..')
const ALLOWED = new Set(['utils/dateFormat.ts'])

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sources(path)
    return /\.tsx?$/.test(name) ? [path] : []
  })
}

/** A per-call date formatter: toLocaleDateString/TimeString, Intl.DateTimeFormat, or toLocaleString with a date's options. */
export function formatsDateAdHoc(src: string): boolean {
  return /\.toLocale(Date|Time)String\(/.test(src)
    || /\bIntl\.DateTimeFormat\s*\(/.test(src)
    || /\.toLocaleString\(\s*(\)|\[\]|'[^']*'\s*,\s*\{|undefined\s*,)/.test(src)
}

const files = ['app', 'components', 'hooks', 'utils', 'lib', 'contexts', 'constants', 'api']
  .flatMap(dir => sources(join(ROOT, dir)))
  .map(file => file.slice(ROOT.length + 1))
  .filter(file => !ALLOWED.has(file) && formatsDateAdHoc(readFileSync(join(ROOT, file), 'utf8')))

describe('no ad-hoc date formatters (#342)', () => {
  it('spots each way of building one', () => {
    expect(formatsDateAdHoc("d.toLocaleDateString('en-US', { month: 'short' })")).toBe(true)
    expect(formatsDateAdHoc('d.toLocaleTimeString([], { hour: "numeric" })')).toBe(true)
    expect(formatsDateAdHoc("new Intl.DateTimeFormat('en-US', {})")).toBe(true)
    expect(formatsDateAdHoc('Intl.DateTimeFormat().resolvedOptions().timeZone')).toBe(true)
    expect(formatsDateAdHoc("d.toLocaleString('en-US', { hour: 'numeric' })")).toBe(true)
    expect(formatsDateAdHoc('new Date(x).toLocaleString()')).toBe(true)
    expect(formatsDateAdHoc("count.toLocaleString('en-US')")).toBe(false)
    expect(formatsDateAdHoc("formatDate(d, { month: 'short' })")).toBe(false)
  })

  it('date labels go through utils/dateFormat', () => {
    expect(files).toEqual([])
  })
})
