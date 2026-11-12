import { useEffect, useState } from 'react'
import { AccessibilityInfo } from 'react-native'

/** The OS "reduce motion" setting (prefers-reduced-motion on web), kept current. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    let mounted = true
    AccessibilityInfo.isReduceMotionEnabled()
      .then(value => { if (mounted) setReduced(value) })
      .catch(() => {})
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', value => setReduced(value))
    return () => {
      mounted = false
      sub?.remove?.()
    }
  }, [])
  return reduced
}
