import { useEffect, useRef } from 'react'
import { KeyboardAvoidingView, Modal, Platform, Pressable, View } from 'react-native'
import { Text } from './Text'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { shared, theme } from '../../constants'
import type { BottomSheetProps } from '../../types'

/**
 * Slide-up sheet on a transparent Modal: tap the empty area above it (or hardware back) to dismiss.
 * Like the tournament sheets it replaces, there is no dimming scrim. Padding-bottom adds the
 * safe-area inset, and the sheet lifts above the keyboard on native.
 *
 * `onClosed` fires once the sheet is gone: on iOS from the Modal's own onDismiss (after the
 * slide-out, so another Modal can be presented), elsewhere as soon as `visible` turns false.
 */
export function BottomSheet({ visible, onDismiss, title, children, onClosed }: BottomSheetProps) {
  const insets = useSafeAreaInsets()
  const onClosedRef = useRef(onClosed)
  onClosedRef.current = onClosed
  const wasVisible = useRef(visible)
  useEffect(() => {
    if (Platform.OS !== 'ios' && wasVisible.current && !visible) onClosedRef.current?.()
    wasVisible.current = visible
  }, [visible])

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onDismiss}
      onDismiss={Platform.OS === 'ios' ? () => onClosedRef.current?.() : undefined}
    >
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={shared.sheetRoot}>
        <Pressable
          style={{ flex: 1 }}
          onPress={onDismiss}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          // Esc / back already dismiss; keep keyboard Tab on the sheet's own controls.
          tabIndex={-1}
          testID="bottom-sheet-backdrop"
        />
        <View
          style={[shared.sheetCard, { paddingBottom: insets.bottom + theme.spacing.lg }]}
          testID="bottom-sheet"
          role={title ? 'dialog' : undefined}
          aria-label={title || undefined}
        >
          <View style={shared.sheetHandle} />
          {!!title && <Text style={shared.sheetTitle} accessibilityRole="header">{title}</Text>}
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}
