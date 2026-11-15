import {
  clubFormFromClub, clubMediaColumn, clubMediaExtension, clubMediaPath, clubUpdateColumns, hasClubFormErrors,
  isClubStoragePath, memberNameLookup, validateClubForm, withGameAlerts, withListMembership, withMembership,
} from '../utils/clubForm'
import type { ClubDetailData, ClubForm, ClubListItem, ClubWithDetails, MajorCity } from '../types'

const AUSTIN = { id: 'm1', display_name: 'Austin, TX', city_name: 'Austin', admin_region: 'TX', country_code: 'US' } as unknown as MajorCity
const NOW = '2026-11-14T18:00:00.000Z'

function club(over: Partial<ClubWithDetails> = {}): ClubWithDetails {
  return {
    id: 'c1', name: 'Eastside Sand', description: null, major_cities: AUSTIN, avatar_url: null, cover_url: null,
    location_name: null, location_address: null, latitude: null, longitude: null, place_id: null,
    club_members: [{ club_id: 'c1', user_id: 'owner', role: 'owner', joined_at: NOW, game_alerts: true, profiles: { id: 'owner', username: 'maya', first_name: 'Maya', last_name: 'Chen', avatar_url: null } }],
    ...over,
  } as unknown as ClubWithDetails
}

const detail = (c = club()): ClubDetailData => ({ club: c, upcomingEvents: [], pastCount: 3 })

describe('club edit form', () => {
  it('opens with the club values', () => {
    const f = clubFormFromClub(club({ description: 'Sunday sand' }))
    expect(f).toEqual({ name: 'Eastside Sand', description: 'Sunday sand', majorCity: AUSTIN, location: null })
  })

  it('needs a name and a metro', () => {
    const empty: ClubForm = { name: '  ', description: '', majorCity: null, location: null }
    expect(validateClubForm(empty)).toEqual({ name: 'Enter a club name.', metro: 'Choose a city from the list.' })
    expect(hasClubFormErrors(validateClubForm(empty))).toBe(true)
    expect(hasClubFormErrors(validateClubForm({ ...empty, name: 'Vex', majorCity: AUSTIN }))).toBe(false)
  })

  it('writes trimmed columns, null for an empty description, and no location when cleared', () => {
    expect(clubUpdateColumns({ name: ' Vex ', description: '  ', majorCity: AUSTIN, location: null })).toEqual({
      name: 'Vex', description: null, major_city_id: 'm1',
      location_name: null, location_address: null, latitude: null, longitude: null, place_id: null,
    })
  })

  it('refuses to build columns without a metro', () => {
    expect(() => clubUpdateColumns({ name: 'Vex', description: '', majorCity: null, location: null })).toThrow()
  })
})

describe('club photos', () => {
  it('names the file by club, kind, time and type', () => {
    expect(clubMediaPath('c1', 'cover', 'image/png', 42)).toBe('c1/cover_42.png')
    expect(clubMediaPath('c1', 'avatar', 'image/webp', 1)).toBe('c1/avatar_1.webp')
    expect(clubMediaExtension('image/heic')).toBe('jpg')
    expect(clubMediaColumn('avatar')).toBe('avatar_url')
    expect(clubMediaColumn('cover')).toBe('cover_url')
  })

  it('only removes paths in our bucket, never an old full URL', () => {
    expect(isClubStoragePath('c1/avatar_1.jpg')).toBe(true)
    expect(isClubStoragePath('https://example.com/a.jpg')).toBe(false)
    expect(isClubStoragePath(null)).toBe(false)
  })
})

describe('optimistic membership', () => {
  const me = { id: 'u2', username: 'ari', first_name: 'Ari', last_name: 'Moreno', avatar_url: null }

  it('adds the viewer as a member with alerts on, once', () => {
    const next = withMembership(detail(), 'u2', 'join', me, NOW)
    expect(next.club?.club_members.map(m => [m.user_id, m.role, m.game_alerts])).toEqual([['owner', 'owner', true], ['u2', 'member', true]])
    expect(withMembership(next, 'u2', 'join', me, NOW).club?.club_members).toHaveLength(2)
    expect(next.pastCount).toBe(3)
  })

  it('removes the viewer on leave', () => {
    const joined = withMembership(detail(), 'u2', 'join', me, NOW)
    expect(withMembership(joined, 'u2', 'leave', me, NOW).club?.club_members.map(m => m.user_id)).toEqual(['owner'])
  })

  it('leaves a missing club alone', () => {
    const none: ClubDetailData = { club: null, upcomingEvents: [], pastCount: 0 }
    expect(withMembership(none, 'u2', 'join', me, NOW)).toBe(none)
    expect(withGameAlerts(none, 'u2', false)).toBe(none)
  })

  it('switches only the viewer’s game alerts', () => {
    const joined = withMembership(detail(), 'u2', 'join', me, NOW)
    expect(withGameAlerts(joined, 'u2', false).club?.club_members.map(m => m.game_alerts)).toEqual([true, false])
  })

  it('updates a Clubs list row’s count and membership', () => {
    const row = { id: 'c1', club_members: [{ count: 4 }], my_membership: [] } as unknown as ClubListItem
    const joined = withListMembership(row, 'u2', 'join', NOW)
    expect(joined.club_members).toEqual([{ count: 5 }])
    expect(joined.my_membership?.[0]).toMatchObject({ user_id: 'u2', role: 'member' })
    expect(withListMembership(joined, 'u2', 'join', NOW)).toBe(joined)
    expect(withListMembership(joined, 'u2', 'leave', NOW).club_members).toEqual([{ count: 4 }])
    expect(withListMembership(row, 'u2', 'leave', NOW)).toBe(row)
  })
})

describe('member names for poll voters', () => {
  it('names members from the page and falls back to Member', () => {
    const name = memberNameLookup(club(), p => `${p.first_name} ${p.last_name}`)
    expect(name('owner')).toBe('Maya Chen')
    expect(name('nobody')).toBe('Member')
    expect(memberNameLookup(null, () => 'x')('owner')).toBe('Member')
  })
})
