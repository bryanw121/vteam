import { buildRecapMeta, recapEligible, yearStartIso, type RecapMeta } from '../../utils/recap'
import { parseContentRangeTotal, type SupabaseRestConfig } from './eventPreview'

const FETCH_TIMEOUT_MS = 3000
type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

type RecapEventRow = { title: string | null; event_date: string; location: string | null; duration_minutes: number | null; event_tags: { tags: { name: string } | null }[] | null }

/**
 * Everything the recap picture (#227) needs, read with the anon key: only rows
 * guests can already read (the event, the player's public profile, their
 * attendee row, cheers counts). Null when the player wasn't attending the game
 * (or was flagged a no-show), when the game hasn't ended, or for unknown ids.
 * Throws on network / PostgREST errors so the caller answers with a short cache.
 */
export async function fetchRecap(eventId: string, userId: string, cfg: SupabaseRestConfig, now: number, fetchImpl: FetchLike = fetch): Promise<RecapMeta | null> {
  const headers = { apikey: cfg.anonKey, Authorization: `Bearer ${cfg.anonKey}`, Accept: 'application/json' }
  const signal = typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal ? AbortSignal.timeout(FETCH_TIMEOUT_MS) : undefined
  const rest = (path: string, init: RequestInit = {}) =>
    fetchImpl(`${cfg.url}/rest/v1/${path}`, { ...init, headers: { ...headers, ...(init.headers as Record<string, string>) }, signal })

  const [eventRes, attendeeRes, profileRes, cheersRes] = await Promise.all([
    rest(`events?select=title,event_date,location,duration_minutes,event_tags(tags(name))&id=eq.${eventId}&cancelled_at=is.null&limit=1`),
    rest(`event_attendees?select=status,no_show&event_id=eq.${eventId}&user_id=eq.${userId}&limit=1`),
    rest(`profiles?select=first_name,last_name,username&id=eq.${userId}&limit=1`),
    rest(`cheers?select=id&event_id=eq.${eventId}&receiver_id=eq.${userId}`, { method: 'HEAD', headers: { Prefer: 'count=exact' } }),
  ])
  for (const res of [eventRes, attendeeRes, profileRes, cheersRes]) {
    if (!res.ok) throw new Error(`PostgREST ${res.status} for ${res.url || 'recap'}`)
  }
  const event = ((await eventRes.json()) as RecapEventRow[])[0]
  const attendee = ((await attendeeRes.json()) as { status: string; no_show: boolean | null }[])[0]
  const profile = ((await profileRes.json()) as { first_name: string | null; last_name: string | null; username: string | null }[])[0] ?? null
  if (!event || !recapEligible(attendee)) return null
  const ended = Date.parse(event.event_date.endsWith('Z') ? event.event_date : `${event.event_date}Z`) + (event.duration_minutes ?? 120) * 60_000
  if (now < ended) return null

  const gamesRes = await rest(
    `event_attendees?select=event_id,events!inner(event_date)&user_id=eq.${userId}&status=eq.attending`
      + `&events.event_date=gte.${yearStartIso(event.event_date)}&events.event_date=lte.${new Date(now).toISOString()}`,
    { method: 'HEAD', headers: { Prefer: 'count=exact' } },
  )
  if (!gamesRes.ok) throw new Error(`PostgREST ${gamesRes.status} for games this year`)

  return buildRecapMeta({
    profile,
    event,
    tagNames: (event.event_tags ?? []).map(t => t.tags?.name ?? '').filter(Boolean),
    cheers: parseContentRangeTotal(cheersRes.headers.get('content-range')),
    gamesThisYear: parseContentRangeTotal(gamesRes.headers.get('content-range')),
  })
}
