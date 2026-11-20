import { Platform } from 'react-native'
import { renderHook } from '@testing-library/react-native'
import { teamColor, teamColorName, teamTint, TEAM_COLORS } from '../constants'

/** #332: the one drag-and-pin gesture both roster cards (players and +1s) use. */

const calls: string[] = []
jest.mock('react-native-gesture-handler', () => {
  function gesture(kind: string) {
    const g: Record<string, unknown> = new Proxy({}, {
      get: (_t, key) => (key === 'then' ? undefined : (...args: unknown[]) => { calls.push(`${kind}.${String(key)}(${args.filter(a => typeof a !== 'function').join(',')})`); return g }),
    })
    return g
  }
  return { Gesture: { Pan: () => gesture('pan'), Tap: () => gesture('tap') } }
})

import { useDraggableCard } from '../hooks/event/useDraggableCard'

const callbacks = { onDragStart: jest.fn(), onDragMove: jest.fn(), onDragEnd: jest.fn(), onTogglePin: jest.fn() }
const original = Platform.OS

afterEach(() => {
  calls.length = 0
  Object.defineProperty(Platform, 'OS', { value: original })
})

function activation(os: 'web' | 'ios', isOwner: boolean) {
  Object.defineProperty(Platform, 'OS', { value: os })
  renderHook(() => useDraggableCard(isOwner, callbacks))
  return calls
}

describe('useDraggableCard', () => {
  it('web: a 5px click-drag starts the drag', () => {
    const c = activation('web', true)
    expect(c).toContain('pan.minDistance(5)')
    expect(c.some(x => x.startsWith('pan.activateAfterLongPress'))).toBe(false)
  })

  it('native: a 500 ms long press first, so the list still scrolls', () => {
    const c = activation('ios', true)
    expect(c).toContain('pan.activateAfterLongPress(500)')
  })

  it('only the host can drag or pin', () => {
    expect(activation('web', false)).toEqual(expect.arrayContaining(['pan.enabled(false)', 'tap.enabled(false)']))
    calls.length = 0
    expect(activation('web', true)).toEqual(expect.arrayContaining(['pan.enabled(true)', 'tap.enabled(true)']))
  })
})

describe('team colours', () => {
  it('cycles colours and names from team 1', () => {
    expect(teamColor(1)).toBe(TEAM_COLORS[0])
    expect(teamColor(TEAM_COLORS.length + 1)).toBe(TEAM_COLORS[0])
    expect(teamColorName(2)).toBe('Red')
  })

  it('tints a team colour by use', () => {
    expect(teamTint('#6C47FF', 'avatar')).toBe('#6C47FF18')
    expect(teamTint('#6C47FF', 'zone')).toBe('#6C47FF14')
    expect(teamTint('#6C47FF', 'zoneLine')).toBe('#6C47FF60')
  })
})
