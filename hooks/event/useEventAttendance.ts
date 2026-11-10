import { useState } from 'react'
import { Alert } from 'react-native'
import { supabase } from '../../lib/supabase'
import { useMutation } from '../../lib/query'
import { useGoToSignIn, useRequireSignIn } from '../useRequireSignIn'
import { setPendingAction } from '../../utils/pendingAction'
import { track } from '../../lib/analytics'
import { ANALYTICS_EVENTS } from '../../constants/analytics'
import { ATTENDEE_SELECT, EVENT_JUST_FILLED_BODY, EVENT_JUST_FILLED_TITLE, GENERIC_ERROR_MESSAGE, GUEST_SELECT } from '../../constants'
import type {
  EventAttendee, EventAttendeeWithProfile, EventGuest, EventWithDetails, NotificationType, Profile, RemoveTarget,
  SelfAttendanceAction, SetNoShowArgs, TablesInsert,
} from '../../types'
import { eventKeys, patchQuery } from './keys'
import { attendeeRowsWithProfiles } from './derive'
import { eventBreadcrumb, reportEventError } from './telemetry'
import type { EventData } from '../../types'

const OPTIMISTIC_STATUS: Partial<Record<SelfAttendanceAction, EventAttendee['status']>> = {
  join: 'attending',
  joinWaitlist: 'waitlisted',
  requestToJoin: 'requested',
  rerequest: 'requested',
}

/** Sentry labels kept from the pre-hook screen so dashboards keep matching. */
const BREADCRUMB: Record<SelfAttendanceAction, string> = {
  join: 'event:join',
  leave: 'event:leave',
  joinWaitlist: 'event:join_waitlist',
  leaveWaitlist: 'event:leave_waitlist',
  requestToJoin: 'event:request_join',
  cancelRequest: 'event:cancel_request',
  rerequest: 'event:rerequest_join',
}
const ERROR_CONTEXT: Record<SelfAttendanceAction, string> = {
  join: 'handleToggleAttendance',
  leave: 'handleToggleAttendance',
  joinWaitlist: 'handleJoinWaitlist',
  leaveWaitlist: 'handleLeaveWaitlist',
  requestToJoin: 'handleRequestToJoin',
  cancelRequest: 'handleCancelRequest',
  rerequest: 'handleRerequest',
}

/** A host delete that matched no rows: RLS is missing the host-remove policy. */
class NothingDeletedError extends Error {}

/** Apply `fn` to the cached event's attendee rows (no-op until the event has loaded). */
function patchAttendees(id: string, fn: (rows: EventAttendeeWithProfile[]) => EventAttendeeWithProfile[]) {
  patchQuery<EventWithDetails | null>(eventKeys.root(id), ev =>
    ev ? { ...ev, event_attendees: fn(attendeeRowsWithProfiles(ev)) } : ev,
  )
}

/**
 * Put `row` in place of `userId`'s row (in place if present, else appended),
 * or remove it when `row` is null. Returns the row it replaced, for rollback.
 */
export function setAttendeeRow(id: string, userId: string, row: EventAttendeeWithProfile | null) {
  let previous: EventAttendeeWithProfile | null = null
  patchAttendees(id, rows => {
    const idx = rows.findIndex(r => r.user_id === userId)
    previous = idx === -1 ? null : rows[idx]
    if (!row) return rows.filter(r => r.user_id !== userId)
    if (idx === -1) return [...rows, row]
    const next = [...rows]
    next[idx] = row
    return next
  })
  return previous as EventAttendeeWithProfile | null
}

function patchGuests(id: string, fn: (rows: EventGuest[]) => EventGuest[]) {
  patchQuery<EventGuest[]>(eventKeys.guests(id), fn)
}

async function notify(row: TablesInsert<'notifications'> & { notification_type: NotificationType }) {
  // Best effort, as before: the RSVP itself already succeeded.
  await supabase.from('notifications').insert(row)
}

/**
 * Join / leave / waitlist / paid-request flows for the viewer, and the host's
 * roster actions. Viewer writes are optimistic: the cached event row flips
 * immediately, the insert's `.select(ATTENDEE_SELECT)` read-back replaces the
 * guess with the server's row (status + embedded profile — so this works even
 * before the viewer's own profile has loaded), and an error rolls back.
 */
