import React from 'react'
import { Modal, Platform, Text } from 'react-native'
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react-native'
import {
  canMessageFromRoster,
  guestRowActions,
  hasRosterMenu,
  memberRowActions,
} from '../utils/rosterActions'
import { RosterActionsSheet } from '../components/event/RosterActionsSheet'
import { BottomSheet } from '../components/ui'
import { PeopleTab } from '../components/event/PeopleTab'
import { useOpenDm } from '../hooks/useOpenDm'
import { __resetQueryCache, useQuery } from '../lib/query'
import { conversationsKey } from '../hooks/useConversations'
import { routes } from '../utils/routes'
import { shared } from '../constants'
import type { EventGuest, Profile, RosterActionContext, RosterMenu } from '../types'

/**
 * #40: a host can message one attendee from the People tab. The risky part is
 * the gates, not the happy path: who is offered Message, and who must never be.
 */

jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'))
require('react-native-gesture-handler/jestSetup')

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

const mockRpc = jest.fn()
jest.mock('../lib/supabase', () => ({ supabase: { rpc: (...args: unknown[]) => mockRpc(...args) } }))

let mockUserId: string | null = 'host'
jest.mock('../contexts/session', () => ({ useSession: () => ({ userId: mockUserId, isGuest: !mockUserId }) }))

const mockRequireSignIn = jest.fn(() => true)
jest.mock('../hooks/useRequireSignIn', () => ({ useRequireSignIn: () => mockRequireSignIn }))

const mockPush = jest.fn()
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }), useFocusEffect: () => {} }))

const mockChatAlert = jest.fn()
jest.mock('../utils/chatUtils', () => ({
  ...jest.requireActual('../utils/chatUtils'),
  chatAlert: (...args: unknown[]) => mockChatAlert(...args),
}))

beforeEach(() => {
  jest.clearAllMocks()
  __resetQueryCache()
  mockUserId = 'host'
  mockRequireSignIn.mockImplementation(() => true)
})

function ctx(over: Partial<RosterActionContext> = {}): RosterActionContext {
  return {
    canMessage: true,
    viewerId: 'host',
    silencedUserIds: new Set(),
    onMessage: jest.fn(),
    onOpenProfile: jest.fn(),
    ...over,
  }
}

const keys = (a: { key: string }[]) => a.map(x => x.key)

/** jest-expo runs as iOS, where a sheet reports "closed" from Modal.onDismiss after its slide-out. */
function finishSlideOut() {
  act(() => { screen.UNSAFE_getAllByType(Modal).forEach(m => m.props.onDismiss?.()) })
}

// ─── Gates ────────────────────────────────────────────────────────────────────

describe('who can be messaged from the roster', () => {
  it('hosts and co-hosts can message an attendee', () => {
    expect(canMessageFromRoster('amy', ctx())).toBe(true)
  })

  it('a regular attendee cannot (host → attendee only)', () => {
    expect(canMessageFromRoster('amy', ctx({ canMessage: false }))).toBe(false)
  })

  it('never yourself', () => {
    expect(canMessageFromRoster('host', ctx())).toBe(false)
  })

  it('never someone the viewer has silenced', () => {
    expect(canMessageFromRoster('amy', ctx({ silencedUserIds: new Set(['amy']) }))).toBe(false)
  })

  it('nothing without a handler or a signed-in viewer', () => {
    expect(canMessageFromRoster('amy', ctx({ onMessage: undefined }))).toBe(false)
    expect(canMessageFromRoster('amy', ctx({ viewerId: null }))).toBe(false)
  })
})

describe('member row actions', () => {
  it('leads with Message, keeps View profile, ends with a destructive Remove', () => {
    const c = ctx()
    const remove = jest.fn()
    const actions = memberRowActions({ id: 'amy' }, c, remove)
    expect(keys(actions)).toEqual(['message', 'profile', 'remove'])
    expect(actions[2].destructive).toBe(true)
    actions[0].onPress()
    actions[1].onPress()
    actions[2].onPress()
    expect(c.onMessage).toHaveBeenCalledWith('amy')
    expect(c.onOpenProfile).toHaveBeenCalledWith('amy')
    expect(remove).toHaveBeenCalled()
  })

  it('a non-host gets only View profile, which is no menu at all', () => {
    const actions = memberRowActions({ id: 'amy' }, ctx({ canMessage: false }))
    expect(keys(actions)).toEqual(['profile'])
    expect(hasRosterMenu(actions)).toBe(false)
  })

  it('the host’s own row offers no Message', () => {
    expect(keys(memberRowActions({ id: 'host' }, ctx(), jest.fn()))).toEqual(['profile', 'remove'])
  })
})

