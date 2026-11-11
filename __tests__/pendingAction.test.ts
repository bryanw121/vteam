import {
  PENDING_ACTION_TTL_MS,
  __resetPendingAction,
  clearPendingAction,
  joinFlowHoldsPlayerSetup,
  peekPendingAction,
  setPendingAction,
  shouldOfferJoin,
  takePendingAction,
} from '../utils/pendingAction'
import type { PendingAction } from '../types'

const T0 = Date.parse('2026-11-14T15:00:00Z')
const action = (over: Partial<PendingAction> = {}): PendingAction => ({
  kind: 'join', eventId: 'e1', title: 'Sunday Sand at Butler', startsAt: '2026-11-15T15:00:00', at: T0, ...over,
})

beforeEach(() => {
  __resetPendingAction()
  clearPendingAction()
})

describe('pending join (#229)', () => {
  it('is peeked by the sign-up screen without being used up', () => {
    setPendingAction(action())
    expect(peekPendingAction(T0 + 1000)?.title).toBe('Sunday Sand at Butler')
    expect(peekPendingAction(T0 + 2000)).not.toBeNull()
  })

  it('is handed over once, to its own event only', () => {
    setPendingAction(action())
    expect(takePendingAction('other', T0)).toBeNull()
    expect(takePendingAction('e1', T0)).toEqual({ status: 'ok', action: action() })
    expect(takePendingAction('e1', T0)).toBeNull()
    expect(peekPendingAction(T0)).toBeNull()
  })

  it('expires after 30 minutes', () => {
    setPendingAction(action())
    expect(peekPendingAction(T0 + PENDING_ACTION_TTL_MS + 1)).toBeNull()
    expect(takePendingAction('e1', T0 + PENDING_ACTION_TTL_MS + 1)).toEqual({ status: 'expired' })
  })

  it('is cleared on sign-out', () => {
    setPendingAction(action())
    clearPendingAction()
    expect(takePendingAction('e1', T0)).toBeNull()
  })

  it('holds player setup while pending, and for the session once resumed', () => {
    expect(joinFlowHoldsPlayerSetup(T0)).toBe(false)
    setPendingAction(action())
    expect(joinFlowHoldsPlayerSetup(T0)).toBe(true)
    takePendingAction('e1', T0)
    expect(joinFlowHoldsPlayerSetup(T0 + 10 * PENDING_ACTION_TTL_MS)).toBe(true)
  })

  it('a pending join that expired no longer holds setup', () => {
    setPendingAction(action())
    expect(joinFlowHoldsPlayerSetup(T0 + PENDING_ACTION_TTL_MS + 1)).toBe(false)
  })
})

describe('shouldOfferJoin', () => {
  const none = { isAttending: false, isWaitlisted: false, isRequested: false, isDenied: false, isFull: false, isOwner: false }
  const open = { cancelled: false, over: false, requiresApproval: false }

  it('offers the same signup the Join button would', () => {
    expect(shouldOfferJoin(none, open)).toBe('join')
    expect(shouldOfferJoin({ ...none, isFull: true }, open)).toBe('waitlist')
    expect(shouldOfferJoin(none, { ...open, requiresApproval: true })).toBe('request')
    expect(shouldOfferJoin({ ...none, isFull: true }, { ...open, requiresApproval: true })).toBe('waitlist')
  })

  it('offers nothing when already going, waitlisted, requested, denied or hosting', () => {
    for (const key of ['isAttending', 'isWaitlisted', 'isRequested', 'isDenied', 'isOwner'] as const) {
      expect(shouldOfferJoin({ ...none, [key]: true }, open)).toBeNull()
    }
  })

  it('offers nothing for a game that is over or cancelled', () => {
    expect(shouldOfferJoin(none, { ...open, over: true })).toBeNull()
    expect(shouldOfferJoin(none, { ...open, cancelled: true })).toBeNull()
  })
})
