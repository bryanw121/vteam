import { Linking } from 'react-native'

/**
 * Open an outside web page (a venue's booking or sign-up page) in the system
 * browser. Resolves to whether it opened. The web build (openExternalUrl.web.ts)
 * opens a new tab and reports a popup blocker instead.
 */
export async function openExternalUrl(url: string): Promise<boolean> {
  try {
    await Linking.openURL(url)
    return true
  } catch {
    return false
  }
}
