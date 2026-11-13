import { GENERIC_ERROR_MESSAGE, NETWORK_ERROR_MESSAGE, SERVER_DOWN_MESSAGE } from '../constants/copy'
import { serverHealth, TIMEOUT_MESSAGE } from './serverHealth'
import type { ToastMessage } from '../types'

/**
 * The app's one way to tell someone something happened (#228). `Alert.alert`
 * is a no-op in react-native-web, and web is where most players are, so every
 * message goes through here and `ToastHost` (mounted once per route group)
 * draws it. Module-level like `lib/query`, so hooks and `useMutation` handlers
 * can call it without screen state. A queue of one: a new toast replaces the
 * one on screen.
 */
export type ShownToast = ToastMessage & { id: number }

let current: ShownToast | null = null
let nextId = 1
const listeners = new Set<(t: ShownToast | null) => void>()

function emit() {
  listeners.forEach(fn => fn(current))
}

/** Network failures read differently from everything else (offline, cold server). */
export function isNetworkError(e: unknown): boolean {
  const message = e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : String(e ?? '')
  return /network request failed|failed to fetch|fetch failed|load failed|networkerror|timed out|timeout/i.test(message)
}

/**
 * Why a write failed, in words a player can use (#289): the server (our time limit
 * cut it off, or the server is known to be down for server reasons), their own
 * connection, or the generic message. Never a raw database message.
 */
export function failedWriteMessage(e: unknown): string {
  const message = e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : ''
  const health = serverHealth()
  if (message.includes(TIMEOUT_MESSAGE) || (health.status !== 'ok' && health.cause === 'server')) return SERVER_DOWN_MESSAGE
  if (isNetworkError(e) || (health.status !== 'ok' && health.cause === 'network')) return NETWORK_ERROR_MESSAGE
  return GENERIC_ERROR_MESSAGE
}

export const toast = {
  show(t: ToastMessage): number {
    current = { variant: 'info', ...t, id: nextId++ }
    emit()
    return current.id
  },
  /**
   * A write that failed: `title` says what ("Couldn't join"), the body says why
   * in words a player can use (`failedWriteMessage`): the server isn't answering,
   * the connection, or the generic message. Raw database errors are never shown.
   */
  error(title: string, e?: unknown, action?: ToastMessage['action']): number {
    return toast.show({ title, message: failedWriteMessage(e), variant: 'error', action })
  },
  /** Hide the toast on screen (or only `id`, if it is still that one). */
  hide(id?: number) {
    if (!current || (id !== undefined && current.id !== id)) return
    current = null
    emit()
  },
  current(): ShownToast | null {
    return current
  },
  subscribe(fn: (t: ShownToast | null) => void): () => void {
    listeners.add(fn)
    return () => { listeners.delete(fn) }
  },
}

/** Test-only. */
export function __resetToast(): void {
  current = null
  listeners.clear()
}
