import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Text } from '../ui/Text'
import { Chip } from '../ui'
import { Button } from '../Button'
import { OfficialSheetView } from './OfficialSheetView'
import { useOfficialLayout } from '../../hooks/useOfficialLayout'
import { diffMarks, followFocus, setArea } from '../../lib/scoresheet/liveSheet'
import { helveticaMeasure } from '../../lib/scoresheet/fitText'
import { BREAKPOINTS, shared, theme } from '../../constants'
import type { LiveSheetPanelProps, LiveSheetZoom, OfficialSheetLayout, SheetRegion } from '../../types'

/** Open or closed, remembered on the device. */
const OPEN_KEY = 'vteam.scorekeeper.liveSheet'
const ZOOMS: { id: LiveSheetZoom; label: string }[] = [
  { id: 'follow', label: 'Follow' },
  { id: 'set', label: 'Set' },
  { id: 'form', label: 'Whole form' },
]

/**
 * The official scoresheet filling in as the match is scored, under the court. Built for the
 * scoring screen's tap rate:
 * - the score updates first: the sheet renders from a deferred copy of the match, so React
 *   draws it after the tap's own update (and drops an outdated sheet if taps come faster);
 * - marks are memoized by key (OfficialSheetView), so a point redraws a few marks, not all;
 * - nothing is laid out while it's closed.
 * What just changed is tinted; an undo outlines what it erased, and a redo tints it again.
 * On a phone it follows the pen (zooms to the latest change, readable at phone width).
 */
export function LiveSheetPanel({ doc, state, setIndex, onOpenSheet }: LiveSheetPanelProps) {
  const { width } = useWindowDimensions()
  const wide = width >= BREAKPOINTS.sidebar
  const [open, setOpen] = useState(true)
  const [zoom, setZoom] = useState<LiveSheetZoom>(wide ? 'set' : 'follow')

  useEffect(() => {
    let cancelled = false
    AsyncStorage.getItem(OPEN_KEY).then(v => { if (!cancelled && v === 'closed') setOpen(false) }).catch(() => {})
    return () => { cancelled = true }
  }, [])
  const toggle = () => {
    const next = !open
    setOpen(next)
    void AsyncStorage.setItem(OPEN_KEY, next ? 'open' : 'closed').catch(() => {})
  }

  // One deferred value for the pair, so the sheet never mixes one tap's log with another's state.
  const live = useMemo(() => ({ doc, state }), [doc, state])
  const shown = useDeferredValue(live)
  const layout = useOfficialLayout(open ? shown.doc : null, shown.state)
  const area = setArea(setIndex)

  // What changed since the last sheet drawn: the previous layout is kept once each sheet is on screen.
  const prev = useRef<OfficialSheetLayout | null>(null)
  const diff = useMemo(() => diffMarks(prev.current, layout, area.page, helveticaMeasure), [layout, area.page])
  useEffect(() => { prev.current = layout }, [layout])

  // Follow: the latest change, else stay where the view was (a redraw with nothing new).
  const lastFollow = useRef<SheetRegion[] | null>(null)
  const follow = useMemo(() => {
    const f = followFocus(diff)
    if (f) lastFollow.current = f
    return f ?? lastFollow.current
  }, [diff])
  const focus = zoom === 'form' ? undefined : zoom === 'set' || !follow ? [area.region] : follow

  const erasedOnly = !diff.added.length && diff.removed.length > 0
  const t = state.sets[setIndex]?.teams
  return (
    <View style={styles.card} testID="live-sheet">
      <Pressable onPress={toggle} accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={`Live scoresheet, ${open ? 'shown' : 'hidden'}`} style={styles.head} testID="live-sheet-toggle">
        <Ionicons name="document-text-outline" size={18} color={theme.colors.text} />
        <Text style={[shared.body, styles.title]}>Live scoresheet</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={theme.colors.subtext} />
      </Pressable>
      {open && (
        <View style={{ gap: theme.spacing.sm }}>
          <View style={styles.zooms} accessibilityRole="radiogroup" accessibilityLabel="Show">
            {ZOOMS.map(z => <Chip key={z.id} label={z.label} role="radio" variant="tint" active={zoom === z.id} onPress={() => setZoom(z.id)} testID={`live-zoom-${z.id}`} />)}
          </View>
          {layout ? (
            <OfficialSheetView
              layout={layout}
              page={area.page}
              focus={focus}
              highlight={diff.added}
              erased={diff.removed}
              accessibilityLabel={`Live scoresheet, set ${setIndex + 1}${t ? `, ${t.A.score} to ${t.B.score}` : ''}`}
              testID="live-sheet-form"
            />
          ) : null}
          <Text style={shared.caption} testID="live-sheet-note">
            {erasedOnly ? 'Undone: the dashed outline shows what was erased. Redo writes it back.' : 'Tinted: just written. After an undo, a dashed outline shows what was erased.'}
          </Text>
          <Button label="Full scoresheet" icon="expand-outline" variant="ghost" size="touch" fullWidth={false} onPress={onOpenSheet} />
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  card: { marginTop: theme.spacing.md, padding: theme.spacing.sm, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.card, gap: theme.spacing.sm },
  head: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, minHeight: 44 },
  title: { flex: 1, fontFamily: theme.fonts.bodySemiBold },
  zooms: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs },
})
