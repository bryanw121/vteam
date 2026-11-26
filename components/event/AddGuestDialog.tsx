import React, { useState } from 'react'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { Input } from '../Input'

type Props = {
  visible: boolean
  adding: boolean
  /** Backdrop / hardware back: hide but keep the draft. */
  onDismiss: () => void
  /** Resolves true when the guest was saved (the draft is then cleared). */
  onSubmit: (firstName: string, lastName: string) => Promise<boolean>
}

/** "Add a +1": first + last name for a guest without an account. */
export function AddGuestDialog({ visible, adding, onDismiss, onSubmit }: Props) {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const clear = () => { setFirstName(''); setLastName('') }

  async function submit() {
    if (await onSubmit(firstName, lastName)) {
      clear()
      onDismiss()
    }
  }

  return (
    <ConfirmDialog
      visible={visible}
      title="Add a +1"
      confirmLabel="Add"
      loading={adding}
      confirmDisabled={!firstName.trim() || !lastName.trim()}
      onConfirm={() => { void submit() }}
      // The backdrop and back keep the draft (onDismiss); Cancel is the same here: a
      // half-typed name stays until it's saved or the event page closes.
      onCancel={onDismiss}
      testIDPrefix="add-guest-dialog"
    >
      <Input placeholder="First name" value={firstName} onChangeText={setFirstName} autoCapitalize="words" />
      <Input placeholder="Last name" value={lastName} onChangeText={setLastName} autoCapitalize="words" />
    </ConfirmDialog>
  )
}
