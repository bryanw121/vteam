import { toast } from '../lib/toast'
import { GENERIC_ERROR_MESSAGE } from '../constants/copy'

/**
 * Tell the user something, on every platform (#228). Shown as a toast:
 * `Alert.alert` is a no-op in react-native-web, and `window.alert` (used here
 * before) blocks the page and reads like a browser error.
 */
export function notifyInfo(title: string, message?: string): void {
  toast.show(message ? { title, message, variant: 'info' } : { message: title, variant: 'info' })
}

/**
 * Tell the user a write failed. `message` may be the text to show, or the
 * caught error (its message is shown when it has one); otherwise
 * `GENERIC_ERROR_MESSAGE`.
 */
export function notifyError(title: string, message?: unknown): void {
  const text =
    typeof message === 'string' && message
      ? message
      : message instanceof Error && message.message
        ? message.message
        : GENERIC_ERROR_MESSAGE
  toast.show({ title, message: text, variant: 'error' })
}
