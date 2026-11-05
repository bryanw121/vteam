/**
 * Weather on outdoor games (#165): thresholds and copy. No imports: the
 * `api/forecast.ts` Edge function loads this too.
 *
 * Forecasts come from the National Weather Service (US only, no key) through
 * our own proxy, `GET /api/forecast?lat=..&lng=..`, cached on the CDN.
 */

/** Surfaces that get a forecast. Indoor games are unchanged. */
export const FORECAST_SURFACES = ['sand', 'grass'] as const

/** A forecast shows for events starting within this many days (NWS hourly covers about 7). */
export const FORECAST_WINDOW_DAYS = 7

/** Chance of rain (percent) at or above which the chip and row switch to the rain warning. */
export const FORECAST_RAIN_WARN_POP = 40

/** Heat index (°F) at or above which the chip and row switch to the heat warning. */
export const FORECAST_HEAT_WARN_F = 95

/** The event page shows this many hours before the start, then every hour through the end. */
export const FORECAST_LEAD_HOURS = 1

/** Courts are cached by coordinates rounded to this many decimals (about 1 km). */
export const FORECAST_COORD_DECIMALS = 2

/** The proxy's path on the web origin (`api/forecast.ts`). */
export const FORECAST_API_PATH = '/api/forecast'

/** Give up on the proxy after this long; the forecast is then simply not shown. */
export const FORECAST_CLIENT_TIMEOUT_MS = 8000

/** Proxy cache: a forecast is fresh on the CDN for 30 min, then served stale for an hour while it refreshes. */
export const FORECAST_CACHE_CONTROL = 'public, s-maxage=1800, stale-while-revalidate=3600'
/** No forecast (outside the US, NWS down): cache the empty answer for 10 min. */
export const FORECAST_EMPTY_CACHE_CONTROL = 'public, s-maxage=600'

/** User-facing strings. */
export const FORECAST_COPY = {
  rainHeadline: 'Rain likely during the game',
  heatHeadline: (feelsF: number) => `Hot: feels like ${feelsF}°F`,
  heatAdvice: 'Bring water and shade.',
  later: 'Forecast appears 7 days before',
  source: (updated: string) => `Forecast from the National Weather Service · updated ${updated}. Check with the host before heading out.`,
} as const

/**
 * Emoji per NWS icon condition (the last path segment of an NWS icon URL, e.g.
 * `.../icons/land/day/rain_showers,40`). Day and night differ only for clear skies.
 * https://api.weather.gov/icons lists the codes.
 */
export const FORECAST_ICON_EMOJI: Record<string, string> = {
  skc: '☀️', few: '🌤', sct: '⛅', bkn: '🌥', ovc: '☁️',
  wind_skc: '💨', wind_few: '💨', wind_sct: '💨', wind_bkn: '💨', wind_ovc: '💨',
  rain: '🌧', rain_showers: '🌦', rain_showers_hi: '🌦', tsra: '⛈', tsra_sct: '⛈', tsra_hi: '⛈',
  snow: '❄️', rain_snow: '🌨', rain_sleet: '🌨', snow_sleet: '🌨', fzra: '🌨', rain_fzra: '🌨', snow_fzra: '🌨', sleet: '🌨', blizzard: '❄️',
  fog: '🌫', haze: '🌫', smoke: '🌫', dust: '🌫',
  hot: '🔥', cold: '🥶', tornado: '🌪', hurricane: '🌀', tropical_storm: '🌀',
}
/** Clear skies at night. */
export const FORECAST_NIGHT_CLEAR_EMOJI = '🌙'
/** Any condition we don't know. */
export const FORECAST_DEFAULT_EMOJI = '🌡'
export const FORECAST_RAIN_EMOJI = '🌧'
export const FORECAST_HEAT_EMOJI = '🔥'
