import { useEffect, useState } from 'react'
import { useRouter } from 'expo-router'
import { useSession } from '../contexts/session'
import { useMyProfile } from './useMyProfile'
import { useUserSettings } from './useUserSettings'
import { loadSeenBanners } from '../utils/seenBanners'
import { shouldShowPlayerSetup } from '../utils/playerSetup'
import { routes } from '../utils/routes'
import { joinFlowHoldsPlayerSetup } from '../utils/pendingAction'

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
    // A guest finishing a join (#229) sees the game first; setup is offered after it, on the event.
    if (joinFlowHoldsPlayerSetup()) return
    const show = shouldShowPlayerSetup({ signedIn: true, profile, settings, seenOnDevice })
    if (!show) return
    offeredThisSession = true
    router.push(routes.welcome(pathname))
  }, [userId, loading, profile, settings, seenOnDevice, pathname, router])
}

/**
 * Whether player setup would be offered to the signed-in viewer (#229: the join
 * sheet offers it after a resumed join, instead of `/welcome` over the game).
 */
export function usePlayerSetupNeeded(): boolean {
  const { userId } = useSession()
  const { profile } = useMyProfile()
  const { settings } = useUserSettings()
  const [seenOnDevice, setSeenOnDevice] = useState<ReadonlySet<string> | null>(null)
  useEffect(() => {
    let alive = true
    void loadSeenBanners().then(seen => { if (alive) setSeenOnDevice(seen) })
    return () => { alive = false }
  }, [userId])
  if (!userId || !seenOnDevice) return false
  return shouldShowPlayerSetup({ signedIn: true, profile, settings, seenOnDevice }) === true
}
