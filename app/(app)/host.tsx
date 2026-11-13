import React, { useCallback, useEffect, useRef, useState } from 'react'
import { ScrollView, View, TouchableOpacity } from 'react-native'
import { Text } from '../../components/ui/Text'
import { RefreshControl } from '../../components/RefreshControl'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useLocalSearchParams, useRouter, Stack } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { Sentry } from '../../lib/sentry'
import { getQueryData, invalidate, queryKey, useQuery } from '../../lib/query'
import { HostFormSkeleton } from '../../components/host/HostFormSkeleton'
import { TemplatesView } from '../../components/host/TemplatesView'
import { TypeSection } from '../../components/host/TypeSection'
import { BasicsSection } from '../../components/host/BasicsSection'
import { PlayersSection } from '../../components/host/PlayersSection'
import { DetailsSection } from '../../components/host/DetailsSection'
import { ApprovalSection } from '../../components/host/ApprovalSection'
import { RepeatSection } from '../../components/host/RepeatSection'
import { ClubSection } from '../../components/host/ClubSection'
import { SaveTemplateSection } from '../../components/host/SaveTemplateSection'
import { HostResultModal } from '../../components/host/HostResultModal'
import { HostSubmitButton } from '../../components/host/HostSubmitButton'
import { ScreenState } from '../../components/ui'
import { shared, theme, STALE, EVENT_EDIT_SELECT, GENERIC_ERROR_MESSAGE } from '../../constants'
import type { RecurrenceCadence } from '../../constants'
import { routes } from '../../utils/routes'
import { useSession } from '../../contexts/session'
import { useHostContext } from '../../hooks/host/useHostContext'
import { cleanDate, diffTagIds } from '../../utils'
import { emptyForm, eventColumns, formWithTemplate, eventDates, formFromEvent, formFromParams, newEventRows } from '../../utils/hostForm'
import { bringDraftsChanged, draftsFromItems, draftsFromTemplate, saveBringArgs, templateBringItems } from '../../utils/bringList'
import { BringItemsSection } from '../../components/host/BringItemsSection'
import { fetchBringList } from '../../hooks/event/useEventBringList'
import { eventKeys } from '../../hooks/event/keys'
import { track } from '../../lib/analytics'
import { toast } from '../../lib/toast'
import { ANALYTICS_EVENTS } from '../../constants/analytics'
import { defaultRecurrenceEndDate } from '../../utils/recurrence'
import type { BringItem, BringItemDraft, CreateEventForm, EventEditSource, EventWithDetails, HostSaveOutcome, UserEventTemplate } from '../../types'


// Built once, like before: the reset after a create goes back to it.
const EMPTY_FORM = emptyForm()

/**
 * The event detail page caches EVENT_DETAIL_SELECT under `event:<id>`, which
 * carries every field the edit form needs. Coming from that page the form can
 * paint at once; the edit fetch still runs and refreshes it (see loadEventForEdit).
 */
function cachedEditSource(editId: string | undefined): EventEditSource | null {
  if (!editId) return null
  const row = getQueryData<EventWithDetails | null>(eventKeys.root(editId))
  if (!row || !('latitude' in row) || !('venmo_handle' in row)) return null
  return row as unknown as EventEditSource
}


/**
 * The event row saved but its tags did not. Distinguished from a generic
 * failure so the user is told their edit landed — otherwise they retry a save
 * that already succeeded.
 */
class TagWriteError extends Error {
  readonly tagsMayHaveChanged: boolean

  constructor(message: string, tagsMayHaveChanged = false) {
    super(message)
    this.name = 'TagWriteError'
    this.tagsMayHaveChanged = tagsMayHaveChanged
  }
}

