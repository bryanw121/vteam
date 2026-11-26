/**
 * Helpers for DocScrollView's web scroll memory (see components/DocScrollView).
 * No React Native imports, so they unit-test without a renderer.
 */

/**
 * Last scroll offset per screen (`memoryKey`), for this page load. Module-level
 * so it outlives a remount: the browser's back remounts the tab screens.
 */
const offsets = new Map<string, number>()

export function rememberScroll(key: string, y: number): void {
  offsets.set(key, Math.max(0, y))
}

/** The remembered offset, or 0. */
export function recallScroll(key: string): number {
  return offsets.get(key) ?? 0
}

/** Forget every remembered offset (on sign-out, and between tests). */
export function clearScrollMemory(): void {
  offsets.clear()
}

/** Whether a DOM node is displayed (a display:none ancestor gives it no box). */
export function isShown(node: { offsetHeight: number } | null | undefined): boolean {
  return !!node && node.offsetHeight > 0
}

type Restore = {
  /** The offset to go back to. */
  y: number
  /** True once the scroll target can take the offset (e.g. doc-scroll is back on). */
  ready: () => boolean
  apply: (y: number) => void
  /** The target's current offset, to tell whether `apply` took. */
  current: () => number
  /**
   * Frames to keep trying while content is still laying out (default 90, about 1.5 s: the
   * event page's lower cards can arrive after half a second and clamp the offset short).
   */
  frames?: number
  nextFrame?: (cb: () => void) => void
  /** Called once when the offset took or the frames ran out. */
  onDone?: () => void
}

/**
 * Puts a scroll offset back once the target is ready, retrying for a few frames
 * because a just-shown screen (or the document, when doc-scroll turns back on)
 * may not be tall enough yet and the browser clamps the offset.
 */
export function restoreWhenReady({ y, ready, apply, current, frames = 90, nextFrame, onDone }: Restore): void {
  const raf = nextFrame ?? ((cb: () => void) => { requestAnimationFrame(() => cb()) })
  let left = frames
  /** Where our last apply left the offset: if it moves without us, the player scrolled. */
  let landed: number | null = null
  const attempt = () => {
    if (landed !== null && Math.abs(current() - landed) > 1) { onDone?.(); return }
    if (ready()) {
      apply(y)
      landed = current()
      if (landed >= y - 1) { onDone?.(); return }
    }
    if (--left > 0) raf(attempt)
    else onDone?.()
  }
  // Try now first: a frame painted at the wrong offset before the jump is the flicker this avoids.
  attempt()
}

/**
 * Memory key for one event tab: the browser's Back remounts the event screen, and
 * without a key it came back at the top (#376). Each tab keeps its own offset.
 */
export function eventScrollKey(eventId: string, tab: 'details' | 'people'): string {
  return `event:${eventId}:${tab}`
}
