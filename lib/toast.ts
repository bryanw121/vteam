import { GENERIC_ERROR_MESSAGE, NETWORK_ERROR_MESSAGE } from '../constants/copy'
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

export const toast = {
  show(t: ToastMessage): number {
    current = { variant: 'info', ...t, id: nextId++ }
    emit()
    return current.id
  },
  /**
   * A write that failed: `title` says what ("Couldn't join"), the body says why
   * in words a player can use: offline, or the generic message. Raw database
   * errors are never shown.
   */
  error(title: string, e?: unknown, action?: ToastMessage['action']): number {
    const message = isNetworkError(e) ? NETWORK_ERROR_MESSAGE : GENERIC_ERROR_MESSAGE
    return toast.show({ title, message, variant: 'error', action })
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
