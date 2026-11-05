import { useRef } from 'react'
import { Pressable, View } from 'react-native'
import { Text } from '../ui/Text'
import type { PressableStateCallbackType } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { shared, theme } from '../../constants'
import { BottomSheet } from '../ui'
import type { IoniconName, RosterAction, RosterMenu } from '../../types'

type Props = {
  menu: RosterMenu | null
  onDismiss: () => void
}

const ICONS: Record<RosterAction['key'], IoniconName> = {
  message: 'chatbubble-outline',
  'message-adder': 'chatbubble-outline',
  profile: 'person-outline',
  remove: 'person-remove-outline',
}

/**
 * The People tab's per-row ⋯ menu. One instance for the whole tab (a roster
 * runs 12–24 rows). The chosen action runs after the sheet has closed, so
 * "Remove" can open its confirm dialog: iOS can't present a Modal while
 * another is still animating out.
 */
export function RosterActionsSheet({ menu, onDismiss }: Props) {
  const pending = useRef<(() => void) | null>(null)
  // Keep the last menu on screen while the sheet slides out.
  const last = useRef<RosterMenu | null>(menu)
  if (menu) last.current = menu
  const shown = menu ?? last.current

  function choose(action: RosterAction) {
    pending.current = action.onPress
    onDismiss()
  }

  function runPending() {
    const run = pending.current
    pending.current = null
    run?.()
  }

  return (
    <BottomSheet visible={menu !== null} onDismiss={onDismiss} onClosed={runPending} title={shown?.title}>
      <View style={{ gap: theme.spacing.xs }} testID="roster-actions">
        {shown?.actions.map(action => (
          <Pressable
            key={action.key}
            onPress={() => choose(action)}
            accessibilityRole="button"
            accessibilityLabel={action.label}
            style={(state: PressableStateCallbackType & { hovered?: boolean }) => [
              shared.sheetOption,
              (state.pressed || state.hovered) && shared.sheetOptionActive,
            ]}
          >
            <Ionicons
              name={ICONS[action.key]}
              size={18}
              color={action.destructive ? theme.colors.error : theme.colors.subtext}
            />
            <Text style={[shared.sheetOptionText, action.destructive && shared.sheetOptionDestructive]}>
              {action.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </BottomSheet>
  )
}
