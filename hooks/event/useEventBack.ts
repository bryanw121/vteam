import { useCallback } from 'react'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { routes, isAppPath, toRoute } from '../../utils/routes'

/**
 * Back from the event page. back() first: it cleanly pops the event screen, so a stale screen
 * can't make a later push load the wrong event. replace() only for direct URL loads (no
 * history), to `?from=` when it is an app path, else Events. Shared by the screen and the web
 * loading fallback (#306), so Back works the same before the screen's chunk arrives.
 */
export function useEventBack(): () => void {
  const router = useRouter()
  const { from } = useLocalSearchParams<{ from?: string }>()
  return useCallback(() => {
    if (router.canGoBack()) router.back()
    else {
      const back = from ? decodeURIComponent(from) : null
      router.replace(isAppPath(back) ? toRoute(back) : routes.events())
    }
  }, [router, from])
}
