import type { WebPushEnv, WebPushState } from '../types'

/** iPhone / iPad Safari (and iOS Chrome, which is Safari underneath). iPadOS reports a Mac UA with touch. */
export function isAppleMobile(userAgent: string, maxTouchPoints = 0): boolean {
  return /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1)
}

/**
 * Where web push stands (#189). iPhone Safari only allows push for a site
 * added to the Home Screen and opened from there, and doesn't even expose
 * PushManager in a tab, so a tab gets `needs-install`.
 */
export function webPushState(env: WebPushEnv, appleMobile = isAppleMobile(env.userAgent)): WebPushState {
  if (!env.hasKey) return 'unsupported'
  if (appleMobile && !env.standalone) return 'needs-install'
  if (!env.pushSupported || env.permission === null) return 'unsupported'
  if (env.permission === 'denied') return 'blocked'
  if (env.permission === 'granted' && env.subscribed) return 'on'
  return 'ask'
}

/** The VAPID public key (base64url) as the bytes PushManager.subscribe wants. */
export function applicationServerKey(base64url: string): Uint8Array<ArrayBuffer> {
  const b64 = base64url.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((base64url.length + 3) % 4)
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/** A message from public/sw.js after a notification tap, or null. */
export function pushTapLink(message: unknown): string | null {
  if (!message || typeof message !== 'object') return null
  const m = message as { type?: unknown; deep_link?: unknown }
  return m.type === 'vteam-push-tap' && typeof m.deep_link === 'string' ? m.deep_link : null
}
