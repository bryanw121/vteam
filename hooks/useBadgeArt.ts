import { supabase } from '../lib/supabase'
import { queryKey, useQuery } from '../lib/query'
import { STALE } from '../constants/cache'
import type { BadgeArt, BadgeArtMap } from '../types'

const BADGE_ART_SELECT = 'badge_type, tier, image_url'
/** PostgREST "table not in the schema cache": the badge_art migration isn't applied yet. */
const MISSING_TABLE = 'PGRST205'
const EMPTY: BadgeArtMap = {}

export function badgeArtKey(): string {
  return queryKey('badgeArt')
}

/** Rows to a lookup by badge type, then tier. */
export function toBadgeArtMap(rows: BadgeArt[]): BadgeArtMap {
  const map: BadgeArtMap = {}
  for (const row of rows) {
    if (!row.image_url) continue
    ;(map[row.badge_type] ??= {})[row.tier] = row.image_url
  }
  return map
}

async function fetchBadgeArt(): Promise<BadgeArtMap> {
  const { data, error } = await supabase.from('badge_art').select(BADGE_ART_SELECT)
  if (error) {
    if (error.code === MISSING_TABLE) return EMPTY
    throw error
  }
  return toBadgeArtMap((data ?? []) as BadgeArt[])
}

/**
 * Generated badge art (#10), the same for everyone (guests included). One
 * small query shared by every BadgeIcon through the lib/query cache. Until it
 * loads, or if it fails, the map is empty and badges show their built-in art.
 */
export function useBadgeArt(): BadgeArtMap {
  const { data } = useQuery<BadgeArtMap>(badgeArtKey(), fetchBadgeArt, { staleMs: STALE.badgeArt })
  return data ?? EMPTY
}
