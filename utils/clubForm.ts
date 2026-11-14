/**
 * Pure rules for the club page (#305): the owner's edit form, photo paths, and
 * the optimistic membership changes the club page and the Clubs list share.
 */
import { clubLocationFromPicker, pickerFromClubLocation } from './clubLocation'
import type {
  ClubDetailData, ClubForm, ClubFormErrors, ClubListItem, ClubLocationFields, ClubMediaKind,
  ClubMemberProfile, ClubMembershipAction, ClubWithDetails, MajorCity,
} from '../types'

export function clubFormFromClub(club: ClubWithDetails): ClubForm {
  return {
    name: club.name,
    description: club.description ?? '',
    majorCity: club.major_cities ?? null,
    location: pickerFromClubLocation(club),
  }
}

/** Errors to show under the fields; an empty object means the form can be saved. */
export function validateClubForm(form: ClubForm): ClubFormErrors {
  const errors: ClubFormErrors = {}
  if (!form.name.trim()) errors.name = 'Enter a club name.'
  if (!form.majorCity) errors.metro = 'Choose a city from the list.'
  return errors
}

export function hasClubFormErrors(errors: ClubFormErrors): boolean {
  return !!(errors.name || errors.metro)
}

/** The `clubs` columns an edit writes. Call only after `validateClubForm` passed. */
export function clubUpdateColumns(form: ClubForm): { name: string; description: string | null; major_city_id: MajorCity['id'] } & ClubLocationFields {
  if (!form.majorCity) throw new Error('A club needs a metro area')
  return {
    name: form.name.trim(),
    description: form.description.trim() || null,
    major_city_id: form.majorCity.id,
    ...clubLocationFromPicker(form.location),
  }
}

/** File extension for an uploaded photo's MIME type (jpg unless png or webp). */
export function clubMediaExtension(mimeType: string): 'png' | 'webp' | 'jpg' {
  return mimeType.includes('png') ? 'png' : mimeType.includes('webp') ? 'webp' : 'jpg'
}

/** Storage path for a new club photo: `<club id>/<kind>_<ms>.<ext>` in the club avatars bucket. */
export function clubMediaPath(clubId: string, kind: ClubMediaKind, mimeType: string, nowMs: number): string {
  return `${clubId}/${kind}_${nowMs}.${clubMediaExtension(mimeType)}`
}

export function clubMediaColumn(kind: ClubMediaKind): 'avatar_url' | 'cover_url' {
  return kind === 'avatar' ? 'avatar_url' : 'cover_url'
}

/** A stored path we own (older rows hold a full https URL, which is never deleted). */
export function isClubStoragePath(path: string | null | undefined): path is string {
  return !!path && !/^https?:\/\//i.test(path)
}

/** The club page's cached detail after the viewer joins or leaves (optimistic). */
export function withMembership(
  data: ClubDetailData,
  userId: string,
  action: ClubMembershipAction,
  profile: ClubMemberProfile | null,
  nowIso: string,
): ClubDetailData {
  if (!data.club) return data
  const others = data.club.club_members.filter(m => m.user_id !== userId)
  const members: ClubWithDetails['club_members'] =
    action === 'join'
      ? [...others, { club_id: data.club.id, user_id: userId, role: 'member', joined_at: nowIso, game_alerts: true, profiles: profile as ClubMemberProfile }]
      : others
  return { ...data, club: { ...data.club, club_members: members } }
}

/** The viewer's game alerts switch for this club, in the cached detail (optimistic). */
export function withGameAlerts(data: ClubDetailData, userId: string, on: boolean): ClubDetailData {
  if (!data.club) return data
  const members = data.club.club_members.map(m => (m.user_id === userId ? { ...m, game_alerts: on } : m))
  return { ...data, club: { ...data.club, club_members: members } }
}

function listCount(club: ClubListItem): number {
  return Number(club.club_members?.[0]?.count ?? 0)
}

/** A Clubs list row after the viewer joins or leaves (optimistic count and membership). */
export function withListMembership(club: ClubListItem, userId: string, action: ClubMembershipAction, nowIso: string): ClubListItem {
  const wasMember = !!club.my_membership?.some(m => m.user_id === userId)
  if (action === 'join') {
    if (wasMember) return club
    return {
      ...club,
      club_members: [{ count: listCount(club) + 1 }],
      my_membership: [{ club_id: club.id, user_id: userId, role: 'member', joined_at: nowIso }],
    }
  }
  if (!wasMember) return club
  return { ...club, club_members: [{ count: Math.max(0, listCount(club) - 1) }], my_membership: [] }
}

/** Member names for poll voters (#175), from the member list already on the page. */
export function memberNameLookup(club: ClubWithDetails | null, displayName: (p: NonNullable<ClubMemberProfile>) => string): (userId: string) => string {
  const names = new Map((club?.club_members ?? []).map(m => [m.user_id, m.profiles ? displayName(m.profiles) : 'Member']))
  return (uid: string) => names.get(uid) ?? 'Member'
}
