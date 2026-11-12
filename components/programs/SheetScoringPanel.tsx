import React, { useCallback, useEffect, useRef, useState } from 'react'
import { TouchableOpacity, View } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Text } from '../ui/Text'
import { ConfirmDialog } from '../ui'
import { Button } from '../Button'
import { ts } from '../tournament/tournamentStyles'
import { theme } from '../../constants'
import { callSheet } from '../../lib/sheetScorekeeper'
import { toast } from '../../lib/toast'
import { activeSet, addPoint, formatFor, matchDecided, maxSets, setDone, setTarget, setsFromMatch, setsPayload } from '../../utils/sheetScoring'
import { stageLabel } from '../../utils/sheetScores'
import type { SheetScoringPanelProps, SheetSetPair, SheetSyncState } from '../../types'

const SAVE_DELAY_MS = 700
const RETRY_MS = 3000

const SYNC_COPY: Record<SheetSyncState, string> = {
  saved: 'Saved',
  pending: 'Saving…',
  saving: 'Saving…',
  error: 'Not saved yet · retrying',
  conflict: 'Needs your choice',
}

/**
 * Point-by-point scoring of one game into the Sheet (its submitScore): tap + for a point, − to
 * take one back. Taps save on their own about once every 0.7 s with the version they started from,
 * so a second phone on the same game gets "Use theirs / Keep mine" instead of overwriting. Sets
 * follow the Sheet's rules (target, deciding set, cap); "Submit final" ends the game.
 */
