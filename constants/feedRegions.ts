/**
 * The cities whose outside games vteam shows (Schelagg / Skelly regions: `external_sessions.region`,
 * `external_programs.region`). Centers match Skelly's `config/regions/<id>/region.json`. Add a city
 * here when Skelly's feeds start carrying it; nothing else needs to change.
 *
 * Imported by `api/where.ts`, so this file stays free of React Native imports.
 */
export const FEED_REGIONS = [
  { id: 'austin', name: 'Austin', center: [30.2672, -97.7431] },
  { id: 'dallas', name: 'Dallas', center: [32.7767, -96.797] },
  { id: 'houston', name: 'Houston', center: [29.7604, -95.3698] },
] as const

/** Region shown when nothing says where the viewer is. */
export const DEFAULT_FEED_REGION = 'austin'

/** "Nearest city" reaches this far from a region's center (about 100 miles): its surroundings, not the next metro. */
export const NEAREST_REGION_MAX_KM = 160

/** `GET /api/where` → `{ region }` (the Edge function in `api/where.ts`). */
export const WHERE_API_PATH = '/api/where'
export const WHERE_CLIENT_TIMEOUT_MS = 4_000
/** How long "Use my location" waits for the device. */
export const DEVICE_LOCATION_TIMEOUT_MS = 10_000

export const FEED_CITY_COPY = {
  line: 'Games around',
  change: 'Change',
  sheetTitle: 'Show games around',
  nearest: 'Nearest to you',
  useLocation: 'Use my location',
  locating: 'Finding you…',
  note: "Your location is used once to pick the nearest city. It isn't saved.",
  tooFar: "You're not near a city vteam covers yet. Pick one from the list.",
  denied: "Couldn't get your location. Pick a city from the list.",
} as const
