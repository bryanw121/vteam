import React from 'react'
import { View, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native'
import { useRouter, Stack } from 'expo-router'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Text } from '../../../components/ui/Text'
import { useSession } from '../../../contexts/session'
import { theme } from '../../../constants'
import { routes } from '../../../utils/routes'
import { toast } from '../../../lib/toast'
import { firstInvalidStep } from '../../../utils/tournamentDraft'
import { useTournamentDraft } from '../../../hooks/tournament/useTournamentDraft'
import { useSaveTournament } from '../../../hooks/tournament/useSaveTournament'
import { StepIndicator } from '../../../components/tournament/create/CreateBits'
import { BasicsStep } from '../../../components/tournament/create/BasicsStep'
import { FormatStep } from '../../../components/tournament/create/FormatStep'
import { RegistrationStep } from '../../../components/tournament/create/RegistrationStep'
import { RulesStep } from '../../../components/tournament/create/RulesStep'
import { PreviewStep } from '../../../components/tournament/create/PreviewStep'
import type { TournamentSaveStatus } from '../../../types'

/**
 * Create a tournament (#325): a five-step wizard. The draft and its rules live
 * in `useTournamentDraft` / `utils/tournamentDraft`, each step is a section in
 * `components/tournament/create`, and saving is one `save_tournament` call.
 */
export default function TournamentCreateScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { userId } = useSession()
  const wizard = useTournamentDraft(userId)
  const { draft, update, step, isLastStep, goNext, clubs } = wizard
  const save = useSaveTournament()

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
          <TouchableOpacity onPress={goBack} hitSlop={8} style={{ padding: 4 }} accessibilityRole="button" accessibilityLabel="Back">
            <Ionicons name="chevron-back" size={24} color={theme.colors.text} />
          </TouchableOpacity>
          <Text style={{ fontFamily: theme.fonts.displaySemiBold, fontSize: theme.font.size.base, color: theme.colors.text }}>
            Create Tournament
          </Text>
          <View style={{ width: 32 }} />
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
          saving={save.isPending}
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
            style={{ flex: 1, padding: 14, borderRadius: 14, backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border, alignItems: 'center' }}
          >
            <Text style={{ fontFamily: theme.fonts.bodyMedium, fontSize: theme.font.size.lgs, color: theme.colors.text }}>Back</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={goNext}
            style={{ flex: 2, padding: 14, borderRadius: 14, backgroundColor: theme.colors.primary, alignItems: 'center' }}
          >
            <Text style={{ fontFamily: theme.fonts.displaySemiBold, fontSize: theme.font.size.lgs, color: theme.colors.onPrimary }}>Continue</Text>
          </TouchableOpacity>
        </View>
      )}
    </KeyboardAvoidingView>
  )
}
