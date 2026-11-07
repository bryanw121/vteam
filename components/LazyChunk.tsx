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
