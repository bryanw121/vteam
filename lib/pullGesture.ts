/**
 * Pull-to-refresh gesture for web (#35). react-native-web's RefreshControl is a
 * prop-stripping stub, so `components/RefreshControl.web.tsx` drives this
 * instead. Pure state machine so the thresholds are unit-testable without a DOM.
 *
 * A pull starts only when the touch begins with every scroll owner at offset 0
 * (the nested ScrollView, or `window` in doc-scroll mode). The first decisive
 * movement picks the axis: horizontal (Pager swipe, chip strip) or upward
 * abandons the pull, so those gestures behave exactly as before.
 */

/** Pull distance (after resistance) that triggers a refresh on release. */
export const PULL_TRIGGER = 64
/** The indicator never travels further than this. */
export const PULL_MAX = 96
/** Content follows the finger at this fraction of the drag (rubber band). */
export const PULL_RESISTANCE = 0.45
/** Finger travel before the axis is decided; below it a touch is still a tap. */
const AXIS_SLOP = 6

export type PullState =
  | { phase: 'idle' }
  | { phase: 'armed'; startX: number; startY: number }
  | { phase: 'pulling'; startY: number; pull: number }

export const IDLE: PullState = { phase: 'idle' }

/** `atTop`: every scroll owner under the finger is at offset 0. */
export function pullStart(atTop: boolean, touches: number, x: number, y: number): PullState {
  if (!atTop || touches !== 1) return IDLE
  return { phase: 'armed', startX: x, startY: y }
}

/** Returns the next state; the caller should `preventDefault()` while it is `pulling`. */
export function pullMove(state: PullState, touches: number, x: number, y: number): PullState {
  if (state.phase === 'idle' || touches !== 1) return IDLE
  const dy = y - state.startY
  if (state.phase === 'armed') {
    const dx = x - state.startX
    if (Math.abs(dx) < AXIS_SLOP && Math.abs(dy) < AXIS_SLOP) return state
    if (Math.abs(dx) >= Math.abs(dy) || dy <= 0) return IDLE
  }
  return { phase: 'pulling', startY: state.startY, pull: Math.min(Math.max(dy, 0) * PULL_RESISTANCE, PULL_MAX) }
}

/** True when releasing in `state` should call `onRefresh`. */
export function pullEnd(state: PullState): boolean {
  return state.phase === 'pulling' && state.pull >= PULL_TRIGGER
}
