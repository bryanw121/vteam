import { useEffect, useState } from 'react'
import { useRouter } from 'expo-router'
import { useSession } from '../contexts/session'
import { useMyProfile } from './useMyProfile'
import { useUserSettings } from './useUserSettings'
import { loadSeenBanners } from '../utils/seenBanners'
import { shouldShowPlayerSetup } from '../utils/playerSetup'
import { routes } from '../utils/routes'

/** Offered at most once per app session, even if it is skipped before the marker saves. */
let offeredThisSession = false

/**
 * Opens player setup (#156) once for a signed-in player whose position, level
 * and home city are all empty and who hasn't finished or skipped it, then
 * returns them to `pathname`. Guests never see it.
 */
export function usePlayerSetupGate(pathname: string): void {
  const router = useRouter()
  const { userId, loading } = useSession()
  const { profile } = useMyProfile()
  const { settings } = useUserSettings()
  const [seenOnDevice, setSeenOnDevice] = useState<ReadonlySet<string> | null>(null)

  useEffect(() => {
    let alive = true
    void loadSeenBanners().then(seen => { if (alive) setSeenOnDevice(seen) })
    return () => { alive = false }
  }, [userId])

  useEffect(() => {
    if (offeredThisSession || loading || !userId || !seenOnDevice) return
    if (pathname.startsWith('/welcome')) return
    const show = shouldShowPlayerSetup({ signedIn: true, profile, settings, seenOnDevice })
    if (!show) return
    offeredThisSession = true
    router.push(routes.welcome(pathname))
  }, [userId, loading, profile, settings, seenOnDevice, pathname, router])
}
