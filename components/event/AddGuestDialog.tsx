import React, { useState } from 'react'
import { Modal, StyleSheet, TouchableOpacity, View } from 'react-native'
import { Text } from '../ui/Text'
import { Button } from '../Button'
import { Input } from '../Input'
import { theme } from '../../constants'

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
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onDismiss}>
        <TouchableOpacity activeOpacity={1} onPress={() => {}}>
          <View style={styles.card}>
            <Text style={styles.title}>Add a +1</Text>
            <Input placeholder="First name" value={firstName} onChangeText={setFirstName} autoCapitalize="words" />
            <Input placeholder="Last name" value={lastName} onChangeText={setLastName} autoCapitalize="words" />
            <View style={styles.actions}>
              <View style={{ flex: 1 }}>
                <Button label="Cancel" onPress={() => { clear(); onDismiss() }} variant="secondary" />
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  label="Add"
                  onPress={() => { void submit() }}
                  loading={adding}
                  disabled={!firstName.trim() || !lastName.trim()}
                />
              </View>
            </View>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.overlayLight },
  card: { backgroundColor: theme.colors.card, borderRadius: theme.radius.lg, padding: theme.spacing.xl, width: 300, gap: theme.spacing.md },
  title: { fontSize: theme.font.size.lg, fontWeight: theme.font.weight.semibold, color: theme.colors.text },
  actions: { flexDirection: 'row', gap: theme.spacing.sm },
})
