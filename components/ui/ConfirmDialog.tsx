import { Modal, Pressable, StyleSheet, View } from 'react-native'
import { Text } from './Text'
import { shared, theme } from '../../constants'
import { Button } from '../Button'
import type { ConfirmDialogProps } from '../../types'

/**
 * Centered confirm/cancel dialog. Backdrop and card are siblings (not nested touchables)
 * so Cancel cannot bubble to the backdrop and double-close. While `loading`, the backdrop,
 * hardware back and Cancel are inert so a pending request cannot be abandoned half-way.
 */
export function ConfirmDialog({
  visible, title, body, confirmLabel, cancelLabel = 'Cancel',
  destructive, onConfirm, onCancel, loading, children, width, testIDPrefix = 'confirm-dialog',
}: ConfirmDialogProps) {
  const dismiss = () => { if (!loading) onCancel() }
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={dismiss}>
      <View style={shared.modalOverlayPlain} testID={testIDPrefix}>
        <Pressable
          style={[StyleSheet.absoluteFill, { backgroundColor: theme.colors.overlayLight }]}
          onPress={dismiss}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          // Esc / back already dismiss; keep keyboard Tab on the sheet's own controls.
          tabIndex={-1}
          testID={`${testIDPrefix}-backdrop`}
        />
        <View style={[shared.dialogCard, width ? { width } : null]} accessibilityViewIsModal role="dialog" aria-label={title}>
          <Text style={shared.dialogTitle} accessibilityRole="header">{title}</Text>
          {!!body && <Text style={shared.dialogBody}>{body}</Text>}
          {children}
          <View style={shared.dialogActions}>
            <View style={shared.dialogAction}>
              <Button label={cancelLabel} variant="secondary" onPress={onCancel} disabled={loading} testID={`${testIDPrefix}-cancel`} />
            </View>
            <View style={shared.dialogAction}>
              <Button
                label={confirmLabel}
                variant={destructive ? 'danger' : 'primary'}
                onPress={onConfirm}
                loading={loading}
                testID={`${testIDPrefix}-confirm`}
              />
            </View>
          </View>
        </View>
      </View>
    </Modal>
  )
}
