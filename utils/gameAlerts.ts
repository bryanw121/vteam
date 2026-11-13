import { DEFAULT_GAME_ALERTS, GAME_ALERTS_PER_DAY, GAME_ALERT_LEVELS, GAME_ALERT_SURFACES, GAME_ALERT_TIME_BUCKETS } from '../constants/gameAlerts'
import type { GameAlertFilterKey, GameAlertPrefs, GameAlertSurface, GameAlertTime } from '../types'

const SURFACE_KEYS = new Set<string>(GAME_ALERT_SURFACES.map(s => s.key))
const TIME_KEYS = new Set<string>(GAME_ALERT_TIME_BUCKETS.map(t => t.key))
const LEVEL_KEYS = new Set<string>(GAME_ALERT_LEVELS.map(l => l.key))

function pick<T extends string>(raw: unknown, allowed: Set<string>): T[] {
  if (!Array.isArray(raw)) return []
  return [...new Set(raw.filter((v): v is T => typeof v === 'string' && allowed.has(v)))]
}

/** `user_settings.game_alerts` as stored (any jsonb) → prefs; anything unknown falls back to the default. */
export function parseGameAlerts(raw: unknown): GameAlertPrefs {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
  return {
    clubs: typeof o.clubs === 'boolean' ? o.clubs : DEFAULT_GAME_ALERTS.clubs,
    hosts: typeof o.hosts === 'boolean' ? o.hosts : DEFAULT_GAME_ALERTS.hosts,
    surfaces: pick<GameAlertSurface>(o.surfaces, SURFACE_KEYS),
    levels: pick<string>(o.levels, LEVEL_KEYS),
    times: pick<GameAlertTime>(o.times, TIME_KEYS),
  }
}

/** Turn one filter chip on or off (no chips in a row = any). */
export function toggleGameAlertFilter(prefs: GameAlertPrefs, key: GameAlertFilterKey, value: string): GameAlertPrefs {
  const list = prefs[key] as string[]
  const next = list.includes(value) ? list.filter(v => v !== value) : [...list, value]
  return { ...prefs, [key]: next }
}

/** One line under the card title: what the player will hear about. */
export function gameAlertSummary(prefs: GameAlertPrefs): string {
  if (!prefs.clubs && !prefs.hosts) return 'Off. Turn on a source to hear about new games.'
  const from = prefs.clubs && prefs.hosts ? 'your clubs and hosts you play with' : prefs.clubs ? 'your clubs' : 'hosts you play with'
  const filtered = prefs.surfaces.length + prefs.levels.length + prefs.times.length > 0
  return `New games from ${from}${filtered ? ' that fit your filters' : ''}, at most ${GAME_ALERTS_PER_DAY} a day.`
}
