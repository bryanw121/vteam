import { Platform } from 'react-native'
import { supabase } from '../lib/supabase'
import { getSessionUser } from '../lib/sessionUser'
import { isAppPath, routes } from './routes'
import type { NotificationResponse } from 'expo-notifications'
import type * as ExpoNotifications from 'expo-notifications'
import type { PushData } from '../types'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Pushes already opened in this app session (the launch push is reported again on resubscribe). */
const openedPushes = new Set<string>()

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

/**
 * Calls `open(path)` when someone taps a push: once for the push that launched
 * the app (cold start), then for every later tap. Returns an unsubscribe.
 * No-op on web (no push there). `load` is for tests.
 */
export function subscribeToPushTaps(
  open: (path: string) => void,
  load: () => Promise<Pick<typeof ExpoNotifications, 'addNotificationResponseReceivedListener' | 'getLastNotificationResponseAsync'>> = () => import('expo-notifications'),
): () => void {
  if (Platform.OS === 'web') return () => {}
  let cancelled = false
  let remove: (() => void) | null = null
  const handle = (response: NotificationResponse | null | undefined) => {
    if (!response || cancelled) return
    // The launch response is also delivered to the listener on some platforms,
    // and stays "last" for the whole session: open each push once.
    const id = response.notification.request.identifier
    if (openedPushes.has(id)) return
    openedPushes.add(id)
    const path = pushDeepLink(response.notification.request.content.data as PushData | undefined)
    if (path) open(path)
  }
  void load()
    .then(async Notifications => {
      if (cancelled) return
      const sub = Notifications.addNotificationResponseReceivedListener(handle)
      remove = () => sub.remove()
      handle(await Notifications.getLastNotificationResponseAsync())
    })
    .catch(() => { /* push unavailable (e.g. Expo Go): nothing to route */ })
  return () => {
    cancelled = true
    remove?.()
  }
}

/** Test-only. */
export function __resetOpenedPushes(): void {
  openedPushes.clear()
}

/**
 * Registers for Expo push notifications and saves the token to the push_tokens table.
 * Call once after the user is authenticated.
 * On web or simulator, this is a no-op.
 */
export async function registerPushToken(): Promise<void> {
  if (Platform.OS === 'web') return

  try {
    const Device = await import('expo-device')
    if (!Device.default.isDevice) return // Simulators can't receive push notifications

    const Notifications = await import('expo-notifications')

    // Configure how notifications are shown when app is foregrounded
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    })

    const { status: existingStatus } = await Notifications.getPermissionsAsync()
    let finalStatus = existingStatus

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync()
      finalStatus = status
    }

    if (finalStatus !== 'granted') return

    const tokenData = await Notifications.getExpoPushTokenAsync()
    const token = tokenData.data

    const user = await getSessionUser()
    if (!user) return

    await supabase
      .from('push_tokens')
      .upsert({
        user_id: user.id,
        token,
        platform: Platform.OS as 'ios' | 'android',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'token' })
  } catch {
    // Non-critical — push notifications are best-effort
  }
}
