import { useMemo, useState } from 'react'
import { Pressable, View } from 'react-native'
import { Text } from '../ui/Text'
import { BottomSheet } from '../ui'
import { Button } from '../Button'
import { SheetBody } from './SheetParts'
import { TEAM_COLORS } from './teamColors'
import { shared, theme } from '../../constants'
import { describeEvent } from '../../lib/scoresheet/describe'
import { other, timeline } from '../../lib/scoresheet/engine'
import { teamName } from '../../lib/scoresheet/summary'
import type { MatchDoc, ScoreEventInput } from '../../types'

type Props = {
  visible: boolean
  onDismiss: () => void
  doc: MatchDoc
  onEdit: (eventId: string, patch: Partial<ScoreEventInput>) => void
  onRemove: (eventId: string) => void
  onInsert: (beforeEventId: string, input: ScoreEventInput) => void
}

/**
 * Everything recorded, newest first. Tap a row to fix it: give a rally to the other team,
 * delete something tapped by mistake, or insert a rally nobody tapped. Everything after the
 * change is worked out again (score, rotations, servers), and Undo reverses the fix.
 */
export function TimelineSheet({ visible, onDismiss, doc, onEdit, onRemove, onInsert }: Props) {
  const [open, setOpen] = useState<string | null>(null)
  const entries = useMemo(() => (visible ? timeline(doc.setup, doc.log).reverse() : []), [visible, doc])

  return (
    <BottomSheet visible={visible} onDismiss={() => { setOpen(null); onDismiss() }} title="Timeline">
      <SheetBody>
        {!entries.length && <Text style={shared.caption}>Nothing recorded yet.</Text>}
        {entries.map((entry, i) => {
          const ev = entry.event
          const prevSet = entries[i - 1]?.set
          const isOpen = open === ev.id
          const rallyColor = ev.type === 'rally' ? TEAM_COLORS[ev.winner].fill : theme.colors.border
          return (
            <View key={ev.id}>
              {entry.set != null && entry.set !== prevSet && <Text style={[shared.label, { marginTop: theme.spacing.sm }]}>Set {entry.set + 1}</Text>}
              <Pressable
                onPress={() => setOpen(isOpen ? null : ev.id)}
                accessibilityRole="button"
                accessibilityLabel={`${describeEvent(doc.setup, ev)}, score ${entry.score[0]} to ${entry.score[1]}. Tap to fix.`}
                testID={`timeline-${ev.id}`}
                style={({ pressed }) => [
                  { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, minHeight: 44, paddingVertical: theme.spacing.xs, borderLeftWidth: 3, borderLeftColor: rallyColor, paddingLeft: theme.spacing.sm },
                  pressed && { backgroundColor: theme.colors.background },
                ]}
              >
                <Text style={[shared.body, { flex: 1 }, entry.cancelled && { textDecorationLine: 'line-through', color: theme.colors.subtext }]} numberOfLines={2}>
                  {describeEvent(doc.setup, ev)}{entry.cancelled ? ' (cancelled)' : ''}
                </Text>
                <Text style={{ fontFamily: theme.fonts.display, fontSize: theme.font.size.md, color: theme.colors.subtextStrong }}>
                  {entry.score[0]}–{entry.score[1]}
                </Text>
              </Pressable>
              {isOpen && (
                <View style={{ gap: theme.spacing.sm, padding: theme.spacing.sm, backgroundColor: theme.colors.background, borderRadius: theme.radius.md, marginVertical: theme.spacing.xs }}>
                  {ev.type === 'rally' && (
                    <Button
                      size="touch"
                      label={`Point was ${teamName(doc, other(ev.winner))}'s`}
                      icon="swap-horizontal"
                      onPress={() => { onEdit(ev.id, { winner: other(ev.winner) } as Partial<ScoreEventInput>); setOpen(null) }}
                      testID="timeline-flip"
                    />
                  )}
                  {ev.type !== 'set_start' && (
                    <>
                      <Text style={shared.caption}>Missed a rally just before this?</Text>
                      <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
                        {(['A', 'B'] as const).map(side => (
                          <View key={side} style={{ flex: 1 }}>
                            <Button size="touch" variant="secondary" label={`+ ${teamName(doc, side)}`} onPress={() => { onInsert(ev.id, { type: 'rally', winner: side }); setOpen(null) }} testID={`timeline-insert-${side}`} />
                          </View>
                        ))}
                      </View>
                      <Button size="touch" variant="danger" icon="trash-outline" label="Delete this" onPress={() => { onRemove(ev.id); setOpen(null) }} testID="timeline-delete" />
                    </>
                  )}
                  {ev.type === 'set_start' && <Text style={shared.caption}>To redo a set's lineup, undo back to before it started.</Text>}
                </View>
              )}
            </View>
          )
        })}
      </SheetBody>
    </BottomSheet>
  )
}
