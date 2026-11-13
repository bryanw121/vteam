import { isAppPath, routes } from './routes'
import type { PushData } from '../types'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Where tapping a push should go, or null to just open the app. Every push
 * from send-notification-push carries `data.deep_link` (the inbox row's link);
 * older send-chat-push builds carry only `conversation_id`. A link that is not
 * an in-app path (see `isAppPath`) is ignored, never followed.
 */
export function pushDeepLink(data: PushData | null | undefined): string | null {
  if (!data) return null
  if (isAppPath(data.deep_link)) return data.deep_link
  if (typeof data.conversation_id === 'string' && UUID_RE.test(data.conversation_id)) return routes.conversation(data.conversation_id)
  if (typeof data.event_id === 'string' && UUID_RE.test(data.event_id)) return routes.event(data.event_id)
  return null
}

