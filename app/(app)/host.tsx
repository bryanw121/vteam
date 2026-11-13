import React, { useCallback, useEffect, useRef, useState } from 'react'
import { ScrollView, View, TouchableOpacity, Switch, Modal, StyleSheet, Platform } from 'react-native'
import { Text, TextInput } from '../../components/ui/Text'
import { RefreshControl } from '../../components/RefreshControl'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useLocalSearchParams, useRouter, Stack } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { Sentry } from '../../lib/sentry'
import { getQueryData, invalidate, queryKey, useQuery } from '../../lib/query'
import { HostFormSkeleton } from '../../components/host/HostFormSkeleton'
import { DatePickerField } from '../../components/DatePickerField'
import { LocationPickerField } from '../../components/LocationPickerField'
import type { LocationValue } from '../../types'
import { TemplatesView } from '../../components/host/TemplatesView'
import { Chip, ScreenState } from '../../components/ui'
import { shared, theme, STALE, EVENT_EDIT_SELECT, SURFACE_OPTIONS, DAY_LABELS_SHORT, DURATION_OPTIONS, DEFAULT_DURATION_MINUTES, GENERIC_ERROR_MESSAGE } from '../../constants'
import type { RecurrenceCadence } from '../../constants'
import { routes } from '../../utils/routes'
import { useSession } from '../../contexts/session'
import { useTags } from '../../hooks/useTags'
import { cleanDate, diffTagIds, isSurface, normalizePriceText, parsePrice, sanitizePriceInput } from '../../utils'
import { bringDraftsChanged, draftsFromItems, draftsFromTemplate, saveBringArgs, templateBringItems } from '../../utils/bringList'
import { BringItemsSection } from '../../components/host/BringItemsSection'
import { fetchBringList } from '../../hooks/event/useEventBringList'
import { eventKeys } from '../../hooks/event/keys'
import { track } from '../../lib/analytics'
import { toast } from '../../lib/toast'
import { ANALYTICS_EVENTS } from '../../constants/analytics'
import { defaultRecurrenceEndDate, generateEventDates } from '../../utils/recurrence'
import type { BringItem, BringItemDraft, CreateEventForm, EventEditSource, EventWithDetails, OwnedClubOption, Tag, UserEventTemplate } from '../../types'
import { Spinner } from '../../components/ui/Spinner'

const EMPTY_TAGS: Tag[] = []
const EMPTY_CLUBS: OwnedClubOption[] = []
const TEMPLATE_SELECT = 'id, user_id, name, title, description, location, max_attendees, created_at, bring_items'

function roundToNearest5(): Date {
  const d = new Date()
  d.setSeconds(0, 0)
  d.setMinutes(Math.ceil(d.getMinutes() / 5) * 5)
  return d
}

const EMPTY_FORM: CreateEventForm = {
  title: '',
  description: '',
  location: '',
  locationLatitude: null,
  locationLongitude: null,
  date: roundToNearest5(),
  durationMinutes: DEFAULT_DURATION_MINUTES,
  maxAttendees: null,
  priceText: '',
  venmoHandle: '',
  requiresApproval: false,
  surface: null,
}

/** The edit form's fields from an event row (the edit fetch, or the cached detail row). */
function formFromEvent(data: EventEditSource): CreateEventForm {
  return {
    title: data.title,
    description: data.description ?? '',
    location: data.location ?? '',
    locationLatitude: data.latitude ?? null,
    locationLongitude: data.longitude ?? null,
    date: new Date(data.event_date),
    durationMinutes: data.duration_minutes ?? DEFAULT_DURATION_MINUTES,
    maxAttendees: data.max_attendees,
    priceText: data.price != null ? Number(data.price).toFixed(2) : '',
    venmoHandle: data.venmo_handle ?? '',
    requiresApproval: data.requires_approval ?? false,
    surface: isSurface(data.surface) ? data.surface : null,
  }
}

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

