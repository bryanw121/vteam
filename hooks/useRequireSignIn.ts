import { useCallback } from 'react'
import { usePathname, useRouter } from 'expo-router'
import { useSession } from '../contexts/session'
import { returnPath, setPostSignInRedirect } from '../utils/authGate'
import { routes } from '../utils/routes'

/**
 * Open the sign-in (or sign-up) screen and remember where to come back to.
 *
 * Uses `replace`, not `push`: the auth screens leave with a `replace` too, so a
 * pushed login would leave the guest's old app tree mounted underneath — stale,
 * still signed out, and reachable with a back swipe.
 */
export function useGoToSignIn() {
  const router = useRouter()
  const pathname = usePathname()
  return useCallback((screen: 'login' | 'register' = 'login', returnTo?: string) => {
    setPostSignInRedirect(returnTo ?? returnPath(pathname))
    router.replace(screen === 'login' ? routes.login() : routes.register())
  }, [router, pathname])
}

/**
 * For actions that need an account (join, host, message). Returns a guard:
 * `if (!requireSignIn()) return` — signed-in users pass straight through; guests
 * go to login and come back to `returnTo` (default: the current page).
 */
export function useRequireSignIn() {
  const { userId } = useSession()
  const goToSignIn = useGoToSignIn()
  return useCallback((returnTo?: string): boolean => {
    if (userId) return true
    goToSignIn('login', returnTo)
    return false
  }, [userId, goToSignIn])
}
