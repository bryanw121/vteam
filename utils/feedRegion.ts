import { DEFAULT_FEED_REGION, FEED_REGIONS, NEAREST_REGION_MAX_KM } from '../constants/feedRegions'
import type { FeedRegionId, FeedRegionSource } from '../types/feedRegion'

/**
 * Which city's outside games a viewer sees. Pure, and free of React Native imports (the Edge
 * function `api/where.ts` uses it too).
 */

const RAD = Math.PI / 180

/** Great-circle distance in km between two [lat, lng] points. */
export function kmBetween(a: readonly [number, number], b: readonly [number, number]): number {
  const dLat = (b[0] - a[0]) * RAD
  const dLng = (b[1] - a[1]) * RAD
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * RAD) * Math.cos(b[0] * RAD) * Math.sin(dLng / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(h))
}

export function isFeedRegion(id: unknown): id is FeedRegionId {
  return typeof id === 'string' && FEED_REGIONS.some(r => r.id === id)
}

/** The covered city nearest to a point, when one is within reach; else null. */
export function nearestFeedRegion(lat: unknown, lng: unknown, maxKm: number = NEAREST_REGION_MAX_KM): FeedRegionId | null {
  if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng)) return null
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null
  let best: { id: FeedRegionId; km: number } | null = null
  for (const r of FEED_REGIONS) {
    const km = kmBetween(r.center, [lat, lng])
    if (km <= maxKm && (!best || km < best.km)) best = { id: r.id, km }
  }
  return best?.id ?? null
}

/** Schelagg region slug for a city name: "Austin" -> "austin", "San Antonio" -> "san-antonio". */
export function regionSlug(cityName: string): string {
  return cityName.trim().toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

/** "Dallas" for 'dallas'; the slug itself, title-cased, for a region this build doesn't list. */
export function feedRegionName(id: string): string {
  return FEED_REGIONS.find(r => r.id === id)?.name ?? id.replace(/-/g, ' ').replace(/\b[a-z]/g, c => c.toUpperCase())
}

/**
 * The region to show, and why. In order: what this device picked (the sheet, or "Use my
 * location"); the profile's home city when it is a covered city; the covered city nearest the
 * viewer's network (`/api/where`); Austin.
 */
export function resolveFeedRegion(input: { picked?: string | null; homeCity?: string | null; located?: string | null }): { region: FeedRegionId; source: FeedRegionSource } {
  if (isFeedRegion(input.picked)) return { region: input.picked, source: 'picked' }
  const home = input.homeCity ? regionSlug(input.homeCity) : null
  if (isFeedRegion(home)) return { region: home, source: 'home' }
  if (isFeedRegion(input.located)) return { region: input.located, source: 'network' }
  return { region: DEFAULT_FEED_REGION, source: 'default' }
}

/** A stored pick → region id, or null when it's missing, corrupt or no longer a covered city. */
export function parseStoredRegion(raw: string | null | undefined): FeedRegionId | null {
  if (!raw) return null
  try {
    const v = JSON.parse(raw) as { region?: unknown } | null
    return v && isFeedRegion(v.region) ? v.region : null
  } catch {
    return null
  }
}
