import { Platform } from 'react-native'
import { supabase } from '../lib/supabase'
import { getSessionUser } from '../lib/sessionUser'
import { pushDeepLink } from './pushLinks'
import { track } from '../lib/analytics'
import { ANALYTICS_EVENTS } from '../constants/analytics'
import type { NotificationResponse } from 'expo-notifications'
import type * as ExpoNotifications from 'expo-notifications'
import type { PushData, WebPushState } from '../types'

export { pushDeepLink }

/** Pushes already opened in this app session (the launch push is reported again on resubscribe). */
const openedPushes = new Set<string>()

/**
 * Calls `open(path)` when someone taps a push: once for the push that launched
 * the app (cold start), then for every later tap. Returns an unsubscribe.
 * Web has its own version (pushNotifications.web.ts). `load` is for tests.
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
    const data = response.notification.request.content.data as PushData | undefined
    if (data?.notification_type === 'new_game') track(ANALYTICS_EVENTS.gameAlertOpened, { source: 'unknown', via: 'push' })
    const path = pushDeepLink(data)
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

/** Web push lives in pushNotifications.web.ts (#189); the native apps use Expo push above. */
export async function getWebPushState(): Promise<WebPushState> {
  return 'unsupported'
}

export async function enableWebPush(): Promise<WebPushState> {
  return 'unsupported'
}

export async function disableWebPush(): Promise<void> {}

export async function forgetWebPushToken(): Promise<void> {}
