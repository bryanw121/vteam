import React from 'react'
import { View } from 'react-native'
import { useRouter, useSegments } from 'expo-router'
import { WebStackContentTransition } from '../../../../components/WebStackContentTransition'
import { ScreenHeader } from '../../../../components/ui'
import { SETTINGS_KICKER, SETTINGS_SCREENS, shared } from '../../../../constants'
import { routes } from '../../../../utils/routes'
import { settingsScreenKey } from '../../../../utils/settingsScreens'

/**
 * Every settings page gets the same header (#377): ScreenHeader with a 44-pt Back, drawn here
 * once instead of the native stack header (system font, a 30-pt arrow, and no title at all on
 * desktop). Back goes back, or to Profile when there's nothing to go back to (a link or a reload).
 */
export default function SettingsLayout() {
  const router = useRouter()
  const screen = SETTINGS_SCREENS[settingsScreenKey(useSegments())]
  const goBack = () => (router.canGoBack() ? router.back() : router.replace(routes.profile()))
  return (
    <View style={shared.screen}>
      {screen && <ScreenHeader kicker={screen.kicker ?? SETTINGS_KICKER} title={screen.title} onBack={goBack} />}
      <WebStackContentTransition />
    </View>
  )
}
