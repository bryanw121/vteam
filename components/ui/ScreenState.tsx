import { View } from 'react-native'
import { Text } from './Text'
import Ionicons from '@expo/vector-icons/Ionicons'
import { shared, theme } from '../../constants'
import { Button } from '../Button'
import { EmptyState } from './EmptyState'
import type { ScreenStateProps } from '../../types'
import { Spinner } from './Spinner'
import { useServerHealth } from '../../lib/serverHealth'
import { SERVER_DOWN_COPY } from '../../constants/copy'

const GENERIC_ERROR = 'Something went wrong. Check your connection and try again.'

/**
 * One place to decide what a data screen shows. Precedence:
 * loading (with nothing to show yet) > error (with nothing to show yet) > empty > children.
 * Pass `ready` when cached data exists: then neither a refetch nor a failed refetch
 * replaces what is on screen — surface a stale-data error with a toast/banner instead.
 */
export function ScreenState({
  loading, ready, error, onRetry, empty, emptyIcon, emptyTitle, emptyBody,
  emptyActionLabel, onEmptyAction, children,
}: ScreenStateProps) {
  const health = useServerHealth()
  // Nothing to show and the server (or the connection) is down: say so instead of a spinner or a generic error (#289).
  if ((error || loading) && !ready && health.status === 'down') {
    const offline = health.cause === 'network'
    return (
      <EmptyState
        testID="screen-state-server-down"
        icon={offline ? 'cloud-offline-outline' : 'pulse-outline'}
        title={offline ? SERVER_DOWN_COPY.stateOfflineTitle : SERVER_DOWN_COPY.stateTitle}
        body={offline ? SERVER_DOWN_COPY.stateOfflineBody : SERVER_DOWN_COPY.stateBody}
        actionLabel={onRetry ? 'Try again' : undefined}
        onAction={onRetry}
      />
    )
  }

  if (loading && !ready) {
    return (
      <View style={shared.screenStateCenter} testID="screen-state-loading">
        <Spinner color={theme.colors.primary} />
      </View>
    )
  }

  if (error && !ready) {
    return (
      <View style={shared.screenStateCenter} testID="screen-state-error">
        <Ionicons name="cloud-offline-outline" size={36} color={theme.colors.border} />
        <Text style={[shared.caption, shared.emptyStateBody]}>{typeof error === 'string' ? error : GENERIC_ERROR}</Text>
        {onRetry && <Button label="Retry" variant="secondary" size="sm" fullWidth={false} style={{ alignSelf: 'center' }} onPress={onRetry} />}
      </View>
    )
  }

  if (empty) {
    return (
      <EmptyState
        testID="screen-state-empty"
        icon={emptyIcon}
        title={emptyTitle ?? 'Nothing here yet'}
        body={emptyBody}
        actionLabel={emptyActionLabel}
        onAction={onEmptyAction}
      />
    )
  }

  return <>{children}</>
}