const CADENCE_OPTIONS: { value: RecurrenceCadence; label: string }[] = [
  { value: 'weekly',   label: 'Weekly'    },
  { value: 'biweekly', label: 'Bi-weekly' },
  { value: 'monthly',  label: 'Monthly'   },
]

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
  } = useLocalSearchParams<{ mode?: string; edit?: string; maxAttendees?: string; location?: string; surface?: string }>()
  const isEdit = !!editId
  // Read once on mount: the cached detail row seeds the form's initial state.
  const [seed] = useState(() => cachedEditSource(editId))

  const [view, setView] = useState<'form' | 'templates'>(modeParam === 'templates' ? 'templates' : 'form')
  const [form, setForm] = useState<CreateEventForm>(() => seed ? formFromEvent(seed) : {
    ...EMPTY_FORM,
    maxAttendees: (() => { const n = parseInt(maxAttendeesParam ?? '', 10); return Number.isFinite(n) && n > 0 ? n : null })(),
    // "Already booked? Create a vteam event for it" (Book a court) passes the venue and its surface.
    location: typeof locationParam === 'string' ? locationParam.slice(0, 200) : '',
    surface: isSurface(surfaceParam) ? surfaceParam : null,
  })
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
  const [saveOutcome, setSaveOutcome] = useState<'saved' | 'tags-failed' | 'tags-uncertain' | 'failed'>('saved')
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

  // Tags (shared, cached) and the form's selection of them
  const tagsQuery = useTags()
  const availableTags = tagsQuery.data ?? EMPTY_TAGS
  const seedTagIds = seed ? seed.event_tags.map(et => et.tag_id) : []
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>(seedTagIds)
  const selectedTagIdsRef = useRef(selectedTagIds)
  selectedTagIdsRef.current = selectedTagIds
  // The tag set as it exists in the DB, so the save diffs against that rather
  // than against mutated UI state. Set on load, refreshed after each save.
  const originalTagIdsRef = useRef<string[]>(seedTagIds)

  // Clubs the host owns can be attached to the event
  const ownedClubsQuery = useQuery<OwnedClubOption[]>(
    userId ? queryKey('clubs', 'owned', userId) : null,
    async () => {
      const { data, error } = await supabase
        .from('club_members')
        .select('club_id, clubs (id, name)')
        .eq('user_id', userId as string)
        .eq('role', 'owner')
      if (error) throw error
      return ((data ?? []) as { clubs: OwnedClubOption | null }[])
        .map(m => m.clubs)
        .filter((c): c is OwnedClubOption => !!c)
    },
    { staleMs: STALE.feed, enabled: !!userId },
  )
  const ownedClubs = ownedClubsQuery.data ?? EMPTY_CLUBS
  const [selectedClubId, setSelectedClubId] = useState<string | null>(seed?.club_id ?? null)
  const selectedClubIdRef = useRef(selectedClubId)
  selectedClubIdRef.current = selectedClubId

  // Venues from the host's past events, offered as quick picks in the location field
  const venuesQuery = useQuery<LocationValue[]>(
    userId ? queryKey('host', 'venues', userId) : null,
    async () => {
      const { data, error } = await supabase
        .from('events')
        .select('location, latitude, longitude')
        .eq('created_by', userId as string)
        .not('location', 'is', null)
        .order('event_date', { ascending: false })
        .limit(20)
      if (error) throw error
      const seen = new Set<string>()
      const unique: LocationValue[] = []
      for (const e of data ?? []) {
        if (e.location && !seen.has(e.location)) {
          seen.add(e.location)
          unique.push({ display: e.location, latitude: e.latitude ?? null, longitude: e.longitude ?? null })
        }
      }
      return unique.slice(0, 5)
    },
    { staleMs: STALE.feed, enabled: !!userId },
  )
  const recentVenues = venuesQuery.data ?? []

  // Saved templates (only fetched once the picker is opened)
  const templatesQuery = useQuery<UserEventTemplate[]>(
    userId ? queryKey('templates', userId) : null,
    async () => {
      const { data, error } = await supabase
        .from('user_event_templates')
        .select(TEMPLATE_SELECT)
        .eq('user_id', userId as string)
        .order('created_at', { ascending: false })
      if (error) throw error
      // TEMPORARY double cast: bring_items isn't in types/database.ts until it is regenerated from live after merge (#256).
      return (data ?? []) as unknown as UserEventTemplate[]
    },
    { staleMs: STALE.feed, enabled: !!userId && view === 'templates' },
  )

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
  const [durationModalOpen, setDurationModalOpen] = useState(false)
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
        tagsQuery.refetch({ force: true }),
        ownedClubsQuery.refetch({ force: true }),
        venuesQuery.refetch({ force: true }),
        view === 'templates' ? templatesQuery.refetch({ force: true }) : undefined,
        // Pull to refresh is an explicit ask for the server's copy.
        editId && userId ? loadEventForEdit(editId, { force: true }) : undefined,
      ])
    } finally {
      setHostPullRefreshing(false)
    }
  }

  function applyUserTemplate(t: UserEventTemplate) {
    setForm(prev => ({
      ...prev,
      title: t.title,
      description: t.description ?? '',
      location: t.location ?? '',
      locationLatitude: null,
      locationLongitude: null,
      maxAttendees: t.max_attendees,
    }))
    changeBringDrafts(draftsFromTemplate(t.bring_items))
    setView('form')
  }

  function setField<K extends keyof CreateEventForm>(key: K, value: CreateEventForm[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  function toggleTag(id: string) {
    setSelectedTagIds(prev => prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id])
  }

  function toggleRecurrenceDay(dayIdx: number) {
    setRecurrence(prev => {
      const already = prev.days.includes(dayIdx)
      return { ...prev, days: already ? prev.days.filter(d => d !== dayIdx) : [...prev.days, dayIdx] }
    })
  }

  async function handleSubmit() {
    // Set once an events row is written: from then on readers must be told,
    // even if a later step (tags) fails.
    let eventRowsSaved = false
    try {
      setLoading(true)
      setSaveOutcome('saved')
      if (!userId) throw new Error('Not logged in')

      // Text → number happens once, here at the write boundary. Keeping the
      // form state as raw text is what lets a host type "5.50" at all.
      const parsedPrice = parsePrice(form.priceText)

      if (isEdit && editId) {
        // ── Update existing event ──────────────────────────────
        const { error } = await supabase
          .from('events')
          .update({
            title: form.title,
            description: form.description || null,
            location: form.location || null,
            latitude: form.locationLatitude,
            longitude: form.locationLongitude,
            event_date: cleanDate(form.date),
            duration_minutes: form.durationMinutes,
            max_attendees: form.maxAttendees,
            club_id: selectedClubId,
            price: parsedPrice,
            venmo_handle: parsedPrice && parsedPrice > 0 ? (form.venmoHandle.trim() || null) : null,
            requires_approval: form.requiresApproval,
            surface: form.surface,
          })
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
        const dates = generateEventDates(
          form.date, recurrence.enabled, recurrence.days, recurrence.cadence, recurrence.endDate,
        )
        if (dates.length === 0) {
          setSuccessMessage('The recurrence settings produced no valid dates. Check the end date.')
          return
        }

        const rows = dates.map(d => ({
          title: form.title,
          description: form.description || null,
          location: form.location || null,
          latitude: form.locationLatitude,
          longitude: form.locationLongitude,
          event_date: cleanDate(d),
          duration_minutes: form.durationMinutes,
          max_attendees: form.maxAttendees,
          created_by: userId,
          club_id: selectedClubId,
          price: parsedPrice,
          venmo_handle: parsedPrice && parsedPrice > 0 ? (form.venmoHandle.trim() || null) : null,
          requires_approval: form.requiresApproval,
          surface: form.surface,
        }))

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

  const eventCount = recurrence.enabled
    ? generateEventDates(form.date, true, recurrence.days, recurrence.cadence, recurrence.endDate).length
    : 1

  const showDayPicker = recurrence.enabled && recurrence.cadence !== 'monthly'

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
      <Modal visible={successModal} transparent animationType="none" onRequestClose={() => setSuccessModal(false)}>
        <TouchableOpacity style={shared.modalOverlay} onPress={() => setSuccessModal(false)}>
          <View style={shared.modalCard}>
            <Text style={shared.modalEmoji}>{saveOutcome === 'saved' ? '🏐' : '⚠️'}</Text>
            <Text style={shared.modalTitle}>{successMessage}</Text>
            <Text style={shared.modalBody}>
              {saveOutcome === 'tags-failed'
                ? 'Your event details were saved, but its tags were left unchanged.'
                : saveOutcome === 'tags-uncertain'
                  ? 'Your event details were saved, but its tags may not match your changes. Reopen the event and review them.'
                : saveOutcome === 'failed'
                  ? 'Nothing was saved. Check your connection and try again.'
                  : isEdit ? 'Your changes have been saved.' : 'Your event is now live for members to join.'}
            </Text>
            <TouchableOpacity
              style={shared.modalButton}
              onPress={saveOutcome === 'saved' ? goBack : () => setSuccessModal(false)}
            >
              <Text style={shared.modalButtonText}>{saveOutcome === 'saved' ? 'Done' : 'Close'}</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

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

        {/* ── Event type toggle ── */}
        {(() => {
          // Tags load beside the form: hold their space so the fields below don't jump.
          if (tagsQuery.isLoading) {
            return (
              <View testID="host-tags-loading" style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
                <View style={[shared.skeletonBlock, { flex: 1, height: 64, borderRadius: 18 }]} />
              </View>
            )
          }
          const typeTags = availableTags.filter(t => t.category === 'event_type' && t.name !== 'Tournament')
          if (typeTags.length === 0) return null
          const TYPE_META: Record<string, { color: string; subtitle: string }> = {
            'Open Play': { color: theme.colors.primary, subtitle: 'casual' },
          }
          return (
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
              {typeTags.map(tag => {
                const meta = TYPE_META[tag.name] ?? { color: theme.colors.primary, subtitle: '' }
                const selected = selectedTagIds.includes(tag.id)
                return (
                  <TouchableOpacity
                    key={tag.id}
                    onPress={() => {
                      setSelectedTagIds(prev => {
                        const otherTypeIds = typeTags.filter(t => t.id !== tag.id).map(t => t.id)
                        const withoutTypes = prev.filter(id => !otherTypeIds.includes(id))
                        return withoutTypes.includes(tag.id)
                          ? withoutTypes.filter(id => id !== tag.id)
                          : [...withoutTypes, tag.id]
                      })
                    }}
                    activeOpacity={0.75}
                    style={{
                      flex: 1, padding: 14, borderRadius: 18,
                      backgroundColor: selected ? meta.color : theme.colors.card,
                      borderWidth: selected ? 0 : 1.5,
                      borderColor: theme.colors.border,
                    }}
                  >
                    <Text style={{ fontFamily: theme.fonts.display, fontWeight: '700', fontSize: theme.font.size.lgm, letterSpacing: -0.3, color: selected ? theme.colors.white : theme.colors.text }}>
                      {tag.name}
                    </Text>
                    {meta.subtitle ? (
                      <Text style={{ fontFamily: theme.fonts.body, fontSize: theme.font.size.xs, color: selected ? 'rgba(255,255,255,0.75)' : theme.colors.subtext, marginTop: 2 }}>
                        {meta.subtitle}
                      </Text>
                    ) : null}
                  </TouchableOpacity>
                )
              })}
            </View>
          )
        })()}

        {/* ── Title ── */}
        <View style={hostStyles.fieldCard}>
          <Text style={hostStyles.fieldLabel}>Title</Text>
          <TextInput
            value={form.title}
            onChangeText={v => setField('title', v)}
            placeholder="Friday Night Round Robin"
            placeholderTextColor={theme.colors.subtext}
            style={hostStyles.fieldInput}
          />
        </View>

        {/* ── Location ── */}
        <View style={hostStyles.fieldCard}>
          <Text style={hostStyles.fieldLabel}>Location</Text>
          <LocationPickerField
            value={form.location ? { display: form.location, latitude: form.locationLatitude, longitude: form.locationLongitude } : null}
            onChange={loc => {
              setField('location', loc.display)
              setField('locationLatitude', loc.latitude)
              setField('locationLongitude', loc.longitude)
            }}
            userId={userId}
            recentVenues={recentVenues}
          />
        </View>

        {/* ── Date + Time (DatePickerField handles both) ── */}
        <View style={hostStyles.fieldCard}>
          <Text style={hostStyles.fieldLabel}>Date & Time</Text>
          <DatePickerField
            value={form.date}
            onChange={d => {
              setField('date', d)
              if (!recurrence.enabled) setRecurrence(prev => ({ ...prev, endDate: defaultRecurrenceEndDate(d) }))
            }}
          />
        </View>

        {/* ── Duration ── */}
        <View style={hostStyles.fieldCard}>
          <Text style={hostStyles.fieldLabel}>Duration</Text>
          <TouchableOpacity
            onPress={() => setDurationModalOpen(true)}
            activeOpacity={0.7}
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 }}
          >
            <Text style={{ fontFamily: theme.fonts.body, fontSize: theme.font.size.lgs, color: theme.colors.text, fontWeight: '500' }}>
              {DURATION_OPTIONS.find(o => o.minutes === form.durationMinutes)?.label ?? 'Select'}
            </Text>
            <Ionicons name="chevron-down" size={16} color={theme.colors.subtext} />
          </TouchableOpacity>
          <Modal visible={durationModalOpen} transparent animationType="fade" onRequestClose={() => setDurationModalOpen(false)}>
            <TouchableOpacity style={shared.modalOverlay} activeOpacity={1} onPress={() => setDurationModalOpen(false)}>
              <View style={[shared.modalCard, { paddingVertical: 0, paddingHorizontal: 0, overflow: 'hidden', minWidth: 200 }]}>
                {DURATION_OPTIONS.map((opt, i) => {
                  const active = form.durationMinutes === opt.minutes
                  return (
                    <TouchableOpacity
                      key={opt.minutes}
                      onPress={() => { setField('durationMinutes', opt.minutes); setDurationModalOpen(false) }}
                      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.md, borderTopWidth: i > 0 ? 1 : 0, borderTopColor: theme.colors.border }}
                    >
                      <Text style={{ fontSize: theme.font.size.md, color: active ? theme.colors.primary : theme.colors.text, fontWeight: active ? theme.font.weight.semibold : theme.font.weight.regular }}>
                        {opt.label}
                      </Text>
                      {active && <Ionicons name="checkmark" size={16} color={theme.colors.primary} />}
                    </TouchableOpacity>
                  )
                })}
              </View>
            </TouchableOpacity>
          </Modal>
        </View>

        {/* ── Max players ── */}
        <View style={hostStyles.fieldCard}>
          <Text style={hostStyles.fieldLabel}>Max players</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 2 }}>
            <TextInput
              value={form.maxAttendees != null ? String(form.maxAttendees) : ''}
              onChangeText={v => {
                const digits = v.replace(/[^0-9]/g, '')
                if (digits === '') { setField('maxAttendees', null); return }
                const n = parseInt(digits, 10)
                if (Number.isFinite(n) && n > 0) setField('maxAttendees', n)
              }}
              placeholder="e.g. 18"
              placeholderTextColor={theme.colors.subtext}
              keyboardType="number-pad"
              style={[hostStyles.fieldInput, { flex: 1 }]}
            />
            <TouchableOpacity
              onPress={() => setField('maxAttendees', form.maxAttendees === null ? 18 : null)}
              style={[hostStyles.chip, form.maxAttendees === null && hostStyles.chipActive]}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityState={{ selected: form.maxAttendees === null }}
              accessibilityLabel="Unlimited players"
            >
              <Text style={[hostStyles.chipText, form.maxAttendees === null && hostStyles.chipTextActive]}>
                Unlimited
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Skill level tags ── */}
        {(() => {
          const byCategory = availableTags.reduce<Record<string, Tag[]>>((acc, tag) => {
            if (tag.category === 'event_type') return acc
            ;(acc[tag.category] ??= []).push(tag)
            return acc
          }, {})
          const entries = Object.entries(byCategory)
          if (entries.length === 0) return null
          return entries.map(([category, tags]) => (
            <View key={category} style={hostStyles.fieldCard}>
              <Text style={hostStyles.fieldLabel}>
                {category.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {tags.map(tag => {
                  const active = selectedTagIds.includes(tag.id)
                  return (
                    <TouchableOpacity
                      key={tag.id}
                      onPress={() => toggleTag(tag.id)}
                      style={{
                        paddingHorizontal: 13, paddingVertical: 6, borderRadius: 999,
                        backgroundColor: active ? theme.colors.text : theme.colors.border,
                      }}
                    >
                      <Text style={{
                        fontFamily: theme.fonts.display, fontWeight: '700', fontSize: theme.font.size.smd,
                        color: active ? theme.colors.background : theme.colors.text,
                      }}>{tag.name}</Text>
                    </TouchableOpacity>
                  )
                })}
              </View>
            </View>
          ))
        })()}

        {/* ── Description ── */}
        <View style={hostStyles.fieldCard}>
          <Text style={hostStyles.fieldLabel}>Description (optional)</Text>
          <TextInput
            value={form.description}
            onChangeText={v => setField('description', v)}
            placeholder="What's this event about?"
            placeholderTextColor={theme.colors.subtext}
            multiline
            numberOfLines={3}
            style={[hostStyles.fieldInput, { minHeight: 64, textAlignVertical: 'top' }]}
          />
        </View>

        {/* ── Price + Venmo ── */}
        <View style={hostStyles.fieldCard}>
          <Text style={hostStyles.fieldLabel}>Price (optional)</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
            <Text style={{ fontFamily: theme.fonts.bodySemiBold, fontSize: theme.font.size.lgs, color: theme.colors.subtext }}>$</Text>
            <TextInput
              testID="event-price-input"
              // Bound to raw text. Never round-trip through parseFloat on
              // keystroke — that erases a trailing "." and any trailing zero,
              // which is why "5.50" was impossible to type.
              value={form.priceText}
              onChangeText={v => setField('priceText', sanitizePriceInput(v))}
              onBlur={() => setField('priceText', normalizePriceText(form.priceText))}
              placeholder="0.00 — leave blank for free"
              placeholderTextColor={theme.colors.subtext}
              keyboardType="decimal-pad"
              inputMode="decimal"
              style={[hostStyles.fieldInput, { flex: 1 }]}
            />
          </View>
          {(parsePrice(form.priceText) ?? 0) > 0 && (
            <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: theme.colors.border, paddingTop: 12 }}>
              <Text style={hostStyles.fieldLabel}>Venmo handle (optional)</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                <Text style={{ fontFamily: theme.fonts.bodySemiBold, fontSize: theme.font.size.lgs, color: theme.colors.subtext }}>@</Text>
                <TextInput
                  value={form.venmoHandle}
                  onChangeText={v => setField('venmoHandle', v.replace(/^@/, ''))}
                  placeholder="your-venmo-username"
                  placeholderTextColor={theme.colors.subtext}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={[hostStyles.fieldInput, { flex: 1 }]}
                />
              </View>
            </View>
          )}
        </View>

        {/* ── Surface ── optional; lets the Events feed's surface filter include this event. */}
        <View style={hostStyles.fieldCard}>
          <Text style={hostStyles.fieldLabel}>Surface</Text>
          <View style={shared.chipRowWrap}>
            {SURFACE_OPTIONS.map(opt => (
              <Chip
                key={opt.id}
                testID={`event-surface-${opt.id}`}
                label={opt.label}
                active={form.surface === opt.id}
                // Tap the selected surface again to clear it.
                onPress={() => setField('surface', form.surface === opt.id ? null : opt.id)}
              />
            ))}
          </View>
          <Text style={shared.caption}>Players can filter the Events feed by surface.</Text>
        </View>

        {/* ── What to bring (#256) ── */}
        <BringItemsSection
          drafts={bringDrafts}
          onChange={changeBringDrafts}
          surface={form.surface}
          cardStyle={hostStyles.fieldCard}
          labelStyle={hostStyles.fieldLabel}
        />

        {/* ── Approval ──
            Its own card right after Price: approval used to be implied by
            `price > 0`, and the two are now independent (a free event can be
            screened, a paid one can be open). */}
        <View style={hostStyles.fieldCard}>
          <View style={hostStyles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={hostStyles.fieldLabel}>Require approval to join</Text>
              <Text style={shared.caption}>
                {form.requiresApproval
                  ? 'Players request a spot and you approve each one.'
                  : 'Anyone can join instantly until the event is full.'}
              </Text>
            </View>
            <Switch
              testID="event-requires-approval-switch"
              value={form.requiresApproval}
              onValueChange={v => setField('requiresApproval', v)}
              accessibilityLabel="Require approval to join this event"
              trackColor={{ false: theme.colors.border, true: theme.colors.primary + '80' }}
              thumbColor={form.requiresApproval ? theme.colors.primary : theme.colors.subtext}
            />
          </View>
        </View>

        {/* ── Recurrence (create only) ── */}
        {!isEdit && (
          <View style={hostStyles.fieldCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={hostStyles.fieldLabel}>Repeat</Text>
              <Switch
                accessibilityLabel="Repeat this event"
                value={recurrence.enabled}
                onValueChange={v => setRecurrence(prev => ({ ...prev, enabled: v }))}
                trackColor={{ false: theme.colors.border, true: theme.colors.primary + '80' }}
                thumbColor={recurrence.enabled ? theme.colors.primary : theme.colors.subtext}
              />
            </View>
            {recurrence.enabled && (
              <View style={{ marginTop: 14, gap: 12 }}>
                <View style={{ flexDirection: 'row', borderRadius: theme.radius.md, overflow: 'hidden', borderWidth: 1, borderColor: theme.colors.border, alignSelf: 'flex-start' }}>
                  {CADENCE_OPTIONS.map(opt => (
                    <TouchableOpacity
                      key={opt.value}
                      onPress={() => setRecurrence(prev => ({ ...prev, cadence: opt.value }))}
                      style={{ paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.xs, backgroundColor: recurrence.cadence === opt.value ? theme.colors.primary : 'transparent' }}
                    >
                      <Text style={{ fontSize: theme.font.size.sm, fontWeight: theme.font.weight.medium, color: recurrence.cadence === opt.value ? theme.colors.white : theme.colors.subtext }}>
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {showDayPicker && (
                  <View>
                    <Text style={[shared.caption, { marginBottom: theme.spacing.xs }]}>On these days</Text>
                    <View style={{ flexDirection: 'row', gap: theme.spacing.xs }}>
                      {DAY_LABELS_SHORT.map((label, i) => {
                        const active = recurrence.days.includes(i)
                        return (
                          <TouchableOpacity
                            key={i}
                            onPress={() => toggleRecurrenceDay(i)}
                            style={{
                              width: 36, height: 36, borderRadius: 18,
                              borderWidth: 1.5,
                              borderColor: active ? theme.colors.primary : theme.colors.border,
                              backgroundColor: active ? theme.colors.primary : 'transparent',
                              alignItems: 'center', justifyContent: 'center',
                            }}
                          >
                            <Text style={{ fontSize: theme.font.size.xs, fontWeight: theme.font.weight.semibold, color: active ? theme.colors.white : theme.colors.subtext }}>
                              {label}
                            </Text>
                          </TouchableOpacity>
                        )
                      })}
                    </View>
                  </View>
                )}
                <View>
                  <Text style={[shared.caption, { marginBottom: theme.spacing.xs }]}>Until</Text>
                  <DatePickerField value={recurrence.endDate} onChange={d => setRecurrence(prev => ({ ...prev, endDate: d }))} />
                </View>
                {eventCount > 0 && (
                  <Text style={{ fontFamily: theme.fonts.body, fontSize: theme.font.size.sm, color: theme.colors.primaryText }}>
                    {eventCount} event{eventCount !== 1 ? 's' : ''} will be created
                  </Text>
                )}
              </View>
            )}
          </View>
        )}

        {/* ── Club ── */}
        {ownedClubs.length > 0 && (
          <View style={hostStyles.fieldCard}>
            <Text style={hostStyles.fieldLabel}>Club (optional)</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              {ownedClubs.map(club => {
                const active = selectedClubId === club.id
                return (
                  <TouchableOpacity
                    key={club.id}
                    onPress={() => setSelectedClubId(active ? null : club.id)}
                    style={{
                      paddingHorizontal: 13, paddingVertical: 6, borderRadius: 999,
                      backgroundColor: active ? theme.colors.primary : theme.colors.border,
                    }}
                  >
                    <Text style={{ fontFamily: theme.fonts.bodySemiBold, fontSize: theme.font.size.smd, color: active ? theme.colors.white : theme.colors.text }}>
                      {club.name}
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </View>
          </View>
        )}

        {/* ── Save as template ── */}
        {!isEdit && (
          <View style={hostStyles.fieldCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={hostStyles.fieldLabel}>Save as template</Text>
              <Switch
                accessibilityLabel="Save as template"
                value={saveAsTemplate}
                onValueChange={setSaveAsTemplate}
                trackColor={{ false: theme.colors.border, true: theme.colors.primary + '80' }}
                thumbColor={saveAsTemplate ? theme.colors.primary : theme.colors.subtext}
              />
            </View>
            {saveAsTemplate && (
              <TextInput
                value={templateName}
                onChangeText={setTemplateName}
                placeholder={form.title || 'Template name'}
                placeholderTextColor={theme.colors.subtext}
                style={[hostStyles.fieldInput, { marginTop: 10 }]}
              />
            )}
          </View>
        )}

        {/* ── Submit ── */}
        <TouchableOpacity
          onPress={handleSubmit}
          disabled={!form.title || !userId || loading}
          activeOpacity={0.85}
          style={{
            marginTop: 8,
            padding: 15, borderRadius: 14,
            backgroundColor: (!form.title || !userId) ? theme.colors.border : theme.colors.text,
            alignItems: 'center',
          }}
        >
          {loading
            ? <Spinner color={theme.colors.background} />
            : <Text style={{ fontFamily: theme.fonts.display, fontWeight: '700', fontSize: theme.font.size.lgs, letterSpacing: 0.2, color: theme.colors.background }}>
                {isEdit ? 'Save changes' : (eventCount > 1 ? `Publish ${eventCount} events` : 'Publish event')}
              </Text>
          }
        </TouchableOpacity>
      </ScrollView>
    </>
  )
}

const hostStyles = StyleSheet.create({
  fieldCard: {
    backgroundColor: theme.colors.card,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: 10,
  },
  fieldLabel: {
    fontFamily: theme.fonts.bodySemiBold,
    fontSize: theme.font.size.xs,
    fontWeight: '700',
    color: theme.colors.subtext,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
  },
  fieldInput: {
    fontFamily: theme.fonts.body,
    fontSize: theme.font.size.lgs,
    color: theme.colors.text,
    fontWeight: '500',
    paddingVertical: 2,
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}),
  },
  chip: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs + 2,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.card,
  },
  chipActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  chipText: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: theme.font.size.sm,
    color: theme.colors.subtext,
  },
  chipTextActive: {
    fontFamily: theme.fonts.bodySemiBold,
    color: theme.colors.white,
  },
})
