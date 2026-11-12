import { useEffect, useState } from 'react'
import { toast, type ShownToast } from '../lib/toast'
import { Toast } from './Toast'

/**
 * Draws whatever `lib/toast` is showing (#228). Mounted once per route group,
 * in `app/(app)/_layout.tsx` and `app/(auth)/_layout.tsx`.
 */
export function ToastHost() {
  const [shown, setShown] = useState<ShownToast | null>(() => toast.current())
  useEffect(() => toast.subscribe(setShown), [])
  if (!shown) return null
  return (
    <Toast
      key={shown.id}
      visible
      message={shown.message}
      title={shown.title}
      variant={shown.variant}
      action={shown.action}
      duration={shown.duration ?? (shown.action ? 8000 : 4000)}
      onHide={() => toast.hide(shown.id)}
    />
  )
}
