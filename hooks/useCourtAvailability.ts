import { useFocusRefetch, useQuery, queryKey } from '../lib/query'
import { fetchCourts } from '../lib/schelagg'
import { COURTS_DAYS, STALE } from '../constants'
import type { CourtsData } from '../types'

const COURTS_KEY = queryKey('courts', COURTS_DAYS)

/**
 * Court availability at Austin venues that rent by the hour (Schelagg's
 * /api/courts, falling back to its static courts.json). Public data: guests
 * read it too. Refetches on focus once older than STALE.courts.
 */
export function useCourtAvailability() {
  const query = useQuery<CourtsData>(COURTS_KEY, () => fetchCourts({ days: COURTS_DAYS }), { staleMs: STALE.courts })
  useFocusRefetch(COURTS_KEY)
  return query
}
