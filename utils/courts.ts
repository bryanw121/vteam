import { COURT_GRID_START_MIN, COURT_MIN_FREE_MIN, COURTS_OLD_AFTER_MS } from '../constants/schelagg'
import type {
  AustinNow, CourtsData, CourtsFacility, CourtsVenue, DayOption, FacilityDay, HHMMRange, MinuteRange,
} from '../types'

/**
 * Pure helpers for the "Book a court" screen. Court data from Schelagg is in
 * Austin local time (America/Chicago) as "HH:MM" strings; everything here works
 * in minutes after Austin midnight and YYYY-MM-DD Austin dates, so the screen
 * reads the same whatever time zone the device is in.
 */

export const AUSTIN_TZ = 'America/Chicago'
const DAY_MIN = 24 * 60

/** "07:30" → 450; "24:00" → 1440. NaN for anything else. */
export function toMin(hhmm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm ?? '')
  if (!m) return NaN
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 24 || min > 59 || (h === 24 && min > 0)) return NaN
  return h * 60 + min
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Today's date and the minute of the day in Austin. Falls back to device time if the engine lacks time zones. */
export function austinNow(now: Date = new Date()): AustinNow {
  try {
    const text = new Intl.DateTimeFormat('en-US', {
      timeZone: AUSTIN_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(now)
    // "10/25/2026, 14:05" (some engines print "24:05" just after midnight)
    const m = /(\d{2})\/(\d{2})\/(\d{4}),?\s+(\d{1,2}):(\d{2})/.exec(text)
    if (m) return { iso: `${m[3]}-${m[1]}-${m[2]}`, minutes: (Number(m[4]) % 24) * 60 + Number(m[5]) }
  } catch { /* no Intl time zone support */ }
  return {
    iso: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    minutes: now.getHours() * 60 + now.getMinutes(),
  }
}

/** UTC offset (minutes) of `timeZone` at an instant, e.g. -300 for Austin in CDT. */
function offsetMinutes(instant: Date, timeZone: string): number {
  const text = new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(instant)
  const m = /(\d{2})\/(\d{2})\/(\d{4}),?\s+(\d{1,2}):(\d{2})/.exec(text)
  if (!m) throw new Error('unexpected date format')
  const asUtc = Date.UTC(Number(m[3]), Number(m[1]) - 1, Number(m[2]), Number(m[4]) % 24, Number(m[5]))
  return Math.round((asUtc - instant.getTime()) / 60000)
}

/**
 * "2026-10-25" + "20:30" local to `timeZone` (default Austin) → ISO instant;
 * "24:00" rolls to the next day. Null for malformed input or no time zone support.
 */
export function zonedToIso(dateIso: string, hhmm: string, timeZone: string = AUSTIN_TZ): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso ?? '')) return null
  const minutes = toMin(hhmm)
  if (!Number.isFinite(minutes)) return null
  const date = minutes >= DAY_MIN ? addDays(dateIso, 1) : dateIso
  const [y, mo, d] = date.split('-').map(Number)
  const naive = Date.UTC(y, mo - 1, d, Math.floor((minutes % DAY_MIN) / 60), minutes % 60)
  try {
    // Two passes handle a DST boundary (offset taken at the guessed instant).
    let offset = offsetMinutes(new Date(naive), timeZone)
    offset = offsetMinutes(new Date(naive - offset * 60000), timeZone)
    return new Date(naive - offset * 60000).toISOString()
  } catch {
    return null
  }
}

/** YYYY-MM-DD plus n days. */
export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

