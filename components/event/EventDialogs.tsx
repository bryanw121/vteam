import React from 'react'
import { Platform } from 'react-native'
import type { EventAttendanceApi, EventWithDetails } from '../../types'
import type { EventDialogApi } from '../../hooks/event/useEventDialog'
import type { useJoinIntent } from '../../hooks/event/useJoinIntent'
import type { useLeaveFlow } from '../../hooks/event/useLeaveFlow'
import type { useCohosts } from '../../hooks/event/useCohosts'
import type { useRemoveDialog } from '../../hooks/event/useRemoveDialog'
import { joinIntentWhen } from '../../utils/eventDetail'
import { AddGuestDialog } from './AddGuestDialog'
import { CohostsDialog } from './CohostsDialog'
import { DeleteEventDialog } from './DeleteEventDialog'
import { DenyRequestDialog } from './DenyRequestDialog'
import { JoinIntentSheet } from './JoinIntentSheet'
import { LeaveSheet } from './LeaveSheet'
import { RemoveParticipantDialog } from './RemoveParticipantDialog'

type Props = {
  event: EventWithDetails | null | undefined
  dialog: EventDialogApi
  attendance: EventAttendanceApi
  joinIntent: ReturnType<typeof useJoinIntent>
  leave: ReturnType<typeof useLeaveFlow>
  cohosts: ReturnType<typeof useCohosts>
  removeDialog: ReturnType<typeof useRemoveDialog>
  hostName: string
  firstName: string | null
  spotsLeft: number | null
  isMobileWeb: boolean
  onDelete: () => void
}

/**
 * Every dialog and sheet over the event screen (#354). Which one is open is one value
 * (`useEventDialog`); removing a participant and co-hosts keep their own hooks.
 */
export function EventDialogs({ event, dialog, attendance, joinIntent, leave, cohosts, removeDialog, hostName, firstName, spotsLeft, isMobileWeb, onDelete }: Props) {
  const open = dialog.dialog
  const layout = Platform.OS === 'web' && !isMobileWeb ? 'dialog' : 'sheet'
  const deny = open?.kind === 'deny' ? { userId: open.userId, displayName: open.displayName } : null

  async function confirmDeny(reason: string) {
    if (deny && (await attendance.denyRequest(deny.userId, reason))) dialog.close()
  }
  async function confirmRemove() {
    const target = removeDialog.target
    if (target && (await attendance.removeParticipant(target))) removeDialog.close()
  }

  return (
    <>
      {joinIntent.state && event && (
        <JoinIntentSheet
          stage={joinIntent.state.stage}
          layout={layout}
          offer={joinIntent.state.offer}
          firstName={firstName}
          title={event.title}
          when={joinIntentWhen(event.event_date)}
          spotsLeft={spotsLeft}
          joining={attendance.joining}
          onJoin={() => { void joinIntent.confirm() }}
          onNotNow={joinIntent.notNow}
          onSetup={joinIntent.setup}
          onLater={joinIntent.later}
        />
      )}
      <LeaveSheet
        visible={leave.sheet !== null}
        layout={layout}
        subtitle={leave.sheet?.subtitle ?? ''}
        lines={leave.sheet?.lines ?? []}
        hostName={hostName}
        showReason={leave.sheet?.showReason ?? false}
        leaving={attendance.joining}
        onLeave={(reason, note) => { void leave.confirm(reason, note) }}
        onCancel={leave.cancel}
      />
      <AddGuestDialog
        visible={open?.kind === 'guest'}
        adding={attendance.addingGuest}
        onDismiss={dialog.close}
        onSubmit={attendance.addGuest}
      />
      <CohostsDialog cohosts={cohosts} />
      <DenyRequestDialog
        target={deny}
        processing={attendance.processingRequest !== null}
        onCancel={dialog.close}
        onConfirm={reason => { void confirmDeny(reason) }}
      />
      <RemoveParticipantDialog
        target={removeDialog.target}
        armed={removeDialog.armed}
        removing={attendance.removing}
        onCancel={removeDialog.close}
        onConfirm={() => { void confirmRemove() }}
      />
      <DeleteEventDialog
        visible={open?.kind === 'delete'}
        onCancel={dialog.close}
        onConfirm={() => { dialog.close(); onDelete() }}
      />
    </>
  )
}
