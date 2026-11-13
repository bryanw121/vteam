/**
 * Web Push (#189): the browser side of what pushNotifications.ts does with
 * Expo on the phones. The service worker is public/sw.js; the edge functions
 * encrypt to the keys saved here (push_tokens platform 'web').
 *
 * Permission is only ever asked from a tap (`enableWebPush`): iPhone requires
 * it, and an unprompted dialog teaches people to press Block.
 */
import { supabase } from '../lib/supabase'
import { getSessionUser } from '../lib/sessionUser'
import { env } from '../lib/env'
import { track } from '../lib/analytics'
import { ANALYTICS_EVENTS } from '../constants/analytics'
import { pushDeepLink } from './pushLinks'
import { applicationServerKey, isAppleMobile, pushTapLink, webPushState } from './webPushState'
import type { WebPushEnv, WebPushState } from '../types'

export { pushDeepLink }

const SW_URL = '/sw.js'

function hasPushApi(): boolean {
  return typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!hasPushApi()) return null
  try {
    return (await navigator.serviceWorker.getRegistration(SW_URL)) ?? null
  } catch {
    return null
  }
}

async function currentEnv(): Promise<WebPushEnv> {
  const nav = typeof navigator !== 'undefined' ? navigator : null
  const standalone = !!(nav as (Navigator & { standalone?: boolean }) | null)?.standalone
    || (typeof window !== 'undefined' && !!window.matchMedia?.('(display-mode: standalone)').matches)
  const pushSupported = hasPushApi()
  const reg = pushSupported ? await registration() : null
  const sub = reg ? await reg.pushManager.getSubscription().catch(() => null) : null
  return {
    userAgent: nav?.userAgent ?? '',
    standalone,
    pushSupported,
    permission: typeof Notification !== 'undefined' ? Notification.permission : null,
    subscribed: !!sub,
    hasKey: !!env.vapidPublicKey,
  }
}

export async function getWebPushState(): Promise<WebPushState> {
  const e = await currentEnv()
  return webPushState(e, isAppleMobile(e.userAgent, typeof navigator !== 'undefined' ? navigator.maxTouchPoints : 0))
}

async function saveSubscription(sub: PushSubscription): Promise<boolean> {
  const user = await getSessionUser()
  if (!user) return false
  const json = sub.toJSON()
  const keys = json.keys ?? {}
  if (!json.endpoint || !keys.p256dh || !keys.auth) return false
  const { error } = await supabase.from('push_tokens').upsert({
    user_id: user.id,
    token: json.endpoint,
    platform: 'web',
    web_keys: { p256dh: keys.p256dh, auth: keys.auth },
    updated_at: new Date().toISOString(),
  }, { onConflict: 'token' })
  return !error
}

/**
 * Turn push on for this browser: must run inside a tap handler. Returns the
 * state afterwards (`on`, or `blocked` if they said no).
 */
export async function enableWebPush(): Promise<WebPushState> {
  if (!hasPushApi() || !env.vapidPublicKey) return 'unsupported'
  // Ask first, while the tap still counts as a user gesture (Safari is strict).
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    track(ANALYTICS_EVENTS.webPushBlocked, { permission })
    return permission === 'denied' ? 'blocked' : 'ask'
  }
  try {
    const reg = (await registration()) ?? await navigator.serviceWorker.register(SW_URL, { scope: '/' })
    await navigator.serviceWorker.ready
    const sub = (await reg.pushManager.getSubscription())
      ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: applicationServerKey(env.vapidPublicKey) })
    if (!(await saveSubscription(sub))) return 'ask'
    track(ANALYTICS_EVENTS.webPushEnabled, {})
    return 'on'
  } catch {
    return 'ask'
  }
}

/** Turn push off for this browser: unsubscribe and forget the token. */
export async function disableWebPush(): Promise<void> {
  const reg = await registration()
  const sub = reg ? await reg.pushManager.getSubscription().catch(() => null) : null
  if (!sub) return
  const endpoint = sub.endpoint
  await sub.unsubscribe().catch(() => false)
  await supabase.from('push_tokens').delete().eq('token', endpoint)
}

/**
 * Before signing out: drop this browser's token so the next person on it
 * doesn't get this account's pushes. The subscription stays, so signing back
 * in saves it again without asking (registerPushToken).
 */
export async function forgetWebPushToken(): Promise<void> {
  try {
    const reg = await registration()
    const sub = reg ? await reg.pushManager.getSubscription() : null
    if (sub) await supabase.from('push_tokens').delete().eq('token', sub.endpoint)
  } catch {
    // Signing out must not fail over this.
  }
}

/**
 * On sign-in: if this browser already allowed push and is subscribed, save the
 * subscription again (endpoints rotate, and a new account on the same browser
 * takes it over). Never asks for permission.
 */
export async function registerPushToken(): Promise<void> {
  try {
    if (!hasPushApi() || !env.vapidPublicKey || Notification.permission !== 'granted') return
    const reg = await registration()
    const sub = reg ? await reg.pushManager.getSubscription() : null
    if (sub) await saveSubscription(sub)
  } catch {
    // Best-effort, like the native version.
  }
}

/** Taps on a web notification: the service worker posts the deep link to an open window. */
export function subscribeToPushTaps(open: (path: string) => void): () => void {
  if (!hasPushApi()) return () => {}
  const onMessage = (event: MessageEvent) => {
    const link = pushTapLink(event.data)
    const path = link ? pushDeepLink({ deep_link: link }) : null
    if (path) open(path)
  }
  navigator.serviceWorker.addEventListener('message', onMessage)
  // A tap that opened a new window lands on the deep link itself: nothing to route.
  return () => navigator.serviceWorker.removeEventListener('message', onMessage)
}

/** Test-only (parity with the native module). */
export function __resetOpenedPushes(): void {}
