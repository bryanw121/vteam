/**
 * Fixture clock. Every fixture date is relative to one "now" so events are always
 * upcoming, and the same now is used for the before and after captures (the
 * browser clock is frozen to it too), so unchanged screens stay pixel-identical.
 */
export const TIME_ZONE = 'America/Chicago'

/** Minutes east of UTC that `zone` is at instant `date` (Chicago: -300 or -360). */
function offsetMinutes(date, zone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
      .formatToParts(date).map(p => [p.type, p.value]),
  )
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second)
  return Math.round((asUtc - date.getTime()) / 60000)
}

/** Local calendar date parts of `date` in `zone`. */
function localParts(date, zone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(date).map(p => [p.type, p.value]),
  )
  return { y: +parts.year, m: +parts.month, d: +parts.day }
}

/** The default frozen "now": 10:00 today in Austin. */
export function defaultNow(real = new Date()) {
  const { y, m, d } = localParts(real, TIME_ZONE)
  return wallToDate(y, m, d, 10, 0)
}

function wallToDate(y, m, d, hh, mm) {
  const guess = new Date(Date.UTC(y, m - 1, d, hh, mm))
  const off = offsetMinutes(guess, TIME_ZONE)
  const first = new Date(guess.getTime() - off * 60000)
  // Re-check across a DST edge.
  const off2 = offsetMinutes(first, TIME_ZONE)
  return off2 === off ? first : new Date(guess.getTime() - off2 * 60000)
}

/** Clock helpers bound to one now. */
export function clock(now) {
  const base = localParts(now, TIME_ZONE)
  /** Austin wall time `dayOffset` days from today at hh:mm, as a Date. */
  const at = (dayOffset, hh = 0, mm = 0) => {
    const day = new Date(Date.UTC(base.y, base.m - 1, base.d + dayOffset))
    return wallToDate(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), hh, mm)
  }
  return {
    now,
    at,
    /** timestamptz column value. */
    iso: (dayOffset, hh, mm) => at(dayOffset, hh, mm).toISOString(),
    /** `timestamp without time zone` (events.event_date): UTC wall time, no zone, like PostgREST returns it. */
    naive: (dayOffset, hh, mm) => at(dayOffset, hh, mm).toISOString().replace(/\.\d{3}Z$/, ''),
    /** `date` column. */
    date: dayOffset => at(dayOffset, 12).toISOString().slice(0, 10),
    /** Minutes before now, as timestamptz. */
    ago: minutes => new Date(now.getTime() - minutes * 60000).toISOString(),
  }
}