export function SheetScoringPanel({ execUrl, keeper, match: initial, latest, rules, onClose }: SheetScoringPanelProps) {
  const format = formatFor(initial, rules)
  const [sets, setSets] = useState<SheetSetPair[]>(() => setsFromMatch(initial, format))
  const [current, setCurrent] = useState(() => activeSet(setsFromMatch(initial, format), format, rules))
  const [sync, setSync] = useState<SheetSyncState>('saved')
  const [theirs, setTheirs] = useState<typeof initial | null>(null)
  const [flipped, setFlipped] = useState(false)
  const [confirm, setConfirm] = useState<'final' | 'cancel' | null>(null)
  const [busy, setBusy] = useState(false)

  const version = useRef(initial.version ?? 0)
  const setsRef = useRef(sets)
  setsRef.current = sets
  const dirty = useRef(false)
  const inflight = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flush = useCallback(async () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null }
    if (inflight.current || !dirty.current) return
    inflight.current = true
    dirty.current = false
    setSync('saving')
    try {
      const res = await callSheet(execUrl, 'submitScore', {
        matchId: initial.match_id, sets: setsPayload(setsRef.current), final: false,
        baseVersion: version.current, by: keeper.by, pin: keeper.pin,
      })
      if (res.ok && res.match) {
        version.current = res.match.version ?? version.current + 1
        setSync(dirty.current ? 'pending' : 'saved')
      } else if (res.error === 'conflict' && res.match) {
        setTheirs(res.match)
        setSync('conflict')
      } else {
        toast.show({ title: "Couldn't save", message: res.error === 'bad_pin' ? 'The scorekeeper PIN changed. Enter it again.' : 'The tournament sheet refused this score.', variant: 'error' })
        setSync('error')
      }
    } catch {
      dirty.current = true
      setSync('error')
      timer.current = setTimeout(() => { void flush() }, RETRY_MS)
    } finally {
      inflight.current = false
      if (dirty.current && !timer.current) timer.current = setTimeout(() => { void flush() }, SAVE_DELAY_MS)
    }
  }, [execUrl, initial.match_id, keeper])

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  // Nothing of ours waiting and the Sheet has a newer copy (a correction typed in the Sheet, another phone): take it.
  useEffect(() => {
    if (!latest || dirty.current || inflight.current || sync === 'conflict') return
    if ((latest.version ?? 0) > version.current) {
      version.current = latest.version ?? version.current
      const next = setsFromMatch(latest, format)
      setSets(next)
      setCurrent(activeSet(next, format, rules))
    }
  }, [latest, format, rules, sync])

  function tap(side: 0 | 1, delta: 1 | -1) {
    if (sync === 'conflict') return
    setSets(prev => addPoint(prev, current, side, delta))
    dirty.current = true
    setSync('pending')
    if (!timer.current && !inflight.current) timer.current = setTimeout(() => { void flush() }, SAVE_DELAY_MS)
  }

  function resolveConflict(keepMine: boolean) {
    if (!theirs) return
    version.current = theirs.version ?? version.current
    if (keepMine) {
      dirty.current = true
      setTheirs(null)
      setSync('pending')
      void flush()
    } else {
      const next = setsFromMatch(theirs, format)
      setSets(next)
      setCurrent(activeSet(next, format, rules))
      setTheirs(null)
      setSync('saved')
    }
  }

  async function submitFinal() {
    setBusy(true)
    if (timer.current) { clearTimeout(timer.current); timer.current = null }
    try {
      const res = await callSheet(execUrl, 'submitScore', {
        matchId: initial.match_id, sets: setsPayload(setsRef.current), final: true,
        baseVersion: version.current, by: keeper.by, pin: keeper.pin,
      })
      if (res.ok) {
        dirty.current = false
        toast.show({ message: `Final saved: ${initial.team_a} ${score(0)} – ${score(1)} ${initial.team_b}`, variant: 'success' })
        onClose(true)
      } else if (res.error === 'conflict' && res.match) {
        setTheirs(res.match)
        setSync('conflict')
      } else {
        toast.show({ title: "Couldn't submit the final", message: 'The tournament sheet refused it. Try again.', variant: 'error' })
      }
    } catch (e) {
      toast.error("Couldn't submit the final", e)
    } finally {
      setBusy(false)
      setConfirm(null)
    }
  }

  async function cancelGame() {
    setBusy(true)
    try {
      const res = await callSheet(execUrl, 'cancelMatch', { matchId: initial.match_id, by: keeper.by, pin: keeper.pin })
      if (res.ok) onClose(true)
      else toast.show({ message: res.error === 'has_scores' ? 'This game already has points, so it stays.' : "Couldn't cancel the game.", variant: 'error' })
    } catch (e) {
      toast.error("Couldn't cancel the game", e)
    } finally {
      setBusy(false)
      setConfirm(null)
    }
  }

  // Sets won by each side, for the final's summary.
  function score(side: 0 | 1): number {
    return sets.filter(([a, b], i) => setDone(a, b, setTarget(i, format, rules), rules.point_cap) && (side === 0 ? (a ?? 0) > (b ?? 0) : (b ?? 0) > (a ?? 0))).length
  }

  const names: [string, string] = [initial.team_a ?? 'Team A', initial.team_b ?? 'Team B']
  const pair = sets[current] ?? [null, null]
  const target = setTarget(current, format, rules)
  const doneSet = setDone(pair[0], pair[1], target, rules.point_cap)
  const decided = matchDecided(sets, format, rules)
  const empty = sets.every(([a, b]) => !a && !b)
  const order: (0 | 1)[] = flipped ? [1, 0] : [0, 1]

  return (
    <View testID="sheet-scoring">
      <View style={ts.rowBetween}>
        <Text style={ts.sectionTitle}>{[initial.court ? `Court ${initial.court}` : null, stageLabel(initial)].filter(Boolean).join(' · ')}</Text>
        <Text
          testID="sheet-sync"
          style={{ fontFamily: theme.fonts.bodySemiBold, fontSize: theme.font.size.xs, color: sync === 'saved' ? theme.colors.cool : sync === 'error' || sync === 'conflict' ? theme.colors.hot : theme.colors.subtext }}
        >{SYNC_COPY[sync]}</Text>
      </View>

      {/* Sets so far; the one being played is highlighted. */}
      <View style={{ flexDirection: 'row', gap: theme.spacing.sm, marginTop: theme.spacing.sm, flexWrap: 'wrap' }}>
        {sets.slice(0, maxSets(format)).map(([a, b], i) => (
          <View key={i} style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: theme.radius.full, borderWidth: 1, borderColor: i === current ? theme.colors.primary : theme.colors.border }}>
            <Text style={{ fontFamily: theme.fonts.bodySemiBold, fontSize: theme.font.size.xs, color: i === current ? theme.colors.text : theme.colors.subtext }}>
              Set {i + 1} · {a == null && b == null ? '–' : `${(flipped ? b : a) ?? 0}–${(flipped ? a : b) ?? 0}`}
            </Text>
          </View>
        ))}
      </View>

      {sync === 'conflict' && theirs && (
        <View style={[ts.card, { marginTop: theme.spacing.md, borderColor: theme.colors.hot }]} testID="sheet-conflict">
          <Text style={{ fontFamily: theme.fonts.bodySemiBold, fontSize: theme.font.size.md, color: theme.colors.text }}>Another phone changed this game</Text>
          <Text style={[ts.muted13, { marginTop: 4 }]}>
            Theirs: {setsFromMatch(theirs, format).filter(([a, b]) => a != null || b != null).map(([a, b]) => `${a ?? 0}–${b ?? 0}`).join(', ') || '0–0'}
          </Text>
          <View style={{ flexDirection: 'row', gap: theme.spacing.sm, marginTop: theme.spacing.sm }}>
            <Button label="Use theirs" variant="secondary" size="touch" fullWidth={false} onPress={() => resolveConflict(false)} />
            <Button label="Keep mine" variant="ghost" size="touch" fullWidth={false} onPress={() => resolveConflict(true)} />
          </View>
        </View>
      )}

      <View style={{ flexDirection: 'row', gap: theme.spacing.sm, marginTop: theme.spacing.md }}>
        {order.map(side => (
          <View key={side} style={[ts.card, { flex: 1, alignItems: 'center', marginBottom: 0, paddingVertical: theme.spacing.md }]}>
            <Text numberOfLines={2} style={{ fontFamily: theme.fonts.bodySemiBold, fontSize: theme.font.size.md, color: theme.colors.text, textAlign: 'center', minHeight: 40 }}>{names[side]}</Text>
            <TouchableOpacity
              onPress={() => tap(side, 1)}
              accessibilityRole="button"
              accessibilityLabel={`Point for ${names[side]}`}
              testID={`sheet-plus-${side}`}
              style={{ alignSelf: 'stretch', minHeight: 120, borderRadius: theme.radius.lg, backgroundColor: theme.colors.primary, alignItems: 'center', justifyContent: 'center', marginTop: theme.spacing.sm }}
            >
              <Text style={{ fontFamily: theme.fonts.display, fontSize: theme.font.heading.splash, color: theme.colors.onPrimary }} testID={`sheet-points-${side}`}>{pair[side] ?? 0}</Text>
              <Ionicons name="add" size={22} color={theme.colors.onPrimary} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => tap(side, -1)}
              disabled={!pair[side]}
              accessibilityRole="button"
              accessibilityLabel={`Take a point back from ${names[side]}`}
              style={{ alignSelf: 'stretch', minHeight: 44, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, alignItems: 'center', justifyContent: 'center', marginTop: theme.spacing.sm, opacity: pair[side] ? 1 : 0.4 }}
            >
              <Ionicons name="remove" size={20} color={theme.colors.text} />
            </TouchableOpacity>
          </View>
        ))}
      </View>

      <Text style={[ts.muted13, { textAlign: 'center', marginTop: theme.spacing.sm }]}>
        Set {current + 1} to {target}{rules.point_cap ? ` (cap ${rules.point_cap})` : ', win by 2'}
      </Text>

      <View style={{ gap: theme.spacing.sm, marginTop: theme.spacing.md }}>
        {doneSet && !decided && current + 1 < maxSets(format) && (
          <Button label={`Start set ${current + 2}`} onPress={() => setCurrent(current + 1)} testID="sheet-next-set" />
        )}
        <Button
          label="Submit final"
          variant={decided ? 'primary' : 'secondary'}
          onPress={() => setConfirm('final')}
          disabled={sync === 'conflict' || empty}
          testID="sheet-final"
        />
        <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
          <Button label="Switch sides" icon="swap-horizontal" variant="ghost" size="touch" fullWidth={false} onPress={() => setFlipped(f => !f)} />
          <Button label="Back to games" variant="ghost" size="touch" fullWidth={false} onPress={() => { void flush(); onClose(false) }} />
        </View>
        {empty && initial.status !== 'final' && (
          <Button label="Started by mistake? Cancel game" variant="ghost" size="touch" onPress={() => setConfirm('cancel')} />
        )}
      </View>

      <ConfirmDialog
        visible={confirm === 'final'}
        title={decided ? 'Submit the final?' : "The game isn't decided yet"}
        body={`${names[0]} ${sets.filter(([a, b]) => a != null || b != null).map(([a, b]) => `${a ?? 0}–${b ?? 0}`).join(', ')} ${names[1]}.${decided ? '' : ' Submit it as the final anyway?'}`}
        confirmLabel="Submit final"
        onConfirm={() => { void submitFinal() }}
        onCancel={() => setConfirm(null)}
        loading={busy}
      />
      <ConfirmDialog
        visible={confirm === 'cancel'}
        title="Cancel this game?"
        body="It goes back to the list so it can be started again. Only games still at 0–0 can be cancelled."
        confirmLabel="Cancel game"
        cancelLabel="Keep it"
        destructive
        onConfirm={() => { void cancelGame() }}
        onCancel={() => setConfirm(null)}
        loading={busy}
      />
    </View>
  )
}
