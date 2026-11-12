import { useMemo, useState } from 'react'
import { Pressable, ScrollView, View } from 'react-native'
import { Text } from '../ui/Text'
import { BADGE_DEFINITIONS, shared, theme } from '../../constants'
import type { BadgeDef } from '../../constants'
import { BadgeIcon } from '../BadgeIcon'
import { BottomSheet } from '../ui'
import type { UserBadge } from '../../types'

type Props = {
  /** The display slot being filled (1-3); null keeps the sheet closed. */
  slot: number | null
  badges: UserBadge[]
  onPick: (badgeType: string, slot: number, displayTier: number) => void
  onDismiss: () => void
}

type PickerItem = { badge: UserBadge; def: BadgeDef; displayTier: number }

const ITEM_WIDTH = 58

/**
 * Earned badges that can go in `slot`. Multi-tier badges expand to one item per
 * earned tier so the user can show, say, the Bronze spike instead of the Gold.
 */
export function pickerItemsFor(badges: UserBadge[], slot: number | null): PickerItem[] {
  const items: PickerItem[] = []
  badges
    .filter(b => b.tier > 0 && b.display_order !== slot)
    .forEach(badge => {
      const def = BADGE_DEFINITIONS.find(d => d.type === badge.badge_type)
      if (!def) return
      if (def.tiers.length > 1) {
        for (let t = 1; t <= badge.tier; t++) items.push({ badge, def, displayTier: t })
      } else {
        items.push({ badge, def, displayTier: 1 })
      }
    })
  return items
}

/** Bottom sheet for choosing which earned badge to pin to a profile display slot. */
export function BadgeSlotSheet({ slot, badges, onPick, onDismiss }: Props) {
  const [gridWidth, setGridWidth] = useState(0)
  const items = useMemo(() => pickerItemsFor(badges, slot), [badges, slot])
  const itemsPerRow = gridWidth > 0 ? Math.floor((gridWidth + theme.spacing.md) / (ITEM_WIDTH + theme.spacing.md)) : 0

  return (
    <BottomSheet visible={slot !== null} onDismiss={onDismiss} title={`Choose a badge for slot ${slot ?? ''}`}>
      {items.length === 0 ? (
        <Text style={[shared.caption, { textAlign: 'center', paddingVertical: theme.spacing.xl }]}>
          No earned badges available to add.
        </Text>
      ) : (
        <ScrollView
          onLayout={e => setGridWidth(e.nativeEvent.layout.width)}
          style={{ maxHeight: 360 }}
          contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.md, justifyContent: 'center' }}
        >
          {items.map(({ badge, def, displayTier }) => (
            <Pressable
              key={`${badge.badge_type}-${displayTier}`}
              onPress={() => {
                if (slot !== null) onPick(badge.badge_type, slot, displayTier)
                onDismiss()
              }}
              style={({ pressed }) => ({ opacity: pressed ? 0.65 : 1 })}
            >
              <BadgeIcon def={def} tier={displayTier} size="sm" showLabel />
            </Pressable>
          ))}
          {/* Spacers force the last row to start from the left while full rows stay centred. */}
          {Array.from({ length: Math.max(0, itemsPerRow - 1) }).map((_, i) => (
            <View key={`sp-${i}`} style={{ width: ITEM_WIDTH }} />
          ))}
        </ScrollView>
      )}
    </BottomSheet>
  )
}
