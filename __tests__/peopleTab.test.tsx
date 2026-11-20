import React from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react-native'
import { PeopleTab } from '../components/event/PeopleTab'
import { __resetQueryCache } from '../lib/query'
import type { EventGuest, Profile } from '../types'

/**
 * #332: what the People tab shows, pinned down before it was split into
 * pieces (team board, request list, waitlist, one roster card for players and
 * +1s). Menus, paid badges and no-shows are in rosterMessaging.test.tsx.
 */

// react-native-reanimated is mocked globally in jest.setup.js
jest.mock('react-native-gesture-handler', () => require('./helpers/gestureHandlerMock'))
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))
jest.mock('../lib/supabase', () => ({ supabase: { rpc: jest.fn(), from: jest.fn() } }))
jest.mock('../contexts/session', () => ({ useSession: () => ({ userId: 'host', isGuest: false }) }))
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }), useFocusEffect: () => {} }))

beforeEach(() => {
  jest.clearAllMocks()
  __resetQueryCache()
})

function profile(id: string, first: string, extra: Partial<Profile> = {}): Profile {
  return { id, username: id, first_name: first, last_name: 'Test', avatar_url: null, ...extra } as unknown as Profile
}
const guest = (id: string, first: string, addedBy: string) =>
  ({ id, added_by: addedBy, first_name: first, last_name: 'Plus' }) as EventGuest

type Opts = {
  isOwner?: boolean
  isHostOrCohost?: boolean
  attendees?: Profile[]
  guests?: EventGuest[]
  requested?: Profile[]
  waitlist?: Profile[]
  waitlistGuests?: EventGuest[]
  status?: Record<string, unknown>
  teams?: Record<string, unknown>
  processingRequest?: string | null
}

function renderPeople(o: Opts = {}) {
  const attendees = o.attendees ?? [profile('host', 'Hank'), profile('amy', 'Amy')]
  const guests = o.guests ?? []
  const fns = {
    approveRequest: jest.fn(), approveFromWaitlist: jest.fn(), onDeny: jest.fn(), onOpenProfile: jest.fn(),
    setNumTeams: jest.fn(), setMode: jest.fn(), randomizeTeams: jest.fn(), resetTeams: jest.fn(), saveTeams: jest.fn(),
    onRemoveGuest: jest.fn(),
  }
  const props = {
    event: { max_attendees: 12, event_date: new Date(Date.now() + 86_400_000).toISOString(), duration_minutes: 120, cancelled_at: null } as never,
    eventStatus: {
      isOwner: o.isOwner ?? true, count: attendees.length + guests.length, waitlistCount: (o.waitlist ?? []).length,
      isFull: false, isAttending: true, isWaitlisted: false, ...o.status,
    } as never,
    data: {
      userId: 'host', refreshing: false, refresh: jest.fn(),
      roster: {
        attendees,
        attendingRows: attendees.map(p => ({ user_id: p.id, status: 'attending', no_show: false })),
        attendingGuests: guests,
        adderUsernames: { amy: 'amy', host: 'host' },
        requestedProfiles: o.requested ?? [],
        waitlistProfiles: o.waitlist ?? [],
        waitlistGuests: o.waitlistGuests ?? [],
      },
    } as never,
    teams: {
      assignments: {}, numTeams: 2, setNumTeams: fns.setNumTeams, hasTeams: false, savingTeams: false,
      togglePin: jest.fn(), resetTeams: fns.resetTeams, randomizeTeams: fns.randomizeTeams, mode: 'random',
      setMode: fns.setMode, balancePlayers: [], saveTeams: fns.saveTeams, ...o.teams,
    } as never,
    drag: { hoveredTeamKey: null, teamZoneRefs: { current: {} }, onDragStart: jest.fn(), onDragMove: jest.fn(), onDragEnd: jest.fn() } as never,
    attendance: {
      processingRequest: o.processingRequest ?? null, approveRequest: fns.approveRequest,
      approveFromWaitlist: fns.approveFromWaitlist, setNoShow: jest.fn(),
    } as never,
    isHostOrCohost: o.isHostOrCohost ?? o.isOwner ?? true,
    isMobileWeb: false,
    docScrollActive: false,
    onOpenProfile: fns.onOpenProfile,
    onRemoveAttendee: jest.fn(),
    onRemoveGuest: fns.onRemoveGuest,
    onDeny: fns.onDeny,
    onMessage: jest.fn(),
    silencedUserIds: new Set<string>(),
    payments: null,
  }
  render(<PeopleTab {...props} />)
  return fns
}

