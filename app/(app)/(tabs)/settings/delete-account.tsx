import { useState } from 'react'
import { ScrollView, View } from 'react-native'
import { Text } from '../../../../components/ui/Text'
import { useRouter } from 'expo-router'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useStackBackTitle } from '../../../../hooks/useStackBackTitle'
import { DELETE_CONFIRMATION, useAccountDeletion } from '../../../../hooks/useAccountDeletion'
import { Button } from '../../../../components/Button'
import { Input } from '../../../../components/Input'
import { ScreenState } from '../../../../components/ui'
import { DeletionPlanList } from '../../../../components/profile/DeletionPlanList'
import { ReauthCard } from '../../../../components/profile/ReauthCard'
import { shared, theme } from '../../../../constants'
import { routes } from '../../../../utils/routes'
import { notifyInfo } from '../../../../utils/notify'
import { useTabsShell } from '../../../../contexts/tabs'

/**
 * Settings → Account → Delete account. Shows exactly which clubs, tournaments
 * and upcoming events will be deleted, cancelled or handed to whom, then asks
 * the person to type DELETE before the delete-account function runs.
 */
export default function DeleteAccountScreen() {
  useStackBackTitle('Delete account')
  const router = useRouter()
  const { tabBarHeight } = useTabsShell()
  const {
    plan, isLoading, error, refetch, deleteAccount, isDeleting, deleteError,
    email, needsReauth, block, reauthWithPassword, sendReauthCode, verifyReauthCode,
  } = useAccountDeletion()
  const [typed, setTyped] = useState('')
  const confirmed = typed.trim().toUpperCase() === DELETE_CONFIRMATION

  async function handleDelete() {
    if (!confirmed || !plan?.hash) return
    const done = await deleteAccount({ confirmation: DELETE_CONFIRMATION, planHash: plan.hash })
    if (!done) return
    router.replace(routes.events())
    notifyInfo('Account deleted', 'Your vteam account and its data have been deleted.')
  }

  return (
    <ScrollView
      style={shared.screen}
      contentContainerStyle={[shared.scrollContentSubpage, { gap: theme.spacing.md, paddingBottom: tabBarHeight + theme.spacing.xl }]}
      keyboardShouldPersistTaps="handled"
    >
      <View style={[shared.card, { gap: theme.spacing.sm }]}>
        <View style={[shared.row, { gap: theme.spacing.sm }]}>
          <Ionicons name="warning-outline" size={22} color={theme.colors.error} />
          <Text style={shared.subheading}>This can't be undone</Text>
        </View>
        <Text style={shared.body}>
          Deleting your account removes your profile, photos, messages, comments, RSVPs and settings.
          Your points and any ad-free time you bought with them are lost too.
          Past events you hosted and kudos you gave stay for the people involved, without your name.
        </Text>
      </View>

      <ScreenState
        loading={isLoading}
        ready={!!plan}
        error={error ? 'Could not check what your account owns. Please try again.' : null}
        onRetry={() => void refetch({ force: true })}
      >
        {plan && <DeletionPlanList plan={plan} />}
      </ScreenState>

      {plan && needsReauth && (
        <ReauthCard email={email} onPassword={reauthWithPassword} onSendCode={sendReauthCode} onVerifyCode={verifyReauthCode} />
      )}

      {plan && !needsReauth && (
        <View style={[shared.card, { gap: theme.spacing.sm }]}>
          <Input
            label={`Type ${DELETE_CONFIRMATION} to confirm`}
            value={typed}
            onChangeText={setTyped}
            placeholder={DELETE_CONFIRMATION}
            autoCapitalize="characters"
            autoCorrect={false}
            testID="delete-account-confirm-input"
          />
          {deleteError && block !== 'reauth_required' && (
            <Text style={[shared.caption, { color: theme.colors.error }]}>
              {block === 'plan_changed' ? 'Something changed since you opened this screen. Review the list above, then confirm again.' : deleteError.message}
            </Text>
          )}
          <Button
            label="Delete my account"
            variant="danger"
            onPress={() => void handleDelete()}
            loading={isDeleting}
            disabled={!confirmed || isDeleting}
          />
        </View>
      )}
    </ScrollView>
  )
}
