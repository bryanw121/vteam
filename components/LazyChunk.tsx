import React, { Component, Suspense, lazy, useState, type ComponentType, type ReactNode } from 'react'
import { ScreenState } from './ui'
import { NETWORK_ERROR_MESSAGE } from '../constants/copy'
import type { LazyChunkBoundaryProps, LazyChunkBoundaryState } from '../types'

/**
 * Load a component in its own web chunk (`import()`), so it stays out of the
 * entry bundle every visit downloads (#193). Shows `fallback` while the chunk
 * loads; if the download fails (offline, a deploy replaced the chunk), shows
 * an error with Retry, which tries the import again.
 *
 * Use from a `.web.tsx` file only; native imports the component directly.
 */
export function lazyChunk<P extends object>(
  load: () => Promise<{ default: ComponentType<P> }>,
  fallback: ReactNode,
): ComponentType<P> {
  let Lazy = lazy(load)
  function LazyChunk(props: P) {
    const [attempt, setAttempt] = useState(0)
    return (
      <LazyChunkBoundary
        key={attempt}
        onRetry={() => { Lazy = lazy(load); setAttempt(a => a + 1) }}
      >
        <Suspense fallback={fallback}>
          <Lazy {...props} />
        </Suspense>
      </LazyChunkBoundary>
    )
  }
  return LazyChunk
}

/** Error boundaries have to be classes. */
class LazyChunkBoundary extends Component<LazyChunkBoundaryProps, LazyChunkBoundaryState> {
  state: LazyChunkBoundaryState = { failed: false }
  static getDerivedStateFromError(): LazyChunkBoundaryState {
    return { failed: true }
  }
  render() {
    if (this.state.failed) {
      return <ScreenState error={NETWORK_ERROR_MESSAGE} onRetry={this.props.onRetry} />
    }
    return this.props.children
  }
}

/**
 * Fetch a lazy chunk once the page has loaded and the browser is idle, so the
 * first visit to its screen doesn't wait for the download. Web only; a no-op
 * during the static export (no window).
 */
export function preloadWhenIdle(load: () => Promise<unknown>, delayMs = 3000): void {
  if (typeof window === 'undefined') return
  const whenIdle = (fn: () => void) =>
    'requestIdleCallback' in window ? window.requestIdleCallback(fn, { timeout: 5000 }) : setTimeout(fn, 1)
  const preload = () => setTimeout(() => whenIdle(() => { void load().catch(() => {}) }), delayMs)
  if (document.readyState === 'complete') preload()
  else window.addEventListener('load', preload, { once: true })
}