export default function HostEventScreen() {
  const router = useRouter()

  function goBack() {
    if (router.canGoBack()) router.back()
    else router.replace(routes.app())
  }
  const {
    mode: modeParam, edit: editId, maxAttendees: maxAttendeesParam, location: locationParam, surface: surfaceParam,
    clubId: clubIdParam, date: dateParam, title: titleParam, pollId: pollIdParam,
  } = useLocalSearchParams<{
    mode?: string; edit?: string; maxAttendees?: string; location?: string; surface?: string
    clubId?: string; date?: string; title?: string; pollId?: string
  }>()
  // A club poll's winning time (#175) opens Host with the club, start and question filled in (formFromParams).
  const isEdit = !!editId
  // Read once on mount: the cached detail row seeds the form's initial state.
  const [seed] = useState(() => cachedEditSource(editId))

  const [view, setView] = useState<'form' | 'templates'>(modeParam === 'templates' ? 'templates' : 'form')
  const [form, setForm] = useState<CreateEventForm>(() => seed ? formFromEvent(seed) : formFromParams(EMPTY_FORM, {
    maxAttendees: maxAttendeesParam, location: locationParam, surface: surfaceParam, date: dateParam, title: titleParam,
  }))
  const formRef = useRef(form)
  formRef.current = form
  const [recurrence, setRecurrence] = useState({
    enabled: false,
    days: [] as number[],
    cadence: 'weekly' as RecurrenceCadence,
    endDate: defaultRecurrenceEndDate(new Date()),
  })
  const [loading, setLoading] = useState(false)
  const { userId, loading: sessionLoading } = useSession()
  const [successModal, setSuccessModal] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')
  /** Drives the result modal's body copy and whether it reads as a failure. */
  const [saveOutcome, setSaveOutcome] = useState<HostSaveOutcome>('saved')
  // What to bring (#256): the form's list, and what is saved on the event being edited.
  const [bringDrafts, setBringDrafts] = useState<BringItemDraft[]>([])
  const bringTouchedRef = useRef(false)
  const savedBringRef = useRef<BringItemDraft[]>([])
  const changeBringDrafts = useCallback((next: BringItemDraft[]) => {
    bringTouchedRef.current = true
    setBringDrafts(next)
  }, [])
  // Save as template
  const [saveAsTemplate, setSaveAsTemplate] = useState(false)
  const [templateName, setTemplateName] = useState('')

  // Tags, owned clubs, recent venues and templates (hooks/host/useHostContext).
  const { tags: availableTags, tagsLoading, ownedClubs, recentVenues, templatesQuery, refetchAll } = useHostContext(userId, view === 'templates')
  // The form's selection of tags
  const seedTagIds = seed ? seed.event_tags.map(et => et.tag_id) : []
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>(seedTagIds)
  const selectedTagIdsRef = useRef(selectedTagIds)
  selectedTagIdsRef.current = selectedTagIds
  // The tag set as it exists in the DB, so the save diffs against that rather
  // than against mutated UI state. Set on load, refreshed after each save.
  const originalTagIdsRef = useRef<string[]>(seedTagIds)

  const [selectedClubId, setSelectedClubId] = useState<string | null>(seed?.club_id ?? (typeof clubIdParam === 'string' && clubIdParam ? clubIdParam : null))
  /** The poll this new event answers; cleared once linked (or if the club changes). */
  const pollIdRef = useRef(!isEdit && typeof pollIdParam === 'string' && pollIdParam ? pollIdParam : null)
  const selectedClubIdRef = useRef(selectedClubId)
  selectedClubIdRef.current = selectedClubId

  // Editing: the event being edited is loaded into the form once
  const [editState, setEditState] = useState<'idle' | 'loading' | 'loaded' | 'error'>(seed ? 'loaded' : isEdit ? 'loading' : 'idle')
  /**
   * What the form showed when last filled from the server (seed or fetch). A
   * later fetch only replaces the form while it is still exactly this, so a
   * background refresh never overwrites what the host has started typing.
   */
  const filledRef = useRef<{ form: CreateEventForm; tags: string[]; club: string | null } | null>(
    seed ? { form, tags: selectedTagIds, club: selectedClubId } : null,
  )
  const [hostPullRefreshing, setHostPullRefreshing] = useState(false)

  const loadEventForEdit = useCallback(async (id: string, opts?: { force?: boolean }): Promise<boolean> => {
    const { data, error } = await supabase
      .from('events')
      .select(EVENT_EDIT_SELECT)
      .eq('id', id)
      .single()
    if (error || !data) return false

    const loadedTagIds = (data.event_tags ?? []).map((et: { tag_id: string }) => et.tag_id)
    // The save diffs tags against the server's set, so this always tracks the fetch.
    originalTagIdsRef.current = loadedTagIds
    const filled = filledRef.current
    const untouched = !filled || (
      formRef.current === filled.form
      && selectedTagIdsRef.current === filled.tags
      && selectedClubIdRef.current === filled.club
    )
    if (!untouched && !opts?.force) return true

    const nextForm = formFromEvent(data)
    const nextClub = data.club_id ?? null
    setForm(nextForm)
    setSelectedTagIds(loadedTagIds)
    setSelectedClubId(nextClub)
    filledRef.current = { form: nextForm, tags: loadedTagIds, club: nextClub }
    return true
  }, [])

  const loadEdit = useCallback(async () => {
    if (!editId) return
    // Seeded from the cache: the form is already up; refresh it quietly.
    if (filledRef.current) {
      await loadEventForEdit(editId)
      return
    }
    setEditState('loading')
    setEditState((await loadEventForEdit(editId)) ? 'loaded' : 'error')
  }, [editId, loadEventForEdit])

  useEffect(() => {
    if (!editId || sessionLoading) return
    if (!userId) { setEditState('idle'); return }
    void loadEdit()
  }, [editId, userId, sessionLoading, loadEdit])

  // Editing: the event's saved "What to bring" list fills the section once, unless the host already changed it.
  const savedBringQuery = useQuery<BringItem[]>(
    editId ? eventKeys.bring(editId, userId ?? null) : null,
    () => fetchBringList(editId as string),
    { staleMs: STALE.detail, enabled: !!editId && !!userId },
  )
  useEffect(() => {
    const items = savedBringQuery.data
    if (!items || bringTouchedRef.current) return
    const drafts = draftsFromItems(items, userId ?? null)
    savedBringRef.current = drafts
    setBringDrafts(drafts)
  }, [savedBringQuery.data, userId])

  /** Writes the list after the event row; a failure here says so but doesn't undo the event. */
  async function saveBringList(eventIds: string[], keepIds: boolean): Promise<void> {
    if (eventIds.length === 0) return
    try {
      for (const id of eventIds) {
        // TEMPORARY cast: save_event_bring_items isn't in types/database.ts until it is regenerated from live after merge (#256).
        const { error } = await supabase.rpc('save_event_bring_items' as never, saveBringArgs(id, bringDrafts, keepIds) as never)
        if (error) throw error
        invalidate(eventKeys.root(id))
      }
      track(ANALYTICS_EVENTS.bringListSaved, { items: bringDrafts.length, surface: form.surface ?? 'unknown' })
    } catch (e) {
      Sentry.captureException(e)
      toast.error("Event saved, but What to bring wasn't", e)
    }
  }

  // Only the edit row gates the form: tags, clubs and venues fill in when they land.
  const initialLoading = editState === 'loading' || (isEdit && sessionLoading && !seed)

  async function refreshHostContext() {
    setHostPullRefreshing(true)
    try {
      await Promise.all([
        refetchAll(),
        // Pull to refresh is an explicit ask for the server's copy.
        editId && userId ? loadEventForEdit(editId, { force: true }) : undefined,
      ])
    } finally {
      setHostPullRefreshing(false)
    }
  }

  function applyUserTemplate(t: UserEventTemplate) {
    setForm(prev => formWithTemplate(prev, t))
    changeBringDrafts(draftsFromTemplate(t.bring_items))
    setView('form')
  }

  function setField<K extends keyof CreateEventForm>(key: K, value: CreateEventForm[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  function toggleTag(id: string) {
    setSelectedTagIds(prev => prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id])
  }


  async function handleSubmit() {
    // Set once an events row is written: from then on readers must be told,
    // even if a later step (tags) fails.
    let eventRowsSaved = false
    try {
      setLoading(true)
      setSaveOutcome('saved')
      if (!userId) throw new Error('Not logged in')

      if (isEdit && editId) {
        // ── Update existing event ──────────────────────────────
        const { error } = await supabase
          .from('events')
          .update({ ...eventColumns(form, selectedClubId), event_date: cleanDate(form.date) })
          .eq('id', editId)
        if (error) throw error
        eventRowsSaved = true

        // Diff rather than delete-all-then-reinsert: a failure never exposes
        // the old empty-set window. Editing a title with tags untouched writes
        // nothing at all.
        const { toAdd, toRemove } = diffTagIds(originalTagIdsRef.current, selectedTagIds)
        if (toAdd.length > 0) {
          const { error: addError } = await supabase.from('event_tags').insert(
            toAdd.map(tagId => ({ event_id: editId, tag_id: tagId }))
          )
          if (addError) throw new TagWriteError(addError.message)
        }
        if (toRemove.length > 0) {
          const { error: removeError } = await supabase
            .from('event_tags')
            .delete()
            .eq('event_id', editId)
            .in('tag_id', toRemove)
          if (removeError) {
            // Adds landed before the remove failed. Compensate so the approved
            // partial-save message can truthfully say the old tag set remains.
            // If even the compensation fails, surface an explicit uncertain
            // state instead of claiming the tags are unchanged.
            if (toAdd.length > 0) {
              const { error: rollbackError } = await supabase
                .from('event_tags')
                .delete()
                .eq('event_id', editId)
                .in('tag_id', toAdd)
              if (rollbackError) {
                throw new TagWriteError(`${removeError.message}; rollback failed: ${rollbackError.message}`, true)
              }
            }
            throw new TagWriteError(removeError.message)
          }
        }
        // The event row is saved; a second save in this session diffs from here.
        originalTagIdsRef.current = [...selectedTagIds]

        // Auto-promote waitlisted users when capacity is expanded
        if (form.maxAttendees === null) {
          // Unlimited capacity — promote everyone on the waitlist
          await supabase
            .from('event_attendees')
            .update({ status: 'attending' })
            .eq('event_id', editId)
            .eq('status', 'waitlisted')
        } else {
          const { data: attendingData } = await supabase
            .from('event_attendees')
            .select('user_id')
            .eq('event_id', editId)
            .eq('status', 'attending')
          const newSpots = form.maxAttendees - (attendingData?.length ?? 0)
          if (newSpots > 0) {
            const { data: waitlisted } = await supabase
              .from('event_attendees')
              .select('user_id')
              .eq('event_id', editId)
              .eq('status', 'waitlisted')
              .order('joined_at', { ascending: true })
              .limit(newSpots)
            if (waitlisted && waitlisted.length > 0) {
              await supabase
                .from('event_attendees')
                .update({ status: 'attending' })
                .eq('event_id', editId)
                .in('user_id', waitlisted.map(w => w.user_id))
            }
          }
        }

        // Tell every reader of this event (detail screen, feed cards, its club page)
        // their cached copy is out of date. After the tag rewrite and waitlist
        // promotion, so the refetch sees every part of this save, not just the
        // events row.
        invalidate(queryKey('event', editId))
        invalidate('feed')
        invalidate('club')

        if (bringDraftsChanged(savedBringRef.current, bringDrafts)) {
          await saveBringList([editId], true)
          bringTouchedRef.current = false
        }

        setSuccessMessage('Event updated!')
        setSuccessModal(true)
      } else {
        // ── Create new event(s) ────────────────────────────────
        const dates = eventDates(form, recurrence)
        if (dates.length === 0) {
          setSuccessMessage('The recurrence settings produced no valid dates. Check the end date.')
          return
        }

        const rows = newEventRows(form, dates, { userId, clubId: selectedClubId })

        const { data: insertedEvents, error } = await supabase.from('events').insert(rows).select('id')
        if (error) throw error
        eventRowsSaved = true

        if (selectedTagIds.length > 0 && insertedEvents) {
          const tagRows = insertedEvents.flatMap(e =>
            selectedTagIds.map(tagId => ({ event_id: e.id, tag_id: tagId }))
          )
          const { error: tagError } = await supabase.from('event_tags').insert(tagRows)
          if (tagError) throw tagError
        }

        if (bringDrafts.length > 0 && insertedEvents) {
          await saveBringList(insertedEvents.map(e => e.id), false)
        }

        // Answered a club poll (#175): link the first game to it, so the poll shows "Game posted".
        const pollId = pollIdRef.current
        if (pollId && insertedEvents?.[0] && selectedClubId && selectedClubId === clubIdParam) {
          const { error: linkError } = await supabase.rpc('link_poll_event', { p_post_id: pollId, p_event_id: insertedEvents[0].id })
          if (linkError) Sentry.captureException(linkError)
          else invalidate(queryKey('club', selectedClubId))
          pollIdRef.current = null
        }

        if (saveAsTemplate && (templateName.trim() || form.title)) {
          await supabase.from('user_event_templates').insert({
            user_id: userId,
            name: templateName.trim() || form.title,
            title: form.title,
            description: form.description || null,
            location: form.location || null,
            max_attendees: form.maxAttendees,
            // TEMPORARY cast: bring_items isn't in types/database.ts until it is regenerated from live after merge (#256).
            ...({ bring_items: templateBringItems(bringDrafts) } as object),
          })
        }

        invalidate('feed')
        invalidate('club')
        if (saveAsTemplate) invalidate(queryKey('templates'))

        setSuccessMessage(dates.length > 1 ? `${dates.length} events created!` : 'Event created!')
        setSuccessModal(true)
        setForm(EMPTY_FORM)
        setRecurrence({ enabled: false, days: [], cadence: 'weekly', endDate: defaultRecurrenceEndDate(new Date()) })
        setSaveAsTemplate(false)
        setTemplateName('')
        setSelectedTagIds([])
        setSelectedClubId(null)
        setBringDrafts([])
        bringTouchedRef.current = false
      }
    } catch (e: any) {
      Sentry.captureException(e)
      // The events row saved, so cached copies are stale even though a later write failed.
      if (eventRowsSaved) {
        if (isEdit && editId) invalidate(queryKey('event', editId))
        invalidate('feed')
        invalidate('club')
      }
      if (e instanceof TagWriteError) {
        setSaveOutcome(e.tagsMayHaveChanged ? 'tags-uncertain' : 'tags-failed')
        setSuccessMessage('Event saved — tags not updated')
      } else {
        setSaveOutcome('failed')
        setSuccessMessage(GENERIC_ERROR_MESSAGE)
      }
      // The modal is the only place `successMessage` renders, so without this
      // every failure was silent — the form just stopped with no explanation.
      setSuccessModal(true)
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
          drafts={bringDrafts}
          onChange={changeBringDrafts}
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
