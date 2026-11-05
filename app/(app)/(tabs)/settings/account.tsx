import { Alert, ScrollView, View } from 'react-native'
import { Text } from '../../../../components/ui/Text'
import { RefreshControl } from '../../../../components/RefreshControl'
import { useCallback, useState } from 'react'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useStackBackTitle } from '../../../../hooks/useStackBackTitle'
import { supabase } from '../../../../lib/supabase'
import { Button } from '../../../../components/Button'
import { shared, theme } from '../../../../constants'
import { useRouter } from 'expo-router'
import { routes } from '../../../../utils/routes'

export default function AccountSettingsScreen() {
  useStackBackTitle('Account settings')
  const router = useRouter()
  const [refreshing, setRefreshing] = useState(false)

  const handleRefresh = useCallback(() => {
    setRefreshing(true)
    void (async () => {
      try {
        await supabase.auth.getSession()
      } finally {
        setRefreshing(false)
      }
    })()
  }, [])

  async function handleSignOut() {
    const { error } = await supabase.auth.signOut()
    if (error) Alert.alert('Error', error.message)
  }

  return (
    <ScrollView
      style={shared.screen}
      contentContainerStyle={[shared.scrollContentSubpage, { flexGrow: 1 }]}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.colors.primary} />
      }
    >
      <View style={[shared.card, { alignItems: 'center', gap: theme.spacing.md, paddingVertical: theme.spacing.xl }]}>
        <Ionicons name="construct-outline" size={36} color={theme.colors.subtext} />
        <View style={{ alignItems: 'center', gap: theme.spacing.xs }}>
          <Text style={shared.subheading}>Coming soon</Text>
          <Text style={[shared.caption, { textAlign: 'center' }]}>
            Account settings like email and password changes are on the way.
          </Text>
        </View>
      </View>

      <View style={[shared.card, { marginTop: theme.spacing.md }]}>
        <Button label="Sign out" onPress={handleSignOut} variant="danger" />
      </View>

      <View style={[shared.card, { marginTop: theme.spacing.md, gap: theme.spacing.sm }]}>
        <Text style={shared.subheading}>Delete account</Text>
        <Text style={shared.caption}>
          Permanently delete your account and data. You'll see exactly what happens to your clubs, tournaments and events before anything is deleted.
        </Text>
        <Button
          label="Delete account…"
          variant="secondary"
          onPress={() => router.push(routes.settings('delete-account'))}
          testID="open-delete-account"
        />
      </View>
    </ScrollView>
  )
}
