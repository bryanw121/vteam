import React from 'react'
import { Platform } from 'react-native'
import { AddGuestDialog } from './AddGuestDialog'
import { CohostsDialog } from './CohostsDialog'
import { DenyRequestDialog } from './DenyRequestDialog'
import { DeleteEventDialog } from './DeleteEventDialog'
import { RemoveParticipantDialog } from './RemoveParticipantDialog'
import { LeaveSheet } from './LeaveSheet'
import { JoinIntentSheet } from './JoinIntentSheet'
import type { AttendanceStatus, CohostsApi, EventAttendanceApi, EventDialog, EventWithDetails, JoinIntentApi, LeaveFlowApi, RemoveDialogApi } from '../../types'

type Props = {
  event: EventWithDetails | undefined
  status: AttendanceStatus
  hostName: string
  viewerFirstName: string | null
  isMobileWeb: boolean
  dialog: EventDialog
  onCloseDialog: () => void
  attendance: EventAttendanceApi
  cohosts: CohostsApi
  removeDialog: RemoveDialogApi
  joinIntent: JoinIntentApi
  leave: LeaveFlowApi
  onPlayerSetup: () => void
  onConfirmDelete: () => void
}

/**
 * Every sheet and dialog on the event screen (#354), so opening one re-renders
 * this host rather than the screen and its tabs: the join offer after sign-up,
 * the leave sheet, and the host's +1 / co-hosts / deny / remove / delete dialogs.
 * Desktop web shows the two sheets as dialogs.
 */
export function EventDialogs(p: Props) {
  const layout = Platform.OS === 'web' && !p.isMobileWeb ? 'dialog' : 'sheet'
  const intent = p.joinIntent.joinIntent
  const denyTarget = p.dialog?.kind === 'deny' ? p.dialog.target : null

  async function confirmRemove() {
    const target = p.removeDialog.target
    if (target && (await p.attendance.removeParticipant(target))) p.removeDialog.close()
  }
  async function confirmDeny(reason: string) {
    if (denyTarget && (await p.attendance.denyRequest(denyTarget.userId, reason))) p.onCloseDialog()
  }

  return (
    <>
      {intent && p.event && (
        <JoinIntentSheet
          stage={intent.stage}
          layout={layout}
          offer={intent.offer}
          firstName={p.viewerFirstName}
          title={p.event.title}
          when={p.joinIntent.when}
          spotsLeft={p.status.spotsLeft}
          joining={p.attendance.joining}
          onJoin={() => { void p.joinIntent.confirm() }}
          onNotNow={p.joinIntent.dismiss}
          onSetup={() => { p.joinIntent.clear(); p.onPlayerSetup() }}
          onLater={p.joinIntent.clear}
        />
      )}
      <LeaveSheet
        visible={p.leave.sheet !== null}
        layout={layout}
        subtitle={p.leave.sheet?.subtitle ?? ''}
        lines={p.leave.sheet?.lines ?? []}
        hostName={p.hostName}
        showReason={p.leave.sheet?.showReason ?? false}
        leaving={p.attendance.joining}
        onLeave={(reason, note) => { void p.leave.confirm(reason, note) }}
        onCancel={p.leave.cancel}
      />
      <AddGuestDialog
        visible={p.dialog?.kind === 'guest'}
        adding={p.attendance.addingGuest}
        onDismiss={p.onCloseDialog}
        onSubmit={p.attendance.addGuest}
      />
      <CohostsDialog cohosts={p.cohosts} />
      <DenyRequestDialog
        target={denyTarget}
        processing={p.attendance.processingRequest !== null}
        onCancel={p.onCloseDialog}
        onConfirm={reason => { void confirmDeny(reason) }}
      />
      <RemoveParticipantDialog
        target={p.removeDialog.target}
        armed={p.removeDialog.armed}
        removing={p.attendance.removing}
        onCancel={p.removeDialog.close}
        onConfirm={() => { void confirmRemove() }}
      />
      <DeleteEventDialog
        visible={p.dialog?.kind === 'delete'}
        onCancel={p.onCloseDialog}
        onConfirm={() => { p.onCloseDialog(); p.onConfirmDelete() }}
      />
    </>
  )
}
