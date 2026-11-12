import React, { useMemo } from 'react'
import {
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native'
import { Text } from './ui/Text'
import { theme } from '../constants/theme'
import type { AnchorMenuOption, AnchorRect } from '../types'

const MENU_WIDTH = 224
const ROW_MIN_HEIGHT = 48
const PADDING_V = 8

type Props = {
  visible: boolean
  anchor: AnchorRect | null
  options: AnchorMenuOption[]
  onDismiss: () => void
}

export function AnchorOptionsMenu({ visible, anchor, options, onDismiss }: Props) {
  const layout = useMemo(() => {
    if (!anchor || !visible || options.length === 0) return null
    const win = Dimensions.get('window')
    const menuH = options.length * ROW_MIN_HEIGHT + PADDING_V * 2
    let top = anchor.y + anchor.height + 6
    if (top + menuH > win.height - 12) {
      top = Math.max(12, anchor.y - menuH - 6)
    }
    let left = anchor.x + anchor.width - MENU_WIDTH
    left = Math.max(10, Math.min(left, win.width - MENU_WIDTH - 10))
    return { top, left }
  }, [anchor, visible, options.length])

  if (!visible || !layout || options.length === 0) return null

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.root}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onDismiss} accessibilityLabel="Close menu" />
        <View
          style={[styles.menu, { top: layout.top, left: layout.left, width: MENU_WIDTH }]}
          accessibilityRole="menu"
        >
          <ScrollView keyboardShouldPersistTaps="handled" bounces={false}>
            {options.map((opt, i) => (
              <Pressable
                key={opt.key}
                accessibilityRole="menuitem"
                onPress={() => {
                  onDismiss()
                  setTimeout(() => opt.onPress(), 0)
                }}
                style={({ pressed }) => [
                  styles.row,
                  i > 0 && styles.rowBorder,
                  pressed && { backgroundColor: theme.colors.background },
                ]}
              >
                <Text
                  style={[
                    styles.rowLabel,
                    opt.destructive && { color: theme.colors.error },
                  ]}
                >
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  menu: {
    position: 'absolute',
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    maxHeight: 320,
    overflow: 'hidden',
    ...theme.shadow.md,
  },
  row: {
    minHeight: ROW_MIN_HEIGHT,
    paddingHorizontal: theme.spacing.md,
    justifyContent: 'center',
  },
  rowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
  },
  rowLabel: {
    fontSize: theme.font.size.md,
    color: theme.colors.text,
    fontWeight: theme.font.weight.medium,
  },
})
