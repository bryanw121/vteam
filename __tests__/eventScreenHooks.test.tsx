import { act, renderHook, waitFor } from '@testing-library/react-native'
import { __resetPendingAction, setPendingAction } from '../utils/pendingAction'
import { useJoinIntent } from '../hooks/event/useJoinIntent'
import { useLeaveFlow } from '../hooks/event/useLeaveFlow'
import { useEventRecap } from '../hooks/event/useEventRecap'
import { eventDateMs } from '../hooks/event/derive'
import { joinIntentWhen } from '../utils/eventDetail'
import type { AttendanceStatus, EventAttendanceApi, EventAttendeeWithProfile, EventWithDetails } from '../types'

const mockTrack = jest.fn()
jest.mock('../lib/analytics', () => ({ track: (...a: unknown[]) => mockTrack(...a) }))
let mockSetupNeeded = false
jest.mock('../hooks/usePlayerSetupGate', () => ({ usePlayerSetupNeeded: () => mockSetupNeeded }))
const mockToastShow = jest.fn()
const mockToastError = jest.fn()
jest.mock('../lib/toast', () => ({ toast: { show: (...a: unknown[]) => mockToastShow(...a), error: (...a: unknown[]) => mockToastError(...a) } }))
jest.mock('../hooks/useMyGameRecap', () => ({ useMyGameRecap: () => ({ data: { cheers: 4, gamesThisYear: 7, pointsPaid: null } }) }))
jest.mock('../hooks/useHostNextGame', () => ({ useHostNextGame: () => ({ data: null }) }))
let mockFromRecap = false
jest.mock('../hooks/useUrlParam', () => ({ useUrlParam: () => [mockFromRecap, jest.fn()] }))
const mockShareRecap = jest.fn()
jest.mock('../utils/shareRecap', () => ({ shareRecap: (...a: unknown[]) => mockShareRecap(...a) }))

const FUTURE = '2030-01-05T16:00:00'
const event = {
  id: 'e1', title: 'Sand Doubles', event_date: FUTURE, duration_minutes: 120, created_by: 'host',
  cancelled_at: null, requires_approval: false, max_attendees: 8, price: null, event_tags: [{ tags: { name: 'Tournament' } }],
} as unknown as EventWithDetails
const STATUS: AttendanceStatus = {
  count: 3, spotsLeft: 5, isFull: false, isAttending: false, isOwner: false, isWaitlisted: false,
  waitlistPosition: null, waitlistCount: 0, isRequested: false, isDenied: false, denialReason: null,
}
function attendanceApi(over: Partial<EventAttendanceApi> = {}): EventAttendanceApi {
  return { join: jest.fn(async () => ({ id: 'row' })), joinWaitlist: jest.fn(async () => ({ id: 'row' })), requestToJoin: jest.fn(async () => ({ id: 'row' })), leave: jest.fn(async () => null), ...over } as unknown as EventAttendanceApi
}

beforeEach(() => {
  jest.clearAllMocks()
  __resetPendingAction()
  mockSetupNeeded = false
  mockFromRecap = false
})

describe('useJoinIntent', () => {
  const base = { eventId: 'e1', userId: 'me', event, loading: false, status: STATUS, over: false, requiresApproval: false }

  it('offers the spot once when a guest Join was saved for this game', () => {
    setPendingAction({ kind: 'join', eventId: 'e1', title: 'Sand Doubles', startsAt: FUTURE, at: Date.now() })
    const { result } = renderHook(() => useJoinIntent({ ...base, attendance: attendanceApi() }))
    expect(result.current.joinIntent).toEqual({ stage: 'offer', offer: 'join' })
    expect(result.current.when).toBe(joinIntentWhen(eventDateMs(FUTURE)))
  })

  it('offers nothing without a saved Join, and waits for the signed-in view', () => {
    const { result, rerender } = renderHook((p: { loading: boolean }) => useJoinIntent({ ...base, loading: p.loading, attendance: attendanceApi() }), { initialProps: { loading: true } })
    setPendingAction({ kind: 'join', eventId: 'e1', title: 'Sand Doubles', startsAt: FUTURE, at: Date.now() })
    expect(result.current.joinIntent).toBeNull()
    rerender({ loading: false })
    expect(result.current.joinIntent).toEqual({ stage: 'offer', offer: 'join' })
  })

  it('records an expired Join without offering it', () => {
    setPendingAction({ kind: 'join', eventId: 'e1', title: 'Sand Doubles', startsAt: FUTURE, at: 0 })
    const { result } = renderHook(() => useJoinIntent({ ...base, attendance: attendanceApi() }))
    expect(result.current.joinIntent).toBeNull()
    expect(mockTrack).toHaveBeenCalledWith('join_intent_resumed', { outcome: 'expired' })
  })

  it('joins with one tap, then offers setup to a new player', async () => {
    mockSetupNeeded = true
    setPendingAction({ kind: 'join', eventId: 'e1', title: 'Sand Doubles', startsAt: FUTURE, at: Date.now() })
    const attendance = attendanceApi()
    const { result } = renderHook(() => useJoinIntent({ ...base, attendance }))
    await act(async () => { await result.current.confirm() })
    expect(attendance.join).toHaveBeenCalled()
    expect(result.current.joinIntent).toEqual({ stage: 'setup', offer: 'join' })
    expect(mockTrack).toHaveBeenCalledWith('join_intent_resumed', { outcome: 'joined', offer: 'join' })
  })

  it('Not now closes the offer and records it', () => {
    setPendingAction({ kind: 'join', eventId: 'e1', title: 'Sand Doubles', startsAt: FUTURE, at: Date.now() })
    const { result } = renderHook(() => useJoinIntent({ ...base, attendance: attendanceApi() }))
    act(() => result.current.dismiss())
    expect(result.current.joinIntent).toBeNull()
    expect(mockTrack).toHaveBeenCalledWith('join_intent_resumed', { outcome: 'not_now', offer: 'join' })
  })
})

