// No imports: the Vercel functions in `api/` use this too (#130). Re-exported from `utils/index`.

/**
 * Parse an `events.event_date` value into a Date.
 *
 * The column is `timestamp without time zone`, so PostgREST returns values with
 * no timezone suffix ("2026-08-12T00:00:00") even though the instant stored is
 * UTC. Appending `Z` when there's no offset marker keeps `new Date()` from
 * interpreting it as local time.
 */
export function parseEventDate(iso: string): Date {
  if (!iso.includes('T')) return new Date(iso + 'T00:00:00Z')
  // Look for the zone designator in the *time* part only — the date part is
  // full of hyphens, so a naive /[Z+]/ test misses a negative offset like
  // "-05:00" and appends a second designator, producing an Invalid Date.
  const timePart = iso.slice(iso.indexOf('T') + 1)
  const hasZone = /Z$|[+-]\d{2}:?\d{2}$/.test(timePart)
  return new Date(hasZone ? iso : iso + 'Z')
}
