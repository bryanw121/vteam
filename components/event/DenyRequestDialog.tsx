import React, { useEffect, useState } from 'react'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { Input } from '../Input'

type Props = {
  /** The request being denied; null = hidden. */
  target: { userId: string; displayName: string } | null
  processing: boolean
  onCancel: () => void
  onConfirm: (reason: string) => void
}

/** Host denies a paid-event join request, with an optional reason sent to the requester. */
export function DenyRequestDialog({ target, processing, onCancel, onConfirm }: Props) {
  const [reason, setReason] = useState('')
  // Each request starts with an empty reason.
  useEffect(() => { setReason('') }, [target?.userId])

  return (
    <ConfirmDialog
      visible={target !== null}
      title="Deny request"
      body={target ? `Denying ${target.displayName}'s request to join. They can re-request after seeing this.` : undefined}
      confirmLabel="Deny"
      destructive
      loading={processing}
      onConfirm={() => onConfirm(reason)}
      onCancel={onCancel}
      width={360}
      testIDPrefix="deny-request-dialog"
    >
      <Input
        placeholder="Reason (optional)"
        value={reason}
        onChangeText={setReason}
        multiline
        inputStyle={{ minHeight: 72 }}
      />
    </ConfirmDialog>
  )
}
