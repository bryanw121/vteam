import { SKILL_LEVEL_LABELS } from './copy'
import type { GameAlertPrefs, GameAlertSurface, GameAlertTime } from '../types'

/** The `user_settings.game_alerts` column default (#170): club alerts on, host alerts off, no filters. */
export const DEFAULT_GAME_ALERTS: GameAlertPrefs = { clubs: true, hosts: false, surfaces: [], levels: [], times: [] }

export const GAME_ALERT_SURFACES: readonly { key: GameAlertSurface; label: string }[] = [
  { key: 'indoor', label: 'Indoor' },
  { key: 'sand', label: 'Sand' },
  { key: 'grass', label: 'Grass' },
]

/** Matches `game_alert_matches()` in the database: weekday evenings start at 5 PM, Chicago time. */
export const GAME_ALERT_TIME_BUCKETS: readonly { key: GameAlertTime; label: string }[] = [
  { key: 'weekday_evening', label: 'Weekday evenings' },
  { key: 'weekday_day', label: 'Weekday daytime' },
  { key: 'weekend', label: 'Weekends' },
]

export const GAME_ALERT_LEVELS: readonly { key: string; label: string }[] =
  Object.entries(SKILL_LEVEL_LABELS).map(([key, label]) => ({ key, label }))

/** At most this many new game alerts a day (enforced by `send_new_game_alerts()`). */
export const GAME_ALERTS_PER_DAY = 3
