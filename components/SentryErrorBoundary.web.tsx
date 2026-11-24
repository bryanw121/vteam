import React from 'react'
import { Sentry } from '../lib/sentry'
import { ErrorFallback } from './ErrorFallback'
import { isChunkLoadError } from '../utils/staleBuild'

type Props = { children: React.ReactNode }
type State = { error: Error | null }

/**
 * Web: the same boundary and fallback as native, without importing the Sentry
 * SDK (it loads lazily on web, see lib/sentry.web.ts). Render errors are
 * reported through the lazy client, queued until it has loaded. A class
 * component because React has no hook for error boundaries.
 */
export class SentryErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // A screen's code a deploy took away (#359): ErrorFallback moves the tab to the
    // new build and `app_updated_in_tab` counts it; it isn't a bug to report.
    if (isChunkLoadError(error)) {
      Sentry.addBreadcrumb({ category: 'stale-build', message: error.message.slice(0, 200), level: 'info' })
      return
    }
    Sentry.captureException(error, { contexts: { react: { componentStack: info.componentStack ?? '' } } })
  }

  resetError = (): void => {
    this.setState({ error: null })
  }

  render() {
    if (this.state.error) return <ErrorFallback resetError={this.resetError} error={this.state.error} />
    return this.props.children
  }
}
