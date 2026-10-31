/**
 * Club locations (#13): any geocoded place from the Places picker (or a curated
 * venue), stored on `clubs` as name / address / lat,lng / place_id. The curated
 * metro (`major_city_id`) stays the discovery key; `matchMajorCity` pre-fills it
 * from the chosen place's address when that city is in the curated list.
 */
import type { ClubLocationFields, GooglePlacePrediction, LocationValue, MajorCity } from '../types'

const NAME_MAX = 200
const ADDRESS_MAX = 300

export const NO_CLUB_LOCATION: ClubLocationFields = {
  location_name: null, location_address: null, latitude: null, longitude: null, place_id: null,
}

/** Drop a trailing country ("…, USA" / "…, United States"): every place is in the US today. */
function stripCountry(address: string): string {
  return address.replace(/,\s*(USA|United States)\s*$/i, '').trim()
}

/**
 * A readable address for a Places prediction: the secondary text ("Speedway,
 * Austin, TX") or, failing that, the full description, without the country.
 */
export function placeAddress(prediction: Pick<GooglePlacePrediction, 'description' | 'structured_formatting'>): string | null {
  const raw = prediction.structured_formatting?.secondary_text?.trim() || prediction.description?.trim() || ''
  const clean = stripCountry(raw)
  return clean || null
}

function finite(n: number | null | undefined, min: number, max: number): number | null {
  return typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max ? n : null
}

/**
 * The `clubs` columns for a picker value. An empty / cleared value means "no
 * location" (all null). Coordinates are kept only as a valid pair, and text is
 * trimmed and capped to the database limits.
 */
export function clubLocationFromPicker(loc: LocationValue | null): ClubLocationFields {
  const name = (loc?.name ?? loc?.display ?? '').trim()
  if (!loc || !name) return NO_CLUB_LOCATION
  const lat = finite(loc.latitude, -90, 90)
  const lng = finite(loc.longitude, -180, 180)
  const pair = lat !== null && lng !== null
  const address = loc.address?.trim() || null
  return {
    location_name: name.slice(0, NAME_MAX),
    location_address: address ? address.slice(0, ADDRESS_MAX) : null,
    latitude: pair ? lat : null,
    longitude: pair ? lng : null,
    place_id: loc.placeId?.trim() || null,
  }
}

/** The picker value for a stored club location (edit mode). Null when the club has none. */
export function pickerFromClubLocation(club: ClubLocationFields): LocationValue | null {
  if (!club.location_name) return null
  return {
    display: club.location_name,
    latitude: club.latitude,
    longitude: club.longitude,
    name: club.location_name,
    address: club.location_address,
    placeId: club.place_id,
  }
}

/**
 * The curated metro an address sits in, if any: looks for a "City, ST" pair of
 * consecutive address parts ("…, Austin, TX 78701, USA" → "Austin, TX") and
 * matches it against `major_cities.display_name`, ignoring case.
 */
export function matchMajorCity(address: string | null | undefined, catalog: MajorCity[]): MajorCity | null {
  if (!address || catalog.length === 0) return null
  const byName = new Map(catalog.map(c => [c.display_name.toLowerCase(), c]))
  const parts = address.split(',').map(p => p.trim()).filter(Boolean)
  // Prefer the last match: the locality comes after street / neighborhood parts.
  for (let i = parts.length - 2; i >= 0; i--) {
    const state = parts[i + 1].match(/^([A-Za-z]{2})(\s+\d{5}(-\d{4})?)?$/)?.[1]
    if (!state) continue
    const hit = byName.get(`${parts[i]}, ${state}`.toLowerCase())
    if (hit) return hit
  }
  return null
}

/**
 * A maps link for the club location. Google Maps universal URL: opens the
 * Maps app on phones that have it and the website elsewhere. A place_id pins
 * the exact place; otherwise coordinates, otherwise a text search.
 */
export function clubMapsUrl(club: ClubLocationFields): string | null {
  if (!club.location_name) return null
  const text = [club.location_name, club.location_address].filter(Boolean).join(', ')
  const query = club.latitude != null && club.longitude != null && !club.place_id
    ? `${club.latitude},${club.longitude}`
    : text
  const params = [`api=1`, `query=${encodeURIComponent(query)}`]
  if (club.place_id) params.push(`query_place_id=${encodeURIComponent(club.place_id)}`)
  return `https://www.google.com/maps/search/?${params.join('&')}`
}
