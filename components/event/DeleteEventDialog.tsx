import React from 'react'
import { Modal, StyleSheet, TouchableOpacity, View } from 'react-native'
import { Text } from '../ui/Text'
import { theme } from '../../constants'

type Props = {
  visible: boolean
  onCancel: () => void
  onConfirm: () => void
}

/**
 * "Delete event" confirm. Kept hand-built rather than `ui/ConfirmDialog`: this
 * one is 300px with compact right-aligned buttons and a larger body, and the
 * redesign keeps screens pixel-identical (fold it in during the Phase C sweep).
 */
export function DeleteEventDialog({ visible, onCancel, onConfirm }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onCancel}>
        <View style={styles.card}>
          <Text style={styles.title}>Delete event</Text>
          <Text style={styles.body}>Are you sure? This cannot be undone.</Text>
          <View style={styles.actions}>
            <TouchableOpacity onPress={onCancel} style={styles.cancel}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onConfirm} style={styles.confirm}>
              <Text style={styles.confirmText}>Delete</Text>
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.overlayLight },
  card: { backgroundColor: theme.colors.card, borderRadius: theme.radius.lg, padding: theme.spacing.xl, width: 300, gap: theme.spacing.md },
  title: { fontSize: theme.font.size.lg, fontWeight: theme.font.weight.semibold, color: theme.colors.text },
  body: { fontSize: theme.font.size.md, color: theme.colors.subtext },
  actions: { flexDirection: 'row', gap: theme.spacing.sm, justifyContent: 'flex-end' },
  cancel: {
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  cancelText: { color: theme.colors.text, fontSize: theme.font.size.md },
  confirm: {
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.error,
  },
  confirmText: { color: theme.colors.white, fontSize: theme.font.size.md, fontWeight: theme.font.weight.semibold },
})
