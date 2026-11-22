/**
 * The outside session sheet (#348): pure rules for what it shows beside the
 * row itself. No React Native here, so the rules are tested directly.
 */
import { sessionConfirmation } from './externalFreshness'
import { signupHost } from './feedItems'
import type { ExternalSession } from '../types'

/** How many other dates "Also on" lists. */
export const ALSO_ON_MAX = 4

const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase()

/**
 * Later dates of the same session among `sessions` (the loaded feed): the same source,
 * title and venue, starting after this one, soonest first, at most `max`.
 */
export function alsoOn(session: ExternalSession, sessions: readonly ExternalSession[], max = ALSO_ON_MAX): ExternalSession[] {
  const start = Date.parse(session.starts_at)
  const seen = new Set<string>()
  return sessions
    .filter(s => s.id !== session.id
      && s.source_id === session.source_id
      && norm(s.title) === norm(session.title)
      && norm(s.venue) === norm(session.venue)
      && Date.parse(s.starts_at) > start)
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at))
    // One per start time: a feed can hold the same occurrence twice across loaded months.
    .filter(s => (seen.has(s.starts_at) ? false : (seen.add(s.starts_at), true)))
    .slice(0, max)
}

/** What to search for in a maps app: the venue and its city. */
export function directionsQuery(session: Pick<ExternalSession, 'venue' | 'city'>): string {
  return [session.venue, session.city].map(s => s?.trim()).filter(Boolean).join(', ')
}

/** The sign-up button's label: the venue's own wording, else "Sign up on reclub.co". */
export function signupButtonLabel(session: Pick<ExternalSession, 'signup_label' | 'signup_url'>): string | null {
  if (session.signup_label?.trim()) return session.signup_label.trim()
  return session.signup_url ? `Sign up on ${signupHost(session.signup_url)}` : null
}

/**
 * The sheet's footer: who lists it and when it was last confirmed at its source.
 * "Listed on reclub.co · checked today" / "· checked 2 days ago". A stale session's warning
 * has its own row in the sheet (sessionConfirmation), so the footer then says only where.
 */
export function listedLine(session: Pick<ExternalSession, 'source_id' | 'verified_at' | 'signup_url'>, today: string): string {
  const where = session.signup_url ? `Listed on ${signupHost(session.signup_url)}` : 'Listed by the venue'
  const confirmation = sessionConfirmation(session, today)
  if (confirmation.note) return where
  const v = session.verified_at?.slice(0, 10)
  if (!v || !/^\d{4}-\d\d-\d\d$/.test(v)) return where
  const days = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${v}T00:00:00Z`)) / 86_400_000)
  const when = days <= 0 ? 'checked today' : days === 1 ? 'checked yesterday' : `checked ${days} days ago`
  return `${where} · ${when}`
}