describe('useLeaveFlow', () => {
  const base = { event, userId: 'me', status: { ...STATUS, isAttending: true }, isHostOrCohost: false, iPaid: false, hostName: 'Hana' }

  it('freezes the sheet when it opens, and cancel closes it', () => {
    const { result } = renderHook(() => useLeaveFlow({ ...base, attendance: attendanceApi(), sendDm: jest.fn(), openDm: jest.fn() }))
    act(() => result.current.open())
    expect(result.current.sheet).not.toBeNull()
    expect(mockTrack).toHaveBeenCalledWith('leave_sheet_shown', expect.objectContaining({ paid: false }))
    act(() => result.current.cancel())
    expect(result.current.sheet).toBeNull()
  })

  it('leaves, then sends the note to the host', async () => {
    const sendDm = jest.fn(async () => true)
    const attendance = attendanceApi()
    const { result } = renderHook(() => useLeaveFlow({ ...base, attendance, sendDm, openDm: jest.fn() }))
    act(() => result.current.open())
    await act(async () => { await result.current.confirm('work', 'Sorry, stuck late') })
    expect(attendance.leave).toHaveBeenCalled()
    expect(sendDm).toHaveBeenCalledWith('host', expect.stringContaining('Sorry, stuck late'))
    expect(result.current.sheet).toBeNull()
  })

  it('sends no note when the leave failed', async () => {
    const sendDm = jest.fn(async () => true)
    const { result } = renderHook(() => useLeaveFlow({ ...base, attendance: attendanceApi({ leave: jest.fn(async () => undefined) } as Partial<EventAttendanceApi>), sendDm, openDm: jest.fn() }))
    await act(async () => { await result.current.confirm(null, 'note') })
    expect(sendDm).not.toHaveBeenCalled()
  })

  it('offers Message host when the note could not be sent', async () => {
    const { result } = renderHook(() => useLeaveFlow({ ...base, attendance: attendanceApi(), sendDm: jest.fn(async () => false), openDm: jest.fn() }))
    await act(async () => { await result.current.confirm(null, 'note') })
    expect(mockToastShow).toHaveBeenCalledWith(expect.objectContaining({ variant: 'error', action: expect.objectContaining({ label: expect.any(String) }) }))
  })
})

describe('useEventRecap', () => {
  const rows = [{ user_id: 'me', status: 'attending', no_show: false }] as unknown as EventAttendeeWithProfile[]

  it('shows Your game to a player who attended a finished game, once per event', () => {
    const { result, rerender } = renderHook(() => useEventRecap({ eventId: 'e1', userId: 'me', event, rows, over: true }))
    rerender({})
    expect(result.current.attended).toBe(true)
    expect(result.current.points).toBe(5)
    expect(mockTrack.mock.calls.filter(c => c[0] === 'recap_shown')).toHaveLength(1)
  })

  it('not before the game is over, nor to a no-show', () => {
    expect(renderHook(() => useEventRecap({ eventId: 'e1', userId: 'me', event, rows, over: false })).result.current.attended).toBe(false)
    const noShow = [{ user_id: 'me', status: 'attending', no_show: true }] as unknown as EventAttendeeWithProfile[]
    expect(renderHook(() => useEventRecap({ eventId: 'e1', userId: 'me', event, rows: noShow, over: true })).result.current.attended).toBe(false)
  })

  it('counts a ?r=1 link once', () => {
    mockFromRecap = true
    const { rerender } = renderHook(() => useEventRecap({ eventId: 'e1', userId: 'me', event, rows, over: true }))
    rerender({})
    expect(mockTrack.mock.calls.filter(c => c[0] === 'recap_link_opened')).toHaveLength(1)
  })

  it('shares the picture with a link back to the game', async () => {
    mockShareRecap.mockResolvedValue('download')
    const { result } = renderHook(() => useEventRecap({ eventId: 'e1', userId: 'me', event, rows, over: true }))
    await act(async () => { await result.current.share() })
    expect(mockShareRecap).toHaveBeenCalledWith(expect.objectContaining({ link: expect.stringContaining('/event/e1?r=1') }))
    expect(mockTrack).toHaveBeenCalledWith('recap_shared', { target: 'download' })
    await waitFor(() => expect(result.current.sharing).toBe(false))
  })
})
