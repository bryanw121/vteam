import React, { useState } from 'react'
import { View, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native'
import { useRouter, Stack } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Text } from '../../ui/Text'
import { BackButton, ScreenHeader, ScreenState } from '../../ui'
import { useSession } from '../../../contexts/session'
import { theme } from '../../../constants'
import { routes } from '../../../utils/routes'
import { toast } from '../../../lib/toast'
import { firstInvalidStep } from '../../../utils/tournamentDraft'
import { useTournamentDraft } from '../../../hooks/tournament/useTournamentDraft'
import { useSaveTournament, useUpdateTournament } from '../../../hooks/tournament/useSaveTournament'
import { useTournamentEdit } from '../../../hooks/tournament/useTournamentEdit'
import { tournamentSavedMessage } from '../../../constants/tournamentCopy'
import { StepIndicator } from './CreateBits'
import { BasicsStep } from './BasicsStep'
import { FormatStep } from './FormatStep'
import { RegistrationStep } from './RegistrationStep'
import { RulesStep } from './RulesStep'
import { PreviewStep } from './PreviewStep'
import type { TournamentSaveStatus, TournamentWizardProps } from '../../../types'

/**
 * The tournament wizard (#325), for a new tournament or, with `editId`, the host
 * changing one (#402). The draft and its rules live in `useTournamentDraft` /
 * `utils/tournamentDraft`, each step is a section in `components/tournament/create`,
 * and saving is one `save_tournament` or `update_tournament` call.
 */
export function TournamentWizard({ editId = null }: TournamentWizardProps) {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { userId } = useSession()
  const edit = useTournamentEdit(editId, userId)
  const wizard = useTournamentDraft(userId, edit.seed)
  const { draft, update, step, isLastStep, goNext, clubs } = wizard
  const save = useSaveTournament()
  const saveEdit = useUpdateTournament(editId ?? '')
  const [newHostId, setNewHostId] = useState<string | null>(null)

  function goBack() {
    if (wizard.goBack()) return
    if (router.canGoBack()) router.back()
    else router.replace(routes.app())
  }

  async function handleSave(status: TournamentSaveStatus) {
    const invalid = firstInvalidStep(draft)
    if (invalid) { toast.show({ title: 'Missing info', message: invalid.message, variant: 'warning' }); return }
    if (!userId) { toast.show({ title: 'Sign in required', message: 'Sign in to create a tournament.', variant: 'info' }); return }
    // A failed save toasts from the hook and leaves nothing written.
    const id = await save.mutate({ draft, status })
    if (id) router.replace(routes.tournament(id))
  }

  async function handleSaveEdit() {
    if (!editId) return
    const invalid = firstInvalidStep(draft)
    if (invalid) { toast.show({ title: 'Missing info', message: invalid.message, variant: 'warning' }); return }
    const told = await saveEdit.mutate({ id: editId, draft, newHostId })
    if (told === undefined) return
    toast.show({ message: tournamentSavedMessage(told), variant: 'success' })
    router.replace(routes.tournament(editId))
  }

  if (editId && (edit.loading || edit.error || edit.notFound || edit.notHost)) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.background, paddingTop: insets.top }}>
        <Stack.Screen options={{ headerShown: false }} />
        <ScreenHeader title="Edit tournament" onBack={goBack} />
        <ScreenState
          loading={edit.loading}
          error={edit.error ? 'Could not load this tournament.' : edit.notFound ? 'This tournament is gone.' : edit.notHost ? 'Only the host can edit this tournament.' : null}
          ready={false}
          onRetry={edit.error ? edit.retry : undefined}
        >
          {null}
        </ScreenState>
      </View>
    )
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <Stack.Screen options={{ headerShown: false }} />

      {/* Custom header */}
      <View style={{
        paddingTop: insets.top + 8, paddingBottom: 4,
        paddingHorizontal: 16,
        borderBottomWidth: 1, borderBottomColor: theme.colors.border,
        backgroundColor: theme.colors.background,
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <BackButton variant="pill" onPress={goBack} />
          <Text style={{ fontFamily: theme.fonts.displaySemiBold, fontSize: theme.font.size.base, color: theme.colors.text }}>
            {editId ? 'Edit tournament' : 'Create Tournament'}
          </Text>
          <View style={{ width: 44 }} />
        </View>
        <StepIndicator current={step} />
      </View>

      {step === 0 && (
        <BasicsStep
          draft={draft}
          update={update}
          clubs={clubs}
          clubsLoading={wizard.clubsLoading}
          clubsError={wizard.clubsError}
          onRetryClubs={wizard.retryClubs}
        />
      )}
      {step === 1 && <FormatStep draft={draft} update={update} />}
      {step === 2 && <RegistrationStep draft={draft} update={update} />}
      {step === 3 && <RulesStep draft={draft} update={update} />}
      {step === 4 && (
        <PreviewStep
          draft={draft}
          clubs={clubs}
          onSaveDraft={() => void handleSave('draft')}
          onPublish={() => void handleSave('published')}
          saving={save.isPending || saveEdit.isPending}
          edit={editId ? { players: edit.players, newHostId, setNewHostId, onSave: () => void handleSaveEdit() } : undefined}
        />
      )}

      {/* Bottom nav: hidden on the preview step (it has its own buttons) */}
      {!isLastStep && (
        <View style={{
          paddingHorizontal: 20, paddingTop: 12,
          paddingBottom: Math.max(insets.bottom, 16),
          borderTopWidth: 1, borderTopColor: theme.colors.border,
          backgroundColor: theme.colors.background,
          flexDirection: 'row', gap: 12,
        }}>
          <TouchableOpacity
            onPress={goBack}
            style={{ flex: 1, padding: 14, borderRadius: theme.radius.full, backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border, alignItems: 'center' }}
          >
            <Text style={{ fontFamily: theme.fonts.bodyMedium, fontSize: theme.font.size.lgs, color: theme.colors.text }}>Back</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={goNext}
            style={{ flex: 2, padding: 14, borderRadius: theme.radius.full, backgroundColor: theme.colors.primary, alignItems: 'center' }}
          >
            <Text style={{ fontFamily: theme.fonts.displaySemiBold, fontSize: theme.font.size.lgs, color: theme.colors.onPrimary }}>Continue</Text>
          </TouchableOpacity>
        </View>
      )}
    </KeyboardAvoidingView>
  )
}