/** Day of the week for a YYYY-MM-DD date, 0 = Sunday. */
export function dowOf(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

/** The day strip: `count` days starting today (Austin). */
export function dayOptions(todayIso: string, count: number): DayOption[] {
  return Array.from({ length: count }, (_, i) => {
    const iso = addDays(todayIso, i)
    return { iso, dow: dowOf(iso), isToday: i === 0 }
  })
}

/** The selected day if it is still on the strip (it rolls over at midnight), else today. */
export function pickDay(selected: string | null, options: DayOption[]): string {
  return selected && options.some(o => o.iso === selected) ? selected : options[0]?.iso ?? ''
}

const DOW_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "Mon", "26" for the strip; "Mon, Oct 26" for headings. */
export function dayParts(iso: string): { dow: string; day: number; long: string } {
  const [, m, d] = iso.split('-').map(Number)
  const dow = DOW_SHORT[dowOf(iso)]
  return { dow, day: d, long: `${dow}, ${MONTH_SHORT[m - 1]} ${d}` }
}

/**
 * The venue's booking page opened on `iso` (YYYY-MM-DD) when Schelagg publishes a
 * per-day link for it (`calendarDay`), else its plain booking page. The day link
 * must stay on the calendar's own https host; anything else falls back.
 */
export function venueCalendarUrl(venue: Pick<CourtsVenue, 'calendar' | 'calendarDay'>, iso: string): string {
  if (!venue.calendarDay || !/^\d{4}-\d{2}-\d{2}$/.test(iso) || !venue.calendarDay.includes('{date}')) return venue.calendar
  const url = venue.calendarDay.split('{date}').join(iso)
  try {
    const day = new URL(url)
    const base = new URL(venue.calendar)
    if (day.protocol !== 'https:' || day.host !== base.host) return venue.calendar
  } catch {
    return venue.calendar
  }
  return url
}

/** Opening hours as minutes. A close of "00:00" or before the open means midnight. */
export function openingMinutes(hours: HHMMRange | null | undefined): MinuteRange | null {
  if (!hours) return null
  const open = toMin(hours[0])
  let close = toMin(hours[1])
  if (!Number.isFinite(open)) return null
  if (!Number.isFinite(close) || close <= open) close = DAY_MIN
  return [open, close]
}

/** Booked "HH:MM" blocks → sorted minute ranges; an end at or before the start runs to midnight. */
export function bookedMinutes(blocks: HHMMRange[] | undefined): MinuteRange[] {
  return (blocks ?? [])
    .map(([s, e]): MinuteRange => {
      const start = toMin(s)
      let end = toMin(e)
      if (!Number.isFinite(end) || end <= start) end = DAY_MIN
      return [start, end]
    })
    .filter(([s]) => Number.isFinite(s))
    .sort((a, b) => a[0] - b[0])
}

/** Free time between `open` and `close` around the booked blocks. */
export function freeWindows(booked: MinuteRange[], open: number, close: number): MinuteRange[] {
  const out: MinuteRange[] = []
  let cur = open
  for (const [a, b] of [...booked].sort((x, y) => x[0] - y[0])) {
    if (a > cur) out.push([cur, Math.min(a, close)])
    cur = Math.max(cur, b)
    if (cur >= close) break
  }
  if (cur < close) out.push([cur, close])
  return out.filter(([a, b]) => b > a)
}

/** Merge several lists of ranges into one sorted, non-overlapping list. */
export function unionRanges(lists: MinuteRange[][]): MinuteRange[] {
  const all = lists.flat().map(([a, b]): MinuteRange => [a, b]).sort((x, y) => x[0] - y[0])
  const out: MinuteRange[] = []
  for (const [a, b] of all) {
    const last = out[out.length - 1]
    if (last && a <= last[1]) last[1] = Math.max(last[1], b)
    else out.push([a, b])
  }
  return out
}

/** Drop time before `fromMin` (today: what has already gone by). */
export function clipFrom(ranges: MinuteRange[], fromMin: number): MinuteRange[] {
  return ranges
    .filter(([, b]) => b > fromMin)
    .map(([a, b]): MinuteRange => [Math.max(a, fromMin), b])
}

/** 450 → "7:30am"; 1440 → "12am". `meridiem: false` leaves off am/pm. */
export function formatClock(min: number, meridiem = true): string {
  const h24 = Math.floor(min / 60) % 24
  const m = min % 60
  const h = h24 % 12 || 12
  return `${h}${m ? `:${pad(m)}` : ''}${meridiem ? (h24 < 12 ? 'am' : 'pm') : ''}`
}

const isAm = (min: number) => Math.floor(min / 60) % 24 < 12

/** [420, 450] → "7–7:30am"; [1080, 1440] → "6pm–12am"; [690, 780] → "11:30am–1pm". */
export function formatRange([a, b]: MinuteRange): string {
  // Drop the start's am/pm only when both ends share it; a range ending at midnight always keeps both ("9am–12am").
  const sameHalf = b < DAY_MIN && isAm(a) === isAm(b)
  return `${formatClock(a, !sameHalf)}–${formatClock(b)}`
}

/** One line per facility: "Free 7–7:30am, 12:30–1pm, 6pm–12am". `nowMin` marks a window that starts now. */
export function formatFreeSummary(ranges: MinuteRange[], nowMin: number | null = null): string {
  if (!ranges.length) return 'Fully booked'
  return `Free ${ranges.map(r => (nowMin !== null && r[0] === nowMin ? `now–${formatClock(r[1])}` : formatRange(r))).join(', ')}`
}

/** "Leander · $50/hr" → { city: "Leander", price: "$50/hr" }. Any " · " part with a "$" is the price. */
export function splitCityPrice(text: string | null | undefined): { city: string; price: string | null } {
  const parts = (text ?? '').split('·').map(p => p.trim()).filter(Boolean)
  const priceIndex = parts.findIndex(p => p.includes('$'))
  if (priceIndex < 0) return { city: parts.join(' · '), price: null }
  return { city: parts.filter((_, i) => i !== priceIndex).join(' · '), price: parts[priceIndex] }
}

/** "HP Court 1" → "Court 1", "Court #3" → "Court 3", "CO Court 5" → "Court 5". */
export function courtLabel(name: string): string {
  return name.replace(/^(HP|CO)\s+/, '').replace('Court #', 'Court ')
}

/** Whether the response covers a date (it starts at `from` and runs `days` days). */
export function coversDate(data: Pick<CourtsData, 'from' | 'days'>, iso: string): boolean {
  return iso >= data.from && iso <= addDays(data.from, Math.max(1, data.days) - 1)
}

function facilityDay(
  data: CourtsData, venue: CourtsVenue, facility: CourtsFacility, iso: string, now: AustinNow,
): FacilityDay {
  const { city, price } = splitCityPrice(facility.city)
  const hours = openingMinutes(venue.hours?.[dowOf(iso)])
  const covered = coversDate(data, iso)
  const [openMin, closeMin] = hours ?? [0, 0]
  const lanes = (facility.courts ?? []).map(court => {
    const booked = bookedMinutes(court.days?.[iso])
    return {
      name: court.name,
      label: courtLabel(court.name),
      booked,
      free: hours && covered ? freeWindows(booked, openMin, closeMin) : [],
    }
  })
  let freeSummary = unionRanges(lanes.map(l => l.free))
  if (iso === now.iso) freeSummary = clipFrom(freeSummary, now.minutes)
  freeSummary = freeSummary.filter(([a, b]) => b - a >= COURT_MIN_FREE_MIN)
  return {
    key: `${venue.id}:${facility.id}`,
    facility, venue, city, price,
    open: !!hours, openMin, closeMin, covered, lanes, freeSummary,
  }
}

/** Every facility on `iso`, optionally only one surface, in the order Schelagg lists them. */
export function facilityDays(data: CourtsData, iso: string, now: AustinNow, surface: string = 'any'): FacilityDay[] {
  return data.venues.flatMap(venue =>
    (venue.facilities ?? [])
      .filter(f => surface === 'any' || f.surface === surface)
      .map(f => facilityDay(data, venue, f, iso, now)),
  )
}

/** Hour grid span for a day: 6am (or the earliest opening, on the hour) to midnight. */
export function gridSpan(days: FacilityDay[]): MinuteRange {
  const opens = days.filter(d => d.open).map(d => Math.floor(d.openMin / 60) * 60)
  return [Math.min(COURT_GRID_START_MIN, ...opens), DAY_MIN]
}

/** Hour ticks for the grid axis, every `step` hours. */
export function gridTicks([start, end]: MinuteRange, stepHours = 3): number[] {
  const ticks: number[] = []
  for (let t = Math.ceil(start / 60) * 60; t <= end; t += stepHours * 60) ticks.push(t)
  return ticks
}

/** Screen-reader description of one court's day. */
export function describeLane(label: string, booked: MinuteRange[], free: MinuteRange[]): string {
  const b = booked.length ? `booked ${booked.map(formatRange).join(', ')}` : 'no bookings'
  const f = free.length ? `free ${free.map(formatRange).join(', ')}` : 'no free time'
  return `${label}: ${b}; ${f}`
}

/** Age of the court data in ms: Infinity if the timestamp is missing, 0 if it is in the future. */
export function courtsAgeMs(fetchedAt: string | null | undefined, nowMs: number = Date.now()): number {
  const t = Date.parse(fetchedAt ?? '')
  return Number.isFinite(t) ? Math.max(0, nowMs - t) : Infinity
}

export function isCourtsOld(fetchedAt: string | null | undefined, nowMs: number = Date.now()): boolean {
  return courtsAgeMs(fetchedAt, nowMs) > COURTS_OLD_AFTER_MS
}

/** "just now", "12 min ago", "3 h ago", "2 days ago". */
export function formatAge(ms: number): string {
  if (!Number.isFinite(ms)) return 'at an unknown time'
  const min = Math.round(ms / 60_000)
  if (min < 2) return 'just now'
  if (min < 60) return `${min} min ago`
  const h = Math.round(min / 60)
  if (h < 48) return `${h} h ago`
  return `${Math.round(h / 24)} days ago`
}
