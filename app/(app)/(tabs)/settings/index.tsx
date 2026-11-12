import { useEffect } from 'react'
import { useNavigation, useRouter } from 'expo-router'
import { routes } from '../../../../utils/routes'

/**
 * Settings are reached from the profile's menu cards, each at its own address
 * (`/settings/history`). This index only steps back out when it ends up in the
 * stack on the way back from a Settings page; opened directly (a typed or shared
 * `/settings`), there is nothing to go back to, so it opens Profile instead of a blank page.
 */
export default function SettingsIndexScreen() {
  const navigation = useNavigation()
  const router = useRouter()
  useEffect(() => {
    if (navigation.canGoBack()) navigation.goBack()
    else router.replace(routes.profile())
  }, [navigation, router])
  return null
}
