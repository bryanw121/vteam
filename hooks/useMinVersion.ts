import { useMemo } from 'react'
import { Platform } from 'react-native'
import { useStartupConfig } from '../lib/startupConfig'
import { currentAppVersion, isBelowMinimum } from '../utils/appVersion'
import type { UpdateRequirement } from '../types'

/**
 * Checks the platform's min_version once per launch, from the startup config
 * (#216). Returns an UpdateRequirement when this install is older, otherwise null.
 * Fails open: if the config can't be read, the app runs as usual.
 */
export function useMinVersion(): UpdateRequirement | null {
  const config = useStartupConfig()
  return useMemo(() => {
    const platform = Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : 'web'
    const row = config?.appConfig.find(r => r.platform === platform)
    if (!row) return null
    const current = currentAppVersion()
    return isBelowMinimum(current, row.min_version)
      ? { current, minimum: row.min_version, storeUrl: row.store_url, message: row.message }
      : null
  }, [config])
}