describe('Going and the team controls', () => {
  it('shows the count against the cap, and an empty roster says so', () => {
    renderPeople({ attendees: [] })
    expect(screen.getByText('0 / 12 people')).toBeTruthy()
    expect(screen.getByText('no one yet — be the first!')).toBeTruthy()
    // No team controls without players.
    expect(screen.queryByTestId('team-mode-random')).toBeNull()
    expect(screen.queryByTestId('team-shuffle')).toBeNull()
  })

  it('a non-owner sees the roster but no team controls', () => {
    renderPeople({ isOwner: false, isHostOrCohost: false })
    expect(screen.getByText('Amy Test')).toBeTruthy()
    expect(screen.queryByText('2 teams')).toBeNull()
    expect(screen.queryByTestId('team-shuffle')).toBeNull()
  })

  it('the owner gets the team stepper, mode chips and Reset / Shuffle / Save', () => {
    const fns = renderPeople({ attendees: [profile('host', 'Hank'), profile('amy', 'Amy'), profile('bo', 'Bo')] })
    expect(screen.getByText('2 teams')).toBeTruthy()
    fireEvent.press(screen.getByTestId('team-mode-balanced'))
    expect(fns.setMode).toHaveBeenCalledWith('balanced')
    fireEvent.press(screen.getByTestId('team-shuffle'))
    expect(fns.randomizeTeams).toHaveBeenCalled()
    fireEvent.press(screen.getByText('Save'))
    expect(fns.saveTeams).toHaveBeenCalled()
    fireEvent.press(screen.getByText('Reset'))
    expect(fns.resetTeams).toHaveBeenCalled()
    // 3 players don't split into 2 equal teams.
    expect(screen.getByText("3 players can't be split into 2 equal teams")).toBeTruthy()
  })

  it('a +1 card says whose guest it is', () => {
    renderPeople({ guests: [guest('g1', 'Gus', 'amy')] })
    expect(screen.getByText("amy's +1")).toBeTruthy()
  })

  it('with teams saved, players sit under their team and the rest under Unassigned', () => {
    renderPeople({
      attendees: [profile('host', 'Hank'), profile('amy', 'Amy'), profile('bo', 'Bo')],
      guests: [guest('g1', 'Gus', 'amy')],
      teams: {
        hasTeams: true,
        assignments: { host: { team: 1, pinned: false }, g1: { team: 2, pinned: false } },
        balancePlayers: [
          { id: 'host', skillLevel: null, isSetter: true },
          { id: 'g1', skillLevel: null, isSetter: false },
        ],
      },
    })
    expect(screen.getByText('Purple Team')).toBeTruthy()
    expect(screen.getByText('Red Team')).toBeTruthy()
    expect(screen.getByText('Unassigned')).toBeTruthy()
    expect(within(screen.getByTestId('team-summary-1')).getByText(/setter/i)).toBeTruthy()
    expect(within(screen.getByTestId('team-summary-2')).queryByText(/setter/i)).toBeNull()
  })

  it('an empty team says No players', () => {
    renderPeople({ teams: { hasTeams: true, numTeams: 3, assignments: { host: { team: 1, pinned: false }, amy: { team: 2, pinned: false } } } })
    expect(screen.getByText('No players')).toBeTruthy()
  })
})

describe('Requested (hosts and co-hosts only)', () => {
  const requested = [profile('rae', 'Rae')]

  it('is hidden from everyone else', () => {
    renderPeople({ isOwner: false, isHostOrCohost: false, requested })
    expect(screen.queryByText('Requested')).toBeNull()
    expect(screen.queryByText('Rae Test')).toBeNull()
  })

  it('lets the host approve or deny', () => {
    const fns = renderPeople({ requested })
    expect(screen.getByText('1 pending')).toBeTruthy()
    fireEvent.press(screen.getByText('Approve'))
    expect(fns.approveRequest).toHaveBeenCalledWith('rae')
    fireEvent.press(screen.getByText('Deny'))
    expect(fns.onDeny).toHaveBeenCalledWith('rae', 'Rae Test')
    fireEvent.press(screen.getByText('Rae Test'))
    expect(fns.onOpenProfile).toHaveBeenCalledWith('rae')
  })

  it('shows a spinner instead of Approve while that request is processing', () => {
    renderPeople({ requested, processingRequest: 'rae' })
    expect(screen.queryByText('Approve')).toBeNull()
  })
})

describe('Waitlist', () => {
  it('numbers players first, then +1s, and counts both', () => {
    renderPeople({
      waitlist: [profile('wa', 'Wes'), profile('wb', 'Wyn')],
      waitlistGuests: [guest('wg', 'Gil', 'amy')],
    })
    expect(screen.getByText('3 waiting')).toBeTruthy()
    expect(screen.getByText('#1')).toBeTruthy()
    expect(screen.getByText('#2')).toBeTruthy()
    expect(screen.getByText('#3')).toBeTruthy()
    expect(screen.getByText('Gil Plus')).toBeTruthy()
    expect(screen.getByText('Guest')).toBeTruthy()
  })

  it('the owner can approve from the waitlist; others cannot', () => {
    const fns = renderPeople({ waitlist: [profile('wa', 'Wes')] })
    fireEvent.press(screen.getByText('Approve'))
    expect(fns.approveFromWaitlist).toHaveBeenCalledWith('wa')
  })

  it('a non-owner sees the list without Approve', () => {
    renderPeople({ isOwner: false, isHostOrCohost: false, waitlist: [profile('wa', 'Wes')] })
    expect(screen.getByText('Wes Test')).toBeTruthy()
    expect(screen.queryByText('Approve')).toBeNull()
  })

  it('a full game shows the empty waitlist to someone not on it', () => {
    renderPeople({ isOwner: false, isHostOrCohost: false, status: { isFull: true, isAttending: false, isWaitlisted: false } })
    expect(screen.getByText('No one on the waitlist yet')).toBeTruthy()
  })

  it('no waitlist section when nobody is waiting and the game has room', () => {
    renderPeople({})
    expect(screen.queryByText('Waitlist')).toBeNull()
  })
})
