import React from 'react'
import { ConfirmDialog } from '../ui/ConfirmDialog'

type Props = {
  visible: boolean
  onCancel: () => void
  onConfirm: () => void
}

/** "Delete event" confirm (#389: the shared dialog, like every other confirm). */
export function DeleteEventDialog({ visible, onCancel, onConfirm }: Props) {
  return (
    <ConfirmDialog
      visible={visible}
      title="Delete event"
      body="Are you sure? This cannot be undone."
      confirmLabel="Delete"
      destructive
      onConfirm={onConfirm}
      onCancel={onCancel}
      testIDPrefix="delete-event-dialog"
    />
  )
}
