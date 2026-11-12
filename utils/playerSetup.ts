import type { Profile, UserSettings } from '../types'

/**
 * Player setup after sign-up (#156): position, level and home city in three
 * skippable steps, offered once. Finishing or skipping records this id next
 * to the one-time banners (device and account), so it never comes back.
 */
export const PLAYER_SETUP_MARKER = 'player-setup-v1'

export const PLAYER_SETUP_STEPS = ['position', 'level', 'city'] as const

/**
 * Whether to offer setup: a signed-in player whose position, level and home
 * city are all empty, who hasn't finished or skipped it on this device or
 * account. Undecided (null) while the profile or settings are still loading.
 */
export function shouldShowPlayerSetup(args: {
  signedIn: boolean
  profile: Pick<Profile, 'position' | 'skill_level'> | null | undefined
  /** undefined = still loading; null = no settings row yet. */
  settings: Pick<UserSettings, 'home_city_id' | 'seen_banners'> | null | undefined
  seenOnDevice: ReadonlySet<string>
}): boolean | null {
  const { signedIn, profile, settings, seenOnDevice } = args
  if (!signedIn) return false
  if (seenOnDevice.has(PLAYER_SETUP_MARKER)) return false
  if (!profile || settings === undefined) return null
  if (settings?.seen_banners?.includes(PLAYER_SETUP_MARKER)) return false
  const hasPosition = (profile.position?.length ?? 0) > 0
  const hasLevel = !!profile.skill_level
  const hasCity = !!settings?.home_city_id
  return !hasPosition && !hasLevel && !hasCity
}
