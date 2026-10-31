import { supabase } from '../lib/supabase'
import { queryKey, useQuery } from '../lib/query'
import { STALE } from '../constants/cache'
import type { MajorCity } from '../types'

export const MAJOR_CITY_SELECT = 'id, display_name, city_name, admin_region, country_code'

export async function fetchMajorCities(): Promise<MajorCity[]> {
  const { data, error } = await supabase
    .from('major_cities')
    .select(MAJOR_CITY_SELECT)
    .order('display_name', { ascending: true })
  if (error) throw error
  return (data ?? []) as MajorCity[]
}

/** The curated metro list (club metro, home city). Reference data: cached for an hour, shared by every picker. */
export function useMajorCities() {
  return useQuery(queryKey('major_cities'), fetchMajorCities, { staleMs: STALE.reference })
}