export function useEventAttendance(data: EventData) {
  const { id, userId, event, viewerProfile, roster } = data
  const requireSignIn = useRequireSignIn()
  const goToSignIn = useGoToSignIn()

  const self = useMutation(
    async (action: SelfAttendanceAction): Promise<EventAttendeeWithProfile | null> => {
      const uid = userId as string
      const deleteMine = async () => {
        const { error } = await supabase.from('event_attendees').delete().eq('event_id', id).eq('user_id', uid)
        if (error) throw error
      }
      const insertMine = async (status?: EventAttendee['status']) => {
        // The database enforces capacity: a plain join that lost the last spot is
        // saved as 'waitlisted', so always read back the row we actually got.
        const { data: row, error } = await supabase
          .from('event_attendees')
          .insert(status ? { event_id: id, user_id: uid, status } : { event_id: id, user_id: uid })
          .select(ATTENDEE_SELECT)
          .single()
        if (error) throw error
        // via unknown: ATTENDEE_SELECT reads no_show, which types/database.ts gets only when regenerated after #151 merges.
        return row as unknown as EventAttendeeWithProfile
      }

      switch (action) {
        case 'leave':
        case 'leaveWaitlist':
        case 'cancelRequest':
          await deleteMine()
          return null
        case 'join':
          return insertMine()
        case 'joinWaitlist':
          return insertMine('waitlisted')
        case 'requestToJoin':
        case 'rerequest': {
          if (action === 'rerequest') await deleteMine()
          const row = await insertMine('requested')
          if (event?.created_by && event.created_by !== uid) {
            await notify({
              user_id: event.created_by,
              notification_type: 'join_request',
              title: 'New join request',
              body: action === 'rerequest'
                ? `Someone re-requested to join "${event.title}"`
                : `Someone requested to join "${event.title}"`,
              data: { event_id: id, requester_id: uid },
            })
          }
          return row
        }
      }
    },
    {
      onMutate: action => {
        const uid = userId as string
        const status = OPTIMISTIC_STATUS[action]
        const optimistic: EventAttendeeWithProfile | null = status
          ? {
              event_id: id,
              user_id: uid,
              joined_at: new Date().toISOString(),
              team_number: null,
              team_pinned: false,
              status,
              // The brief profile has no position/skill; the server row from
              // onSuccess fills them in.
              profiles: viewerProfile ? { ...viewerProfile, position: [], skill_level: null, created_at: '' } : null,
            }
          : null
        const previous = setAttendeeRow(id, uid, optimistic)
        return () => { setAttendeeRow(id, uid, previous) }
      },
      onSuccess: (row, action) => {
        setAttendeeRow(id, userId as string, row)
        const savedStatus = row?.status
        eventBreadcrumb(id, userId, BREADCRUMB[action], { eventTitle: event?.title, savedStatus })
        if (action === 'join' && savedStatus === 'waitlisted') {
          Alert.alert(EVENT_JUST_FILLED_TITLE, EVENT_JUST_FILLED_BODY)
        }
      },
      onError: (e, action) => {
        reportEventError(id, userId, ERROR_CONTEXT[action], e, action === 'join' || action === 'leave' ? { action } : undefined)
        Alert.alert('Error', action === 'rerequest' ? e.message : GENERIC_ERROR_MESSAGE)
      },
    },
  )

  /**
   * Guests are sent to sign up for actions that create an RSVP, and the join is
   * remembered (#229): after the account exists they land back here with a
   * "Grab your spot?" sheet (`takePendingAction` on the event screen).
   */
  const run = (action: SelfAttendanceAction) => {
    if (!userId) {
      if (OPTIMISTIC_STATUS[action]) {
        if (event) {
          const taken = roster.attendingRows.length + roster.attendingGuests.length
          const spotsLeft = event.max_attendees ? Math.max(0, event.max_attendees - taken) : null
          setPendingAction({ kind: 'join', eventId: id, title: event.title, startsAt: event.event_date, at: Date.now(), spotsLeft })
          track(ANALYTICS_EVENTS.joinIntentSaved, { action })
          goToSignIn('register')
        } else {
          requireSignIn()
        }
      }
      return Promise.resolve(undefined)
    }
    return self.mutate(action)
  }

  // ─── Host: paid-event requests ─────────────────────────────────────────────
  const [processingRequest, setProcessingRequest] = useState<string | null>(null)

  const decide = useMutation(
    async (vars: { userId: string; approve: boolean; reason?: string }) => {
      const reason = vars.approve ? null : (vars.reason ?? '').trim() || null
      const { error } = await supabase
        .from('event_attendees')
        .update({ status: vars.approve ? 'attending' : 'denied', denial_reason: reason })
        .eq('event_id', id)
        .eq('user_id', vars.userId)
      if (error) throw error
      await notify(vars.approve
        ? {
            user_id: vars.userId,
            notification_type: 'request_approved',
            title: 'Request approved',
            body: `Your request to join "${event?.title}" was approved`,
            data: { event_id: id },
          }
        : {
            user_id: vars.userId,
            notification_type: 'request_denied',
            title: 'Request denied',
            body: reason
              ? `Your request to join "${event?.title}" was denied: ${reason}`
              : `Your request to join "${event?.title}" was denied`,
            data: { event_id: id, denial_reason: reason },
          })
      return reason
    },
    {
      onMutate: vars => { setProcessingRequest(vars.userId) },
      onSuccess: (reason, vars) => {
        setProcessingRequest(null)
        eventBreadcrumb(id, userId, vars.approve ? 'event:approve_request' : 'event:deny_request', {
          [vars.approve ? 'approvedUserId' : 'deniedUserId']: vars.userId,
          eventTitle: event?.title,
        })
        patchAttendees(id, rows => rows.map(r =>
          r.user_id === vars.userId ? { ...r, status: vars.approve ? 'attending' : 'denied', denial_reason: reason } : r,
        ))
      },
      onError: (e, vars) => {
        setProcessingRequest(null)
        reportEventError(id, userId, vars.approve ? 'handleApproveRequest' : 'handleDenyRequest', e, { requestedUserId: vars.userId })
        Alert.alert('Error', vars.approve ? GENERIC_ERROR_MESSAGE : e.message)
      },
    },
  )

  // ─── Host: waitlist promotion ──────────────────────────────────────────────
  const promote = useMutation(
    async (waitlistUserId: string) => {
      const { error } = await supabase
        .from('event_attendees')
        .update({ status: 'attending' })
        .eq('event_id', id)
        .eq('user_id', waitlistUserId)
      if (error) throw error
    },
    {
      onSuccess: (_r, uid) => patchAttendees(id, rows => rows.map(r => (r.user_id === uid ? { ...r, status: 'attending' } : r))),
      onError: (e, uid) => {
        reportEventError(id, userId, 'handleApproveFromWaitlist', e, { promotedUserId: uid })
        Alert.alert('Error', GENERIC_ERROR_MESSAGE)
      },
    },
  )

  function approveFromWaitlist(waitlistUserId: string) {
    const attendingCount = roster.attendingRows.length
    if (event?.max_attendees && attendingCount >= event.max_attendees) {
      Alert.alert('Event full', 'The event is still full. Remove an attendee first or increase the capacity.')
      return Promise.resolve(undefined)
    }
    return promote.mutate(waitlistUserId)
  }

  // ─── Host / co-host: no-show flag (#151) ───────────────────────────────────
  // Optimistic: the badge shows at once; a rejected call (window closed, not a
  // host any more) puts the row back and says why.
  const noShow = useMutation(
    async (vars: { userId: string; value: boolean }) => {
      const args: SetNoShowArgs = { p_event_id: id, p_user_id: vars.userId, p_value: vars.value }
      // TEMPORARY cast: set_no_show isn't in types/database.ts until it is regenerated from live after merge.
      const { error } = await supabase.rpc('set_no_show' as never, args as never)
      if (error) throw error
      return true
    },
    {
      onMutate: vars => {
        const markedAt = vars.value ? new Date().toISOString() : null
        let previous: EventAttendeeWithProfile | undefined
        patchAttendees(id, rows => rows.map(r => {
          if (r.user_id !== vars.userId) return r
          previous = r
          return { ...r, no_show: vars.value, no_show_marked_at: markedAt, no_show_marked_by: vars.value ? userId : null }
        }))
        return () => {
          const before = previous
          if (before) patchAttendees(id, rows => rows.map(r => (r.user_id === vars.userId ? before : r)))
        }
      },
      onSuccess: (_r, vars) => eventBreadcrumb(id, userId, vars.value ? 'event:mark_no_show' : 'event:undo_no_show', { targetUserId: vars.userId }),
      onError: (e, vars) => {
        reportEventError(id, userId, 'handleSetNoShow', e, { targetUserId: vars.userId, value: vars.value })
        Alert.alert('Error', e.message || GENERIC_ERROR_MESSAGE)
      },
    },
  )

  // ─── Host: remove an attendee or +1 ────────────────────────────────────────
  const remove = useMutation(
    async (target: RemoveTarget) => {
      if (target.kind === 'guest') {
        const { data: rows, error } = await supabase.from('event_guests').delete().eq('id', target.guestId).select('id')
        if (error) throw error
        if (!rows?.length) {
          throw new NothingDeletedError(
            'Nothing was deleted. As host, ensure the Supabase delete policy for event_guests is installed (see supabase/event_host_remove_attendees.sql).',
          )
        }
      } else {
        const { data: rows, error } = await supabase
          .from('event_attendees')
          .delete()
          .eq('event_id', id)
          .eq('user_id', target.userId)
          .select('user_id')
        if (error) throw error
        if (!rows?.length) {
          throw new NothingDeletedError(
            'Nothing was deleted. As host, add the Supabase policy so hosts can remove other attendees — run supabase/event_host_remove_attendees.sql in the SQL editor.',
          )
        }
      }
      return true
    },
    {
      onSuccess: (_r, target) => {
        if (target.kind === 'guest') patchGuests(id, rows => rows.filter(g => g.id !== target.guestId))
        else setAttendeeRow(id, target.userId, null)
      },
      onError: (e, target) => {
        const context = target.kind === 'guest' ? 'confirmRemoveFromModal:guest' : 'confirmRemoveFromModal:attendee'
        const extra = target.kind === 'guest' ? { guestId: target.guestId } : { removedUserId: target.userId }
        if (e instanceof NothingDeletedError) {
          if (target.kind === 'attendee') reportEventError(id, userId, context, new Error('Delete returned empty — missing RLS policy'), extra)
          Alert.alert('Could not remove', e.message)
        } else {
          reportEventError(id, userId, context, e, extra)
          Alert.alert('Error', e.message)
        }
      },
    },
  )

  // ─── +1 guests ─────────────────────────────────────────────────────────────
  const addGuestMutation = useMutation(
    async (name: { firstName: string; lastName: string }) => {
      if (!userId) throw new Error('Sign in to continue.')
      const attendingCount = roster.attendingRows.length + roster.attendingGuests.length
      const isFull = event?.max_attendees ? attendingCount >= event.max_attendees : false
      const { data: row, error } = await supabase
        .from('event_guests')
        .insert({
          event_id: id,
          added_by: userId,
          first_name: name.firstName.trim(),
          last_name: name.lastName.trim(),
          status: isFull ? 'waitlisted' : 'attending',
        })
        .select(GUEST_SELECT)
        .single()
      if (error) throw error
      // The database may have waitlisted the guest if the event filled up meanwhile.
      return row as EventGuest
    },
    {
      onSuccess: guest => patchGuests(id, rows => [...rows, guest]),
      onError: e => {
        reportEventError(id, userId, 'handleAddGuest', e)
        Alert.alert('Error', GENERIC_ERROR_MESSAGE)
      },
    },
  )

  async function addGuest(firstName: string, lastName: string): Promise<boolean> {
    if (!userId || !firstName.trim() || !lastName.trim()) return false
    return (await addGuestMutation.mutate({ firstName, lastName })) !== undefined
  }

  return {
    /** Any viewer RSVP write is in flight. */
    joining: self.isPending,
    join: () => run('join'),
    leave: () => run('leave'),
    joinWaitlist: () => run('joinWaitlist'),
    leaveWaitlist: () => run('leaveWaitlist'),
    requestToJoin: () => run('requestToJoin'),
    cancelRequest: () => run('cancelRequest'),
    rerequest: () => run('rerequest'),

    /** User id of the request being approved/denied, if any. */
    processingRequest,
    approveRequest: (requestedUserId: string) => decide.mutate({ userId: requestedUserId, approve: true }),
    /** Resolves to true once the denial is saved (the dialog closes then). */
    denyRequest: async (requestedUserId: string, reason: string) =>
      (await decide.mutate({ userId: requestedUserId, approve: false, reason })) !== undefined,
    approveFromWaitlist,

    /** Host / co-host: flag (or unflag) an attending player as a no-show. Resolves to true once saved. */
    setNoShow: async (targetUserId: string, value: boolean) => (await noShow.mutate({ userId: targetUserId, value })) === true,
    settingNoShow: noShow.isPending,

    removing: remove.isPending,
    /** Resolves to true once the row is gone. */
    removeParticipant: async (target: RemoveTarget) => (await remove.mutate(target)) === true,

    addingGuest: addGuestMutation.isPending,
    addGuest,
  }
}


/** Profile fields the remove dialog needs from a roster card. */
export function attendeeRemoveTarget(p: Profile): RemoveTarget {
  return { kind: 'attendee', userId: p.id, firstName: p.first_name, lastName: p.last_name, username: p.username }
}

export function guestRemoveTarget(g: EventGuest): RemoveTarget {
  return { kind: 'guest', guestId: g.id, firstName: g.first_name, lastName: g.last_name }
}
