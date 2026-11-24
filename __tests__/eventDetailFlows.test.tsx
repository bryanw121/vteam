import { act, renderHook } from '@testing-library/react-native'
import type { Profile } from '../types'
import { joinIntentDecision, joinIntentWhen, mentionProfiles, mentionableUsers, usernameIds } from '../utils/eventDetail'
import { useEventDialog } from '../hooks/event/useEventDialog'

const person = (id: string, username: string, first = username) =>
  ({ id, username, first_name: first, last_name: null }) as unknown as Profile

const ana = person('a', 'ana', 'Ana')
const ben = person('b', 'ben', 'Ben')
const host = person('h', 'hosty', 'Hana')

describe('mentions (#354)', () => {
  it('lists attendees, then co-hosts, then the host', () => {
    expect(mentionProfiles({ attendees: [ana], cohostProfiles: [null, ben], host }).map(p => p.id)).toEqual(['a', 'b', 'h'])
  })

  it('shows each person once and never the viewer', () => {
    const users = mentionableUsers([ana, ben, ana, host, null], 'b')
    expect(users.map(u => u.id)).toEqual(['a', 'h'])
    expect(users[0]).toMatchObject({ username: 'ana' })
  })

  it('maps usernames to ids', () => {
    expect(usernameIds([ana, undefined, host]).get('hosty')).toBe('h')
  })
})

describe('joinIntentDecision (#229)', () => {
  const status = { isAttending: false, isWaitlisted: false, isRequested: false, isDenied: false, isFull: false, isOwner: false }
  const open = { cancelled: false, over: false, requiresApproval: false }

  it('does nothing when no join was saved', () => {
    expect(joinIntentDecision(null, status, open)).toEqual({ outcome: 'none' })
  })

  it('reports an expired intent', () => {
    expect(joinIntentDecision({ status: 'expired' } as never, status, open)).toEqual({ outcome: 'expired' })
  })

  it('skips a game that is over or the viewer is already on', () => {
    const taken = { status: 'ok', action: { kind: 'join' } } as never
    expect(joinIntentDecision(taken, status, { ...open, over: true }).outcome).toBe('skipped')
    expect(joinIntentDecision(taken, { ...status, isAttending: true }, open).outcome).toBe('skipped')
  })

  it('formats when the game is', () => {
    expect(joinIntentWhen(null)).toBe('')
    expect(joinIntentWhen('2026-11-14T22:00:00')).toMatch(/^Sat 4:00 PM$/)
  })
})

describe('useEventDialog', () => {
  it('holds one dialog at a time', () => {
    const { result } = renderHook(() => useEventDialog())
    expect(result.current.dialog).toBeNull()
    act(() => result.current.open({ kind: 'guest' }))
    expect(result.current.dialog?.kind).toBe('guest')
    act(() => result.current.open({ kind: 'deny', userId: 'a', displayName: 'Ana' }))
    expect(result.current.dialog).toEqual({ kind: 'deny', userId: 'a', displayName: 'Ana' })
    act(() => result.current.close())
    expect(result.current.dialog).toBeNull()
  })
})
