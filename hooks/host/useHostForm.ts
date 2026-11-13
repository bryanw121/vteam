/**
 * The host form's state (#188 part 4): the form, Repeat, picked tags and club,
 * and, when editing, loading the event into the form. The cached detail row
 * seeds the form at once (#104); the edit fetch then refreshes it, but only
 * while the host hasn't touched anything, so a background refresh never
 * overwrites what they started typing. Moved as is from `app/(app)/host.tsx`.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { getQueryData } from '../../lib/query'
import { EVENT_EDIT_SELECT } from '../../constants'
import { eventKeys } from '../event/keys'
import { emptyForm, formFromEvent, formFromParams } from '../../utils/hostForm'
import { defaultRecurrenceEndDate } from '../../utils/recurrence'
import type { CreateEventForm, EventEditSource, EventWithDetails, HostFormParams, HostRecurrence } from '../../types'

// Built once, like before: the reset after a create goes back to it.
const EMPTY_FORM = emptyForm()

const freshRecurrence = (): HostRecurrence => ({ enabled: false, days: [], cadence: 'weekly', endDate: defaultRecurrenceEndDate(new Date()) })

/**
 * The event detail page caches EVENT_DETAIL_SELECT under `event:<id>`, which
 * carries every field the edit form needs. Coming from that page the form can
 * paint at once; the edit fetch still runs and refreshes it (see loadEventForEdit).
 */
function cachedEditSource(editId: string | null): EventEditSource | null {
  if (!editId) return null
  const row = getQueryData<EventWithDetails | null>(eventKeys.root(editId))
  if (!row || !('latitude' in row) || !('venmo_handle' in row)) return null
  return row as unknown as EventEditSource
}

export function useHostForm({ editId, params, clubIdParam, userId, sessionLoading }: {
  editId: string | null
  params: HostFormParams
  clubIdParam: string | null
  userId: string | null
  sessionLoading: boolean
}) {
  // Read once on mount: the cached detail row seeds the form's initial state.
  const [seed] = useState(() => cachedEditSource(editId))
  const [form, setForm] = useState<CreateEventForm>(() => seed ? formFromEvent(seed) : formFromParams(EMPTY_FORM, params))
  const [recurrence, setRecurrence] = useState<HostRecurrence>(freshRecurrence)
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>(() => seed ? seed.event_tags.map(et => et.tag_id) : [])
  const [selectedClubId, setSelectedClubId] = useState<string | null>(seed?.club_id ?? clubIdParam)
  const formRef = useRef(form)
  formRef.current = form
  const selectedTagIdsRef = useRef(selectedTagIds)
  selectedTagIdsRef.current = selectedTagIds
  const selectedClubIdRef = useRef(selectedClubId)
  selectedClubIdRef.current = selectedClubId

  // Editing: the event being edited is loaded into the form once
  const [editState, setEditState] = useState<'idle' | 'loading' | 'loaded' | 'error'>(seed ? 'loaded' : editId ? 'loading' : 'idle')
  /** What the form showed when last filled from the server (seed or fetch). */
  const filledRef = useRef<{ form: CreateEventForm; tags: string[]; club: string | null } | null>(
    seed ? { form, tags: selectedTagIds, club: selectedClubId } : null,
  )

  const loadEventForEdit = useCallback(async (id: string, opts?: { force?: boolean }): Promise<boolean> => {
    const { data, error } = await supabase
      .from('events')
      .select(EVENT_EDIT_SELECT)
      .eq('id', id)
      .single()
    if (error || !data) return false

    const loadedTagIds = (data.event_tags ?? []).map((et: { tag_id: string }) => et.tag_id)
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

  /** Pull to refresh: the server's copy, even over the host's changes. */
  const reloadEdit = useCallback(
    () => (editId && userId ? loadEventForEdit(editId, { force: true }) : Promise.resolve(true)),
    [editId, userId, loadEventForEdit],
  )

  const setField = useCallback(<K extends keyof CreateEventForm>(key: K, value: CreateEventForm[K]) => {
    setForm(prev => ({ ...prev, [key]: value }))
  }, [])

  const toggleTag = useCallback((id: string) => {
    setSelectedTagIds(prev => prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id])
  }, [])

  /** After a create: a blank form for the next game. */
  const reset = useCallback(() => {
    setForm(EMPTY_FORM)
    setRecurrence(freshRecurrence())
    setSelectedTagIds([])
    setSelectedClubId(null)
  }, [])

  return {
    seed, form, setForm, setField, recurrence, setRecurrence,
    selectedTagIds, setSelectedTagIds, toggleTag, selectedClubId, setSelectedClubId,
    editState, loadEdit, reloadEdit, reset,
  }
}