describe('+1 guests', () => {
  const guest = { id: 'guest-1', added_by: 'amy' } as Pick<EventGuest, 'added_by'> & { id: string }

  it('offers the member who added them, never the guest id', () => {
    const c = ctx()
    const actions = guestRowActions(guest, 'amy_v', c, jest.fn())
    expect(keys(actions)).toEqual(['message-adder', 'remove'])
    expect(actions[0].label).toBe('Message amy_v')
    actions[0].onPress()
    expect(c.onMessage).toHaveBeenCalledWith('amy')
    expect(c.onMessage).not.toHaveBeenCalledWith('guest-1')
  })

  it('falls back to a generic label when the adder’s name is unknown', () => {
    expect(guestRowActions(guest, undefined, ctx())[0].label).toBe('Message who added them')
  })

  it('the host’s own +1 is Remove only, so the row keeps its bare ✕', () => {
    const actions = guestRowActions({ added_by: 'host' }, 'host', ctx(), jest.fn())
    expect(keys(actions)).toEqual(['remove'])
    expect(hasRosterMenu(actions)).toBe(false)
  })
})

// ─── The sheet ──────────────────────────────────────────────────────────────

describe('RosterActionsSheet', () => {
  it('runs the chosen action only after the sheet has closed', () => {
    const run = jest.fn()
    const onDismiss = jest.fn()
    const menu: RosterMenu = {
      title: 'Amy V.',
      actions: [
        { key: 'message', label: 'Message', onPress: run },
        { key: 'profile', label: 'View profile', onPress: jest.fn() },
      ],
    }
    const { rerender } = render(<RosterActionsSheet menu={menu} onDismiss={onDismiss} />)
    expect(screen.getByText('Amy V.')).toBeTruthy()
    fireEvent.press(screen.getByLabelText('Message'))
    expect(onDismiss).toHaveBeenCalledTimes(1)
    expect(run).not.toHaveBeenCalled()
    rerender(<RosterActionsSheet menu={null} onDismiss={onDismiss} />)
    expect(run).not.toHaveBeenCalled() // still sliding out: a confirm Modal can't present yet
    finishSlideOut()
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('dismissing without a choice runs nothing', () => {
    const run = jest.fn()
    const menu: RosterMenu = { title: 'x', actions: [{ key: 'message', label: 'Message', onPress: run }, { key: 'profile', label: 'View profile', onPress: run }] }
    const { rerender } = render(<RosterActionsSheet menu={menu} onDismiss={() => {}} />)
    fireEvent.press(screen.getByTestId('bottom-sheet-backdrop'))
    rerender(<RosterActionsSheet menu={null} onDismiss={() => {}} />)
    expect(run).not.toHaveBeenCalled()
  })

  it('options and the card ⋯ trigger have 44pt targets', () => {
    expect(shared.sheetOption.minHeight).toBe(44)
    expect(shared.rowMenuTrigger.minWidth).toBe(44)
    expect(shared.rowMenuTrigger.minHeight).toBe(44)
  })
})

describe('BottomSheet onClosed', () => {
  it('iOS: fires from the Modal’s onDismiss, after the slide-out', () => {
    const onClosed = jest.fn()
    const { rerender } = render(<BottomSheet visible onDismiss={() => {}} onClosed={onClosed}><Text>x</Text></BottomSheet>)
    rerender(<BottomSheet visible={false} onDismiss={() => {}} onClosed={onClosed}><Text>x</Text></BottomSheet>)
    expect(onClosed).not.toHaveBeenCalled()
    finishSlideOut()
    expect(onClosed).toHaveBeenCalledTimes(1)
  })

  it('elsewhere: fires once when the sheet goes from visible to hidden', () => {
    const os = Platform.OS
    Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true })
    try {
      const onClosed = jest.fn()
      const { rerender } = render(<BottomSheet visible onDismiss={() => {}} onClosed={onClosed}><Text>x</Text></BottomSheet>)
      expect(onClosed).not.toHaveBeenCalled()
      rerender(<BottomSheet visible={false} onDismiss={() => {}} onClosed={onClosed}><Text>x</Text></BottomSheet>)
      rerender(<BottomSheet visible={false} onDismiss={() => {}} onClosed={onClosed}><Text>x</Text></BottomSheet>)
      expect(onClosed).toHaveBeenCalledTimes(1)
    } finally {
      Object.defineProperty(Platform, 'OS', { value: os, configurable: true })
    }
  })
})

