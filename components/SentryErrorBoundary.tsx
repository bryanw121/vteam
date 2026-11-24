import React from 'react'
import * as Sentry from '@sentry/react-native'
import { ErrorFallback } from './ErrorFallback'

type Props = { children: React.ReactNode }

export function SentryErrorBoundary({ children }: Props) {
  return (
    <Sentry.ErrorBoundary
      fallback={({ resetError, error }) => <ErrorFallback resetError={resetError} error={error} />}
    >
      {children}
    </Sentry.ErrorBoundary>
  )
}
