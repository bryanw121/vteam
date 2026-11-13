import React, { useRef, useState } from 'react'
import { ScrollView, View, TouchableOpacity } from 'react-native'
import { Text } from '../../components/ui/Text'
import { RefreshControl } from '../../components/RefreshControl'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useLocalSearchParams, useRouter, Stack } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { Sentry } from '../../lib/sentry'
import { invalidate, queryKey } from '../../lib/query'
import { toast } from '../../lib/toast'
import { HostFormSkeleton } from '../../components/host/HostFormSkeleton'
import { TemplatesView } from '../../components/host/TemplatesView'
import { TypeSection } from '../../components/host/TypeSection'
import { BasicsSection } from '../../components/host/BasicsSection'
import { PlayersSection } from '../../components/host/PlayersSection'
import { DetailsSection } from '../../components/host/DetailsSection'
import { BringItemsSection } from '../../components/host/BringItemsSection'
import { ApprovalSection } from '../../components/host/ApprovalSection'
import { RepeatSection } from '../../components/host/RepeatSection'
import { ClubSection } from '../../components/host/ClubSection'
import { SaveTemplateSection } from '../../components/host/SaveTemplateSection'
import { HostResultModal } from '../../components/host/HostResultModal'
import { HostSubmitButton } from '../../components/host/HostSubmitButton'
import { ScreenState } from '../../components/ui'
import { shared, theme, GENERIC_ERROR_MESSAGE } from '../../constants'
import { routes } from '../../utils/routes'
import { useSession } from '../../contexts/session'
import { useHostContext } from '../../hooks/host/useHostContext'
import { useHostForm } from '../../hooks/host/useHostForm'
import { useHostBringList } from '../../hooks/host/useHostBringList'
import { useSaveEvent } from '../../hooks/host/useSaveEvent'
import { eventDates, formWithTemplate } from '../../utils/hostForm'
import { draftsFromTemplate, templateBringItems } from '../../utils/bringList'
import { defaultRecurrenceEndDate } from '../../utils/recurrence'
import type { HostSaveOutcome, UserEventTemplate } from '../../types'

/**
 * Create or edit an event (#188): composition only. The form's state and edit
 * loading are in useHostForm, its reads in useHostContext, What to bring in
 * useHostBringList, the save (one save_event transaction) in useSaveEvent,
 * the pure rules in utils/hostForm and each card in components/host.
 */
