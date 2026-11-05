import { Linking, Platform, View } from 'react-native'
import { Text } from './ui/Text'
import { Button } from './Button'
import { shared, theme } from '../constants'
import type { UpdateRequirement } from '../types'

type Props = { requirement: UpdateRequirement }

/** Full-screen block shown when this install is older than the minimum supported version. */
export function UpdateRequiredScreen({ requirement }: Props) {
  const isWeb = Platform.OS === 'web'

  function handleUpdate() {
    if (isWeb) {
      if (typeof window !== 'undefined') window.location.reload()
      return
    }
    if (requirement.storeUrl) void Linking.openURL(requirement.storeUrl)
  }

  return (
    <View style={shared.updateRequiredContainer}>
      <Text style={shared.updateRequiredTitle}>Update vteam</Text>
      <Text style={shared.updateRequiredBody}>
        {requirement.message ??
          (isWeb
            ? 'A new version of vteam is available. Reload to get it.'
            : 'This version of vteam is no longer supported. Update to keep joining games.')}
      </Text>
      <Text style={shared.updateRequiredVersion}>
        You have {requirement.current} · minimum {requirement.minimum}
      </Text>
      {(isWeb || requirement.storeUrl) && (
        <View style={{ alignSelf: 'stretch', marginTop: theme.spacing.lg }}>
          <Button label={isWeb ? 'Reload' : 'Update now'} onPress={handleUpdate} />
        </View>
      )}
    </View>
  )
}
