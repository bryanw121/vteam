import { useEffect, useState } from 'react'
import { Pressable, ScrollView, Switch, View } from 'react-native'
import { useRouter } from 'expo-router'
import { Text } from '../../../../components/ui/Text'
import { useStackBackTitle } from '../../../../hooks/useStackBackTitle'
import { useTabsShell } from '../../../../contexts/tabs'
import { isUsageSharingOn, setUsageSharing } from '../../../../lib/analytics'
import { routes } from '../../../../utils/routes'
import { shared, theme } from '../../../../constants'

/** Settings → Privacy: Share usage data on this device (on by default; see the Privacy Policy). */
export default function PrivacySettingsScreen() {
  useStackBackTitle('Privacy')
  const router = useRouter()
  const { tabBarHeight } = useTabsShell()
  const [on, setOn] = useState<boolean | null>(null)

  useEffect(() => {
    let live = true
    void isUsageSharingOn().then(v => { if (live) setOn(v) })
    return () => { live = false }
  }, [])

  const change = (value: boolean) => {
    setOn(value)
    void setUsageSharing(value)
  }

  return (
    <View style={shared.screen}>
      <ScrollView contentContainerStyle={[shared.scrollContentSubpage, { paddingBottom: tabBarHeight + theme.spacing.xl }]}>
        <View style={[shared.card, { gap: theme.spacing.sm }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, minHeight: 44 }}>
            <Text style={[shared.body, { flex: 1, fontFamily: theme.fonts.bodySemiBold }]}>Share usage data</Text>
            <Switch
              testID="usage-sharing-switch"
              accessibilityLabel="Share usage data"
              value={on ?? true}
              disabled={on === null}
              onValueChange={change}
              trackColor={{ false: theme.colors.border, true: theme.colors.primary + '88' }}
              thumbColor={on !== false ? theme.colors.primary : theme.colors.card}
            />
          </View>
          <Text style={shared.caption}>
            Helps us see which screens get used and when the app is busiest. We record screen types, your platform and
            app version, and when the app is open: never what you type, which events or profiles you look at, or where
            you are.
          </Text>
          <Text style={shared.caption}>
            Turning it off stops it from this device. Only vteam admins can see it, and the details are kept 180 days.
          </Text>
          <Pressable
            onPress={() => router.push(routes.privacy())}
            accessibilityRole="link"
            style={{ minHeight: 44, justifyContent: 'center' }}
            testID="usage-sharing-policy"
          >
            <Text style={[shared.body, { color: theme.colors.primaryText, fontFamily: theme.fonts.bodySemiBold }]}>Read the Privacy Policy</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  )
}