export default function HostEventScreen() {
  const router = useRouter()
  function goBack() {
    if (router.canGoBack()) router.back()
    else router.replace(routes.app())
  }
  const {
    mode: modeParam, edit: editParam, maxAttendees, location, surface, clubId: clubIdParam, date, title, pollId: pollIdParam,
  } = useLocalSearchParams<{
    mode?: string; edit?: string; maxAttendees?: string; location?: string; surface?: string
    clubId?: string; date?: string; title?: string; pollId?: string
  }>()
  const editId = typeof editParam === 'string' && editParam ? editParam : null
  const isEdit = !!editId
  const clubFromLink = typeof clubIdParam === 'string' && clubIdParam ? clubIdParam : null
  const { userId, loading: sessionLoading } = useSession()

  const [view, setView] = useState<'form' | 'templates'>(modeParam === 'templates' ? 'templates' : 'form')
  // A club poll's winning time (#175) or Book a court opens Host with fields filled in (formFromParams).
  const {
    seed, form, setForm, setField, recurrence, setRecurrence, selectedTagIds, setSelectedTagIds, toggleTag,
    selectedClubId, setSelectedClubId, editState, loadEdit, reloadEdit, reset,
  } = useHostForm({ editId, params: { maxAttendees, location, surface, date, title }, clubIdParam: clubFromLink, userId, sessionLoading })
  const bring = useHostBringList(editId, userId)
  const { tags: availableTags, tagsLoading, ownedClubs, recentVenues, templatesQuery, refetchAll } = useHostContext(userId, view === 'templates')
  const saveMutation = useSaveEvent()

  const [loading, setLoading] = useState(false)
  const [successModal, setSuccessModal] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')
  /** Drives the result modal's body copy and whether it reads as a failure. */
  const [saveOutcome, setSaveOutcome] = useState<HostSaveOutcome>('saved')
  const [saveAsTemplate, setSaveAsTemplate] = useState(false)
  const [templateName, setTemplateName] = useState('')
  const [hostPullRefreshing, setHostPullRefreshing] = useState(false)
  /** The poll this new event answers; cleared once linked (or if the club changes). */
  const pollIdRef = useRef(!isEdit && typeof pollIdParam === 'string' && pollIdParam ? pollIdParam : null)

  // Only the edit row gates the form: tags, clubs and venues fill in when they land.
  const initialLoading = editState === 'loading' || (isEdit && sessionLoading && !seed)

  async function refreshHostContext() {
    setHostPullRefreshing(true)
    try {
      // Pull to refresh is an explicit ask for the server's copy.
      await Promise.all([refetchAll(), reloadEdit()])
    } finally {
      setHostPullRefreshing(false)
    }
  }

  function applyUserTemplate(t: UserEventTemplate) {
    setForm(prev => formWithTemplate(prev, t))
    bring.change(draftsFromTemplate(t.bring_items))
    setView('form')
  }

  function showResult(outcome: HostSaveOutcome, message: string) {
    setSaveOutcome(outcome)
    setSuccessMessage(message)
    setSuccessModal(true)
  }

  async function handleSubmit() {
    if (!userId) return
    if (!isEdit && eventDates(form, recurrence).length === 0) {
      showResult('failed', 'The recurrence settings produced no valid dates. Check the end date.')
      return
    }
    setLoading(true)
    try {
      // One transaction (save_event): the event rows, their tags and any waitlist
      // promotion either all land or none do.
      const ids = await saveMutation.mutate({ editId, form, recurrence, tagIds: selectedTagIds, clubId: selectedClubId })
      if (!ids || ids.length === 0) {
        showResult('failed', GENERIC_ERROR_MESSAGE)
        return
      }

      // What to bring, the poll link and the template are conveniences: each
      // reports its own failure and never undoes the game.
      if (editId) {
        if (bring.changedSinceSaved()) await bring.save([editId], true, form.surface)
        showResult('saved', 'Event updated!')
        return
      }

      if (bring.drafts.length > 0) await bring.save(ids, false, form.surface)

      // Answered a club poll (#175): link the first game to it, so the poll shows "Game posted".
      const pollId = pollIdRef.current
      if (pollId && selectedClubId && selectedClubId === clubFromLink) {
        const { error: linkError } = await supabase.rpc('link_poll_event', { p_post_id: pollId, p_event_id: ids[0] })
        if (linkError) Sentry.captureException(linkError)
        else invalidate(queryKey('club', selectedClubId))
        pollIdRef.current = null
      }

      if (saveAsTemplate && (templateName.trim() || form.title)) {
        const { error: templateError } = await supabase.from('user_event_templates').insert({
          user_id: userId,
          name: templateName.trim() || form.title,
          title: form.title,
          description: form.description || null,
          location: form.location || null,
          max_attendees: form.maxAttendees,
          // TEMPORARY cast: bring_items isn't in types/database.ts until it is regenerated from live after merge (#256).
          ...({ bring_items: templateBringItems(bring.drafts) } as object),
        })
        if (templateError) {
          Sentry.captureException(templateError)
          toast.error("Event saved, but the template wasn't", templateError)
        } else {
          invalidate(queryKey('templates'))
        }
      }

      showResult('saved', ids.length > 1 ? `${ids.length} events created!` : 'Event created!')
      reset()
      bring.reset()
      setSaveAsTemplate(false)
      setTemplateName('')
    } finally {
      setLoading(false)
    }
  }

  const eventCount = recurrence.enabled ? eventDates(form, recurrence).length : 1

  // ── Templates view ────────────────────────────────────────────────────────
  if (view === 'templates') {
    return (
      <TemplatesView
        templates={templatesQuery.data}
        loading={templatesQuery.isLoading}
        error={templatesQuery.error ? 'Could not load your templates. Check your connection and try again.' : null}
        refreshing={hostPullRefreshing}
        onRefresh={() => void refreshHostContext()}
        onRetry={() => void templatesQuery.refetch({ force: true })}
        onPick={applyUserTemplate}
      />
    )
  }

  // ── Form view ─────────────────────────────────────────────────────────────
  if (editState === 'error') {
    return (
      <>
        <Stack.Screen options={{ title: '' }} />
        <View style={[shared.screen, shared.centered]}>
          <ScreenState error="Could not load this event. Check your connection and try again." onRetry={() => void loadEdit()} />
        </View>
      </>
    )
  }

  const backHeaderOptions = {
    title: '',
    headerLeft: () => (
      <TouchableOpacity onPress={goBack} style={{ paddingRight: 8 }} accessibilityRole="button" accessibilityLabel="Go back">
        <Ionicons name="chevron-back" size={24} color={theme.colors.primary} />
      </TouchableOpacity>
    ),
  }

  if (initialLoading) {
    return (
      <>
        <Stack.Screen options={backHeaderOptions} />
        <HostFormSkeleton />
      </>
    )
  }

  return (
    <>
      <Stack.Screen options={backHeaderOptions} />
      <HostResultModal
        visible={successModal}
        outcome={saveOutcome}
        message={successMessage}
        isEdit={isEdit}
        onClose={() => setSuccessModal(false)}
        onDone={goBack}
      />

      <ScrollView
        style={shared.screen}
        contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={hostPullRefreshing} onRefresh={() => void refreshHostContext()} tintColor={theme.colors.primary} />
        }
      >
        {/* Header */}
        <View style={{ marginBottom: 20 }}>
          <Text style={{ fontFamily: theme.fonts.display, fontWeight: '700', fontSize: theme.font.size.xxl, letterSpacing: -1.1, color: theme.colors.text }}>
            {isEdit ? 'Edit event.' : 'New event.'}
          </Text>
          <Text style={{ fontFamily: theme.fonts.body, fontSize: theme.font.size.smd, color: theme.colors.subtext, marginTop: 3 }}>
            Fill in the basics — you can edit later.
          </Text>
        </View>

        <TypeSection loading={tagsLoading} tags={availableTags} selectedTagIds={selectedTagIds} onChangeTags={setSelectedTagIds} />
        <BasicsSection
          form={form}
          setField={setField}
          userId={userId}
          recentVenues={recentVenues}
          onChangeDate={d => {
            setField('date', d)
            if (!recurrence.enabled) setRecurrence(prev => ({ ...prev, endDate: defaultRecurrenceEndDate(d) }))
          }}
        />
        <PlayersSection form={form} setField={setField} tags={availableTags} selectedTagIds={selectedTagIds} onToggleTag={toggleTag} />
        <DetailsSection form={form} setField={setField} />
        {/* ── What to bring (#256) ── */}
        <BringItemsSection
          drafts={bring.drafts}
          onChange={bring.change}
          surface={form.surface}
          cardStyle={shared.hostFieldCard}
          labelStyle={shared.hostFieldLabel}
        />
        <ApprovalSection value={form.requiresApproval} onChange={v => setField('requiresApproval', v)} />
        {!isEdit && <RepeatSection recurrence={recurrence} onChange={setRecurrence} eventCount={eventCount} />}
        <ClubSection clubs={ownedClubs} selectedClubId={selectedClubId} onSelect={setSelectedClubId} />
        {!isEdit && (
          <SaveTemplateSection
            enabled={saveAsTemplate}
            onToggle={setSaveAsTemplate}
            name={templateName}
            onChangeName={setTemplateName}
            placeholder={form.title || 'Template name'}
          />
        )}

        <HostSubmitButton
          onPress={handleSubmit}
          disabled={!form.title || !userId}
          busy={loading}
          label={isEdit ? 'Save changes' : (eventCount > 1 ? `Publish ${eventCount} events` : 'Publish event')}
        />
      </ScrollView>
    </>
  )
}
