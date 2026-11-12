import { ScrollView, TouchableOpacity, View } from 'react-native'
import { Text } from '../../../../components/ui/Text'
import { RefreshControl } from '../../../../components/RefreshControl'
import { useCallback, useState } from 'react'
import { useStackBackTitle } from '../../../../hooks/useStackBackTitle'
import { supabase } from '../../../../lib/supabase'
import { Button } from '../../../../components/Button'
import { Spinner } from '../../../../components/ui'
import { useSession } from '../../../../contexts/session'
import { useMyProfile } from '../../../../hooks/useMyProfile'
import { obfuscateEmail, sendPasswordReset } from '../../../../lib/passwordReset'
import { shared, theme } from '../../../../constants'
import { useRouter } from 'expo-router'
import { routes } from '../../../../utils/routes'
import { toast } from '../../../../lib/toast'

export default function AccountSettingsScreen() {
  useStackBackTitle('Account settings')
  const router = useRouter()
  const [refreshing, setRefreshing] = useState(false)
  const { session } = useSession()
  const email = session?.user?.email ?? null
  const { profile, refetch } = useMyProfile()
  const [resetState, setResetState] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [resetError, setResetError] = useState<string | null>(null)

  async function handleEmailLink() {
    if (!email) return
    setResetError(null)
    setResetState('sending')
    const failure = await sendPasswordReset(email)
    if (failure) {
      setResetState('idle')
      setResetError("Couldn't send the email. Check your connection and try again.")
    } else {
      setResetState('sent')
    }
  }

  const handleRefresh = useCallback(() => {
    setRefreshing(true)
    void (async () => {
      try {
        await refetch({ force: true })
      } finally {
        setRefreshing(false)
      }
    })()
  }, [refetch])

  async function handleSignOut() {
    const { error } = await supabase.auth.signOut()
    if (error) toast.error("Couldn't sign out", error)
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
      <View style={shared.card} testID="account-details">
        <View style={{ gap: 2 }}>
          <Text style={shared.captionStrong}>Username</Text>
          <Text style={shared.body} testID="account-username">{profile ? `@${profile.username}` : '…'}</Text>
        </View>
        <View style={shared.divider} />
        <View style={{ gap: 2 }}>
          <Text style={shared.captionStrong}>Email</Text>
          <Text style={shared.body}>{email ? obfuscateEmail(email) : '—'}</Text>
        </View>
        <View style={shared.divider} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={shared.captionStrong}>Password</Text>
            <Text style={shared.body}>
              {resetState === 'sent' ? 'Check your email for the link' : 'Set a new one by email'}
            </Text>
          </View>
          {email && resetState !== 'sent' && (
            <TouchableOpacity
              onPress={() => void handleEmailLink()}
              disabled={resetState === 'sending'}
              accessibilityRole="button"
              accessibilityLabel="Email me a password reset link"
              style={{ minHeight: 44, minWidth: 44, justifyContent: 'center', paddingHorizontal: theme.spacing.sm }}
              testID="account-password-email-link"
            >
              {resetState === 'sending'
                ? <Spinner size="small" label="Sending" />
                : <Text style={[shared.authLinkText, { color: theme.colors.primaryText }]}>Email link</Text>}
            </TouchableOpacity>
          )}
        </View>
        {resetError && <Text style={[shared.errorText, { marginTop: theme.spacing.sm }]}>{resetError}</Text>}
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