// ─── useOpenDm: the one definition of "message this person" ──────────────────

describe('useOpenDm', () => {
  it('finds or creates the DM and opens it', async () => {
    mockRpc.mockResolvedValue({ data: 'conv-1', error: null })
    const { result } = renderHook(() => useOpenDm())
    await act(async () => { await result.current.openDm('amy') })
    expect(mockRpc).toHaveBeenCalledWith('find_or_create_dm', { other_user_id: 'amy' })
    expect(mockPush).toHaveBeenCalledWith(routes.conversation('conv-1'))
  })

  it('sends guests to sign in without calling the RPC', async () => {
    mockRequireSignIn.mockImplementation(() => false)
    const { result } = renderHook(() => useOpenDm())
    await act(async () => { await result.current.openDm('amy') })
    expect(mockRequireSignIn).toHaveBeenCalled()
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('never opens a DM with yourself', async () => {
    const { result } = renderHook(() => useOpenDm())
    await act(async () => { await result.current.openDm('host') })
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('surfaces a failure instead of silently doing nothing', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    const { result } = renderHook(() => useOpenDm())
    await act(async () => { await result.current.openDm('amy') })
    expect(mockPush).not.toHaveBeenCalled()
    expect(mockChatAlert).toHaveBeenCalledWith("Couldn't open chat", expect.any(String))
  })

  it('refetches the chat list only for a brand-new conversation', async () => {
    const fetchList = jest.fn(async () => [{ conversation_id: 'conv-1' }])
    const { result } = renderHook(() => {
      useQuery(conversationsKey('host'), fetchList, { staleMs: 60_000 })
      return useOpenDm()
    })
    await act(async () => {})
    expect(fetchList).toHaveBeenCalledTimes(1)

    mockRpc.mockResolvedValue({ data: 'conv-1', error: null })
    await act(async () => { await result.current.openDm('amy') })
    expect(fetchList).toHaveBeenCalledTimes(1)

    mockRpc.mockResolvedValue({ data: 'conv-2', error: null })
    await act(async () => { await result.current.openDm('bea') })
    expect(fetchList).toHaveBeenCalledTimes(2)
  })
})

// ─── PeopleTab wiring ───────────────────────────────────────────────────────

function profile(id: string, first: string): Profile {
  return { id, username: id, first_name: first, last_name: 'Test', avatar_url: null } as unknown as Profile
}

function renderPeople(opts: { viewer: string; isOwner: boolean; isHostOrCohost: boolean; silenced?: string[]; paid?: string[] }) {
  const amy = profile('amy', 'Amy')
  const host = profile('host', 'Hank')
  const guest = { id: 'g1', added_by: 'amy', first_name: 'Gus', last_name: 'Guest' } as EventGuest
  const hostGuest = { id: 'g2', added_by: 'host', first_name: 'Hal', last_name: 'Plus' } as EventGuest
  const onMessage = jest.fn()
  const onOpenProfile = jest.fn()
  const onRemoveAttendee = jest.fn()
  const props = {
    event: { max_attendees: null } as never,
    eventStatus: { isOwner: opts.isOwner, count: 4, waitlistCount: 0, isFull: false, isAttending: true, isWaitlisted: false } as never,
    data: {
      userId: opts.viewer,
      refreshing: false,
      refresh: jest.fn(),
      roster: {
        attendees: [host, amy],
        attendingGuests: [guest, hostGuest],
        adderUsernames: { amy: 'amy', host: 'host' },
        requestedProfiles: [],
        waitlistProfiles: [],
        waitlistGuests: [],
      },
    } as never,
    teams: { assignments: {}, numTeams: 2, setNumTeams: jest.fn(), hasTeams: false, savingTeams: false, togglePin: jest.fn(), resetTeams: jest.fn(), randomizeTeams: jest.fn(), saveTeams: jest.fn() } as never,
    drag: { hoveredTeamKey: null, teamZoneRefs: { current: {} }, onDragStart: jest.fn(), onDragMove: jest.fn(), onDragEnd: jest.fn() } as never,
    attendance: { processingRequest: null, approveRequest: jest.fn(), approveFromWaitlist: jest.fn() } as never,
    isHostOrCohost: opts.isHostOrCohost,
    isMobileWeb: false,
    docScrollActive: false,
    onOpenProfile,
    onRemoveAttendee,
    onRemoveGuest: jest.fn(),
    onDeny: jest.fn(),
    onMessage,
    silencedUserIds: new Set(opts.silenced ?? []),
    payments: opts.paid ? { paidUserIds: new Set(opts.paid), refetch: jest.fn() } as never : null,
  }
  render(<PeopleTab {...props} />)
  return { onMessage, onOpenProfile, onRemoveAttendee }
}

describe('PeopleTab roster menu', () => {
  it('a regular attendee sees no ⋯ at all, and tapping a row still opens the profile', () => {
    const { onOpenProfile } = renderPeople({ viewer: 'zed', isOwner: false, isHostOrCohost: false })
    expect(screen.queryByLabelText(/^Actions for/)).toBeNull()
    fireEvent.press(screen.getByText('Amy Test'))
    expect(onOpenProfile).toHaveBeenCalledWith('amy')
  })

  it('the host gets Message → the attendee’s id, via the sheet', () => {
    const { onMessage } = renderPeople({ viewer: 'host', isOwner: true, isHostOrCohost: true })
    fireEvent.press(screen.getByLabelText('Actions for Amy Test'))
    expect(screen.getByLabelText('Remove from event')).toBeTruthy()
    fireEvent.press(screen.getByLabelText('Message'))
    finishSlideOut()
    expect(onMessage).toHaveBeenCalledWith('amy')
  })

  it('the host’s own row has no Message; their own +1 keeps the bare ✕ the e2e targets', () => {
    renderPeople({ viewer: 'host', isOwner: true, isHostOrCohost: true })
    fireEvent.press(screen.getByLabelText('Actions for Hank Test'))
    expect(screen.queryByLabelText('Message')).toBeNull()
    expect(screen.getByLabelText('Remove guest Hal Plus')).toBeTruthy()
    expect(screen.queryByLabelText('Actions for guest Hal Plus')).toBeNull()
  })

  it('another member’s +1 offers to message the member who added them', () => {
    const { onMessage } = renderPeople({ viewer: 'host', isOwner: true, isHostOrCohost: true })
    fireEvent.press(screen.getByLabelText('Actions for guest Gus Guest'))
    fireEvent.press(screen.getByLabelText('Message amy'))
    finishSlideOut()
    expect(onMessage).toHaveBeenCalledWith('amy')
  })

  it('a silenced attendee is not offered Message', () => {
    renderPeople({ viewer: 'host', isOwner: true, isHostOrCohost: true, silenced: ['amy'] })
    fireEvent.press(screen.getByLabelText('Actions for Amy Test'))
    expect(screen.queryByLabelText('Message')).toBeNull()
    expect(screen.getByLabelText('View profile')).toBeTruthy()
  })

  it('a co-host (not owner) gets Message + View profile but no Remove', () => {
    renderPeople({ viewer: 'cohost', isOwner: false, isHostOrCohost: true })
    fireEvent.press(screen.getByLabelText('Actions for Amy Test'))
    expect(screen.getByLabelText('Message')).toBeTruthy()
    expect(screen.queryByLabelText('Remove from event')).toBeNull()
  })
})

describe('PeopleTab "I\'ve paid" badges (#6)', () => {
  it('shows nothing about payment when payments is null (free event / not a host)', () => {
    renderPeople({ viewer: 'zed', isOwner: false, isHostOrCohost: false })
    expect(screen.queryByTestId('roster-paid-summary')).toBeNull()
    expect(screen.queryByTestId('roster-paid-badge')).toBeNull()
  })

  it('hosts see a Paid badge on exactly the players who marked paid, and a count', () => {
    renderPeople({ viewer: 'host', isOwner: true, isHostOrCohost: true, paid: ['amy'] })
    expect(screen.getAllByTestId('roster-paid-badge')).toHaveLength(1)
    expect(screen.getByText(/1 of 2 marked paid/)).toBeTruthy()
  })
})
