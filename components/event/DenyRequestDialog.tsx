import React, { useEffect, useState } from 'react'
import { Modal, Pressable, StyleSheet, View } from 'react-native'
import { Text } from '../ui/Text'
import { Button } from '../Button'
import { Input } from '../Input'
import { shared, theme } from '../../constants'

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
    <Modal visible={target !== null} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={shared.modalOverlayPlain}>
        <Pressable style={[StyleSheet.absoluteFillObject, { backgroundColor: theme.colors.overlayLight }]} onPress={onCancel} />
        <View style={[shared.card, styles.card]}>
          <Text style={shared.subheading}>Deny request</Text>
          {target && (
            <Text style={shared.caption}>Denying {target.displayName}'s request to join. They can re-request after seeing this.</Text>
          )}
          <Input
            placeholder="Reason (optional)"
            value={reason}
            onChangeText={setReason}
            multiline
            inputStyle={{ minHeight: 72 }}
          />
          <View style={[shared.row, { gap: theme.spacing.sm }]}>
            <View style={{ flex: 1 }}>
              <Button label="Cancel" onPress={onCancel} variant="secondary" disabled={processing} />
            </View>
            <View style={{ flex: 1 }}>
              <Button label="Deny" onPress={() => onConfirm(reason)} loading={processing} variant="danger" />
            </View>
          </View>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  card: { width: '85%', maxWidth: 360, gap: theme.spacing.md, zIndex: 1 },
})
