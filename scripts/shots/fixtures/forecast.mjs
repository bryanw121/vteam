/**
 * Fake National Weather Service hourly forecast for `/api/forecast` (#165), so
 * the outdoor cards and the event page show their weather without the network.
 * Hours are relative to the fixture now. Two courts get a story: Pease Park
 * (Lunchtime Pepper, today at noon) is rained on, Volleyball Austin (Queens of
 * the Court) is hot; every other court is mild and sunny.
 */
import { TIME_ZONE } from './time.mjs'

const HOUR = 3600_000

const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit' })
/** Austin calendar date (YYYY-MM-DD) and hour at instant `ms`. */
function local(ms) {
  const p = Object.fromEntries(fmt.formatToParts(new Date(ms)).map(x => [x.type, x.value]))
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) }
}

/** Mild Austin day: coolest at 6 AM, warmest at 3 PM. */
function mildTemp(localHour) {
  return Math.round(66 + 10 * Math.cos(((localHour - 15) / 24) * 2 * Math.PI))
}

const COURTS = {
  // Pease Park: rain over the middle of today.
  '30.28,-97.75': (h, dayOffset) => (dayOffset === 0 && h >= 11 && h <= 14
    ? { pop: h === 12 ? 70 : 55, short: 'Rain Showers Likely', code: 'rain_showers', windMph: 12, tempDelta: -8, rh: 85 }
    : null),
  // Volleyball Austin: a heat wave.
  '30.38,-97.73': h => (h >= 11 && h <= 20 ? { tempDelta: 22, rh: 45, short: 'Sunny', code: 'hot' } : null),
}

/** `{ updatedAt, hours }` for a rounded court, 156 hours from the top of the current hour. */
export function buildForecast(now, lat, lng) {
  const key = `${Number(lat).toFixed(2)},${Number(lng).toFixed(2)}`
  const story = COURTS[key] ?? (() => null)
  const start = Math.floor(now.getTime() / HOUR) * HOUR
  const today = local(now.getTime()).date
  const hours = []
  for (let i = 0; i < 156; i++) {
    const t = start + i * HOUR
    const { date, hour: h } = local(t)
    const dayOffset = date === today ? 0 : 1
    const day = h >= 7 && h < 19
    const s = story(h, dayOffset) ?? {}
    hours.push({
      t: new Date(t).toISOString(),
      tempF: mildTemp(h) + (s.tempDelta ?? 0),
      pop: s.pop ?? 5,
      windMph: s.windMph ?? 6,
      short: s.short ?? (day ? 'Sunny' : 'Clear'),
      icon: `${day ? 'day' : 'night'}/${s.code ?? 'skc'}`,
      rh: s.rh ?? 50,
    })
  }
  return { updatedAt: new Date(now.getTime() - 20 * 60_000).toISOString(), hours }
}
