import React from 'react'
import { View } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Text } from '../ui/Text'
import { Button } from '../Button'
import { shared, theme } from '../../constants'
import { BRING_COPY } from '../../constants/bringItems'
import { bringCoverage, bringItemAction, bringItemStatus } from '../../utils/bringList'
import type { BringItem, BringViewer } from '../../types'

type Props = {
  items: BringItem[]
  viewer: BringViewer
  pending: boolean
  onClaim: (item: BringItem, quantity: number) => void
  onRelease: (item: BringItem) => void
  /** A guest tapped a claim button: sign in first. */
  onSignIn: () => void
}

const STATUS_STYLE = { ok: shared.bringStatusOk, need: shared.bringStatusNeed, muted: shared.bringStatusMuted } as const

/**
 * What to bring (#256) on the event's Details tab: the host's list, who is
 * bringing what, and one button per item. Hidden when the event has no list.
 */
export function BringListCard({ items, viewer, pending, onClaim, onRelease, onSignIn }: Props) {
  if (items.length === 0) return null
  const { covered, total } = bringCoverage(items)
  const anyMine = items.some(i => bringItemAction(i, viewer).kind === 'release')
  return (
    <View style={shared.bringCard} testID="bring-list-card">
      <View style={shared.bringHeader}>
        <Text style={shared.bringTitle} accessibilityRole="header">{BRING_COPY.title}</Text>
        <Text style={shared.bringCount} testID="bring-list-coverage">{BRING_COPY.covered(covered, total)}</Text>
      </View>
      {items.map(item => {
        const action = bringItemAction(item, viewer)
        const status = bringItemStatus(item, viewer.userId)
        const done = item.claimed >= item.quantity
        return (
          <View key={item.id} style={shared.bringRow} testID="bring-item">
            <View style={shared.bringIcon}>
              <Ionicons
                name={done ? 'checkmark-circle' : item.required ? 'alert-circle-outline' : 'ellipse-outline'}
                size={20}
                color={done ? theme.colors.success : item.required ? theme.colors.warning : theme.colors.primaryText}
              />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={shared.bringLabel}>
                {item.label}{item.quantity > 1 ? ` · ${item.quantity}` : ''}
              </Text>
              <Text style={STATUS_STYLE[status.tone]} testID="bring-item-status">{status.text}</Text>
            </View>
            {action.kind === 'claim' && (
              <Button
                label={action.label}
                variant="secondary"
                size="touch"
                fullWidth={false}
                disabled={pending}
                onPress={() => onClaim(item, action.quantity)}
                accessibilityLabel={`${action.label}: ${item.label}`}
                testID="bring-item-claim"
              />
            )}
            {action.kind === 'release' && (
              <Button
                label={action.label}
                icon="checkmark"
                variant="ghost"
                size="touch"
                fullWidth={false}
                disabled={pending}
                onPress={() => onRelease(item)}
                accessibilityLabel={`You're bringing ${item.label}. Tap to let go.`}
                testID="bring-item-release"
              />
            )}
            {action.kind === 'signIn' && (
              <Button
                label={BRING_COPY.claim}
                variant="secondary"
                size="touch"
                fullWidth={false}
                onPress={onSignIn}
                accessibilityLabel={`Sign in to bring ${item.label}`}
                testID="bring-item-sign-in"
              />
            )}
          </View>
        )
      })}
      {!viewer.closed && viewer.userId && !viewer.canClaim && items.some(i => i.claimed < i.quantity) ? (
        <Text style={shared.bringHint} testID="bring-list-join-hint">{BRING_COPY.joinToBring}</Text>
      ) : null}
      {anyMine ? <Text style={shared.bringHint}>{BRING_COPY.letGoHint}</Text> : null}
    </View>
  )
}
