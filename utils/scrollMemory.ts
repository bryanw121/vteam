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
  /** Frames to keep trying while content is still laying out (default 30, about half a second). */
  frames?: number
  nextFrame?: (cb: () => void) => void
}

/**
 * Puts a scroll offset back once the target is ready, retrying for a few frames
 * because a just-shown screen (or the document, when doc-scroll turns back on)
 * may not be tall enough yet and the browser clamps the offset.
 */
export function restoreWhenReady({ y, ready, apply, current, frames = 30, nextFrame }: Restore): void {
  const raf = nextFrame ?? ((cb: () => void) => { requestAnimationFrame(() => cb()) })
  let left = frames
  const attempt = () => {
    if (ready()) {
      apply(y)
      if (current() >= y - 1) return
    }
    if (--left > 0) raf(attempt)
  }
  raf(attempt)
}
