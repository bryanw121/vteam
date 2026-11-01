import { useCallback, useMemo, useRef, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native'
import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Text } from '../../../../components/ui/Text'
import { BottomSheet, ConfirmDialog, IconButton, ScreenContainer, ScreenState } from '../../../../components/ui'
import { Button } from '../../../../components/Button'
import { CourtGrid } from '../../../../components/scoresheet/CourtGrid'
import { LineupSetup } from '../../../../components/scoresheet/LineupSetup'
import { SubSheet } from '../../../../components/scoresheet/SubSheet'
import { LiberoSheet } from '../../../../components/scoresheet/LiberoSheet'
import { TimeoutSheet } from '../../../../components/scoresheet/TimeoutSheet'
import { SanctionSheet } from '../../../../components/scoresheet/SanctionSheet'
import { WrongServerSheet } from '../../../../components/scoresheet/WrongServerSheet'
import { FixSheet } from '../../../../components/scoresheet/FixSheet'
import { TextSheet } from '../../../../components/scoresheet/TextSheet'
import { TimelineSheet } from '../../../../components/scoresheet/TimelineSheet'
import { TEAM_COLORS } from '../../../../components/scoresheet/teamColors'
import { useScoreMatch } from '../../../../hooks/useScoreMatch'
import { useScorekeeperKeys } from '../../../../hooks/useScorekeeperKeys'
import { deleteMatch } from '../../../../lib/scoresheet/storage'
import { describeEvent, playerLabel } from '../../../../lib/scoresheet/describe'
import { serverOf } from '../../../../lib/scoresheet/engine'
import { teamName } from '../../../../lib/scoresheet/summary'
import { BREAKPOINTS, shared, theme } from '../../../../constants'
import { routes } from '../../../../utils/routes'
import type { IoniconName, TeamSide } from '../../../../types'

type SheetKind = 'sub' | 'libero' | 'timeout' | 'sanction' | 'wrong' | 'fix' | 'note' | 'end_set' | 'timeline' | 'more'

/** Ignore a second point tap this soon after the first (an accidental double tap). */
const DOUBLE_TAP_MS = 400

/** The live scorekeeper: lineups before each set, scoring during it, the result after. */
export default function ScoreMatchScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const wide = width >= BREAKPOINTS.sidebar
  const m = useScoreMatch(id)
  const [sheet, setSheet] = useState<SheetKind | null>(null)
  const [sheetTeam, setSheetTeam] = useState<TeamSide>('A')
  const [subOut, setSubOut] = useState<number | undefined>(undefined)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const lastPointAt = useRef(0)

  const set = m.state && m.state.current != null ? m.state.sets[m.state.current] : null
  const lastSet = m.state?.sets.at(-1) ?? null
  const close = useCallback(() => setSheet(null), [])

  const point = useCallback((side: TeamSide) => {
    const now = Date.now()
    if (now - lastPointAt.current < DOUBLE_TAP_MS) return
    lastPointAt.current = now
    m.add({ type: 'rally', winner: side })
  }, [m])

  useScorekeeperKeys({ pointA: () => point('A'), pointB: () => point('B'), undo: m.undo, redo: m.redo, enabled: !!set && sheet == null })

  const names = useMemo(() => ({
    A: new Map((m.doc?.setup.teams.A.players ?? []).map(p => [p.number, p.name ?? ''])),
    B: new Map((m.doc?.setup.teams.B.players ?? []).map(p => [p.number, p.name ?? ''])),
  }), [m.doc])

  const lastEvent = m.doc?.log.at(-1)

  const openSheet = (kind: SheetKind, team?: TeamSide) => {
    if (team) setSheetTeam(team)
    setSheet(kind)
  }

  const header = (
    <View style={styles.topBar}>
      <IconButton icon="chevron-back" size={44} label="Back to Scorekeeper" onPress={() => (router.canGoBack() ? router.back() : router.replace(routes.scorekeeper()))} />
      <View style={{ flex: 1, alignItems: 'center' }}>
        <Text style={styles.topTitle} numberOfLines={1}>{m.doc ? `${teamName(m.doc, 'A')} vs ${teamName(m.doc, 'B')}` : 'Match'}</Text>
        {m.state && (
          <Text style={shared.caption}>
            {set ? `Set ${set.index + 1} · to ${set.target}` : m.state.over ? 'Final' : `Set ${m.state.sets.length + 1} next`} · Sets {m.state.setsWon.A}–{m.state.setsWon.B}
          </Text>
        )}
      </View>
      <IconButton icon="ellipsis-horizontal" size={44} label="More actions" onPress={() => openSheet('more')} testID="score-more" />
    </View>
  )

  return (
    <View style={shared.screen}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenState loading={m.loading} error={!m.loading && !m.doc ? "This match isn't saved on this device." : null} ready={!!m.doc && !!m.state}>
        {m.doc && m.state && (
          <ScrollView contentContainerStyle={{ paddingTop: insets.top + theme.spacing.xs, paddingHorizontal: theme.spacing.md, paddingBottom: insets.bottom + theme.spacing.xl }} keyboardShouldPersistTaps="handled">
            <ScreenContainer>
              {header}

              {!!m.saveError && (
                <View style={[styles.banner, { borderColor: theme.colors.error }]} accessibilityRole="alert">
                  <Ionicons name="warning-outline" size={18} color={theme.colors.error} />
                  <Text style={[shared.body, { flex: 1 }]}>{m.saveError}</Text>
                </View>
              )}

              {m.lastWarnings.length > 0 && (
                <View style={[styles.banner, { borderColor: theme.colors.warning }]} accessibilityRole="alert" testID="score-warning">
                  <Ionicons name="alert-circle-outline" size={18} color={theme.colors.warning} />
                  <View style={{ flex: 1, gap: 2 }}>
                    {m.lastWarnings.map((w, i) => <Text key={i} style={shared.body}>{w.message}</Text>)}
                    <Text style={shared.caption}>Recorded anyway. Undo if that was a mistake.</Text>
                  </View>
                  <Button label="Undo" size="sm" variant="secondary" fullWidth={false} onPress={m.undo} />
                  <IconButton icon="close" label="Dismiss" onPress={m.dismissWarnings} />
                </View>
              )}

              {set && (
                <>
                  <View style={styles.scores}>
                    {(['A', 'B'] as const).map(side => {
                      const t = set.teams[side]
                      const serving = set.serving === side
                      const color = TEAM_COLORS[side]
                      const rules = m.doc!.setup.rules
                      return (
                        <View key={side} style={[styles.scoreCard, { borderColor: serving ? color.fill : theme.colors.border }]} testID={`score-${side}`}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
                            {serving && <Ionicons name="ellipse" size={10} color={color.fill} accessibilityLabel="Serving" />}
                            <Text style={styles.teamName} numberOfLines={1}>{teamName(m.doc!, side)}</Text>
                          </View>
                          <Text style={styles.bigScore} accessibilityLabel={`${teamName(m.doc!, side)} ${t.score}`}>{t.score}</Text>
                          <Text style={shared.caption}>
                            T/O {t.timeouts.length}/{rules.timeoutsPerSet} · Subs {t.subs.filter(s => !s.exceptional).length}{rules.subsPerSet != null ? `/${rules.subsPerSet}` : ''}
                          </Text>
                        </View>
                      )
                    })}
                  </View>

                  <Pressable onPress={() => openSheet('wrong')} accessibilityRole="button" accessibilityLabel="Who should be serving; tap to report a wrong server" style={styles.serverRow} testID="server-row">
                    <Ionicons name="tennisball-outline" size={18} color={TEAM_COLORS[set.serving].fill} />
                    <Text style={[shared.body, { flex: 1 }]}>
                      Serving: <Text style={{ fontFamily: theme.fonts.bodySemiBold }}>{playerLabel(m.doc.setup, set.serving, serverOf(set.teams[set.serving]))}</Text> · {teamName(m.doc, set.serving)}
                    </Text>
                    <Text style={[shared.caption, { color: theme.colors.warning }]}>Wrong server?</Text>
                  </Pressable>

                  {set.courtSwitchAt != null && Math.max(set.teams.A.score, set.teams.B.score) === set.courtSwitchAt && (
                    <View style={[styles.banner, { borderColor: theme.colors.accent }]} accessibilityRole="alert">
                      <Ionicons name="swap-horizontal" size={18} color={theme.colors.accent} />
                      <Text style={[shared.body, { flex: 1 }]}>Switch courts: a team reached {set.courtSwitchAt}.</Text>
                    </View>
                  )}

                  <View style={styles.pointRow}>
                    {(['A', 'B'] as const).map(side => (
                      <Pressable
                        key={side}
                        onPress={() => point(side)}
                        accessibilityRole="button"
                        accessibilityLabel={`Point to ${teamName(m.doc!, side)}`}
                        testID={`point-${side}`}
                        style={({ pressed }) => [styles.pointBtn, { backgroundColor: TEAM_COLORS[side].fill }, pressed && { opacity: 0.8, transform: [{ scale: 0.98 }] }]}
                      >
                        <Ionicons name="add-circle" size={28} color={TEAM_COLORS[side].ink} />
                        <Text style={[styles.pointLabel, { color: TEAM_COLORS[side].ink }]} numberOfLines={1}>{teamName(m.doc!, side)}</Text>
                      </Pressable>
                    ))}
                  </View>

                  <View style={styles.actions}>
                    <Action icon="arrow-undo" label="Undo" onPress={m.undo} disabled={!m.doc.undo.length} testID="action-undo" />
                    <Action icon="arrow-redo" label="Redo" onPress={m.redo} disabled={!m.doc.redo.length} testID="action-redo" />
                    <Action icon="swap-vertical" label="Sub" onPress={() => { setSubOut(undefined); openSheet('sub') }} testID="action-sub" />
                    <Action icon="shirt-outline" label="Libero" onPress={() => openSheet('libero')} testID="action-libero" />
                    <Action icon="pause" label="Time" onPress={() => openSheet('timeout')} testID="action-timeout" />
                    <Action icon="card-outline" label="Card" onPress={() => openSheet('sanction')} testID="action-card" />
                    <Action icon="list" label="Timeline" onPress={() => openSheet('timeline')} testID="action-timeline" />
                  </View>

                  {lastEvent && (
                    <Text style={[shared.caption, { textAlign: 'center', marginTop: theme.spacing.sm }]} numberOfLines={1}>
                      Last: {describeEvent(m.doc.setup, lastEvent)}
                    </Text>
                  )}

                  <View style={[styles.courts, wide && { flexDirection: 'row' }]}>
                    {(['A', 'B'] as const).map(side => (
                      <View key={side} style={[shared.card, { flex: 1, gap: theme.spacing.xs, borderTopWidth: 3, borderTopColor: TEAM_COLORS[side].fill }]}>
                        <Text style={shared.label}>{teamName(m.doc!, side)} · tap a player to sub</Text>
                        <CourtGrid
                          side={side}
                          team={set.teams[side]}
                          serving={set.serving === side}
                          names={names[side]}
                          onPressPlayer={player => {
                            const t = set.teams[side]
                            if (t.libero?.libero === player) return openSheet('libero', side)
                            setSubOut(player)
                            openSheet('sub', side)
                          }}
                        />
                      </View>
                    ))}
                  </View>
                </>
              )}

              {!set && lastSet && (
                <View style={[shared.card, { marginTop: theme.spacing.md, gap: theme.spacing.sm }]} testID="set-result">
                  <Text style={shared.subheading}>
                    {m.state.over
                      ? m.state.winner ? `${teamName(m.doc, m.state.winner)} wins ${Math.max(m.state.setsWon.A, m.state.setsWon.B)}–${Math.min(m.state.setsWon.A, m.state.setsWon.B)}` : `Match split ${m.state.setsWon.A}–${m.state.setsWon.B}`
                      : `Set ${lastSet.index + 1} to ${lastSet.winner ? teamName(m.doc, lastSet.winner) : '—'}`}
                  </Text>
                  <Text style={shared.body}>{m.state.sets.map((s, i) => `Set ${i + 1}: ${s.teams.A.score}–${s.teams.B.score}`).join('   ')}</Text>
                  <View style={{ flexDirection: 'row', gap: theme.spacing.sm, flexWrap: 'wrap' }}>
                    <Button label="Undo last point" icon="arrow-undo" variant="secondary" size="touch" fullWidth={false} onPress={m.undo} disabled={!m.doc.undo.length} />
                    <Button label="Scoresheet" icon="document-text-outline" variant={m.state.over ? 'primary' : 'secondary'} size="touch" fullWidth={false} onPress={() => router.push(routes.scorekeeperSheet(m.doc!.id))} testID="open-sheet" />
                    <Button label="Timeline" icon="list" variant="ghost" size="touch" fullWidth={false} onPress={() => openSheet('timeline')} />
                  </View>
                </View>
              )}

              {!set && !m.state.over && (
                <View style={{ marginTop: theme.spacing.md }}>
                  <LineupSetup key={m.state.sets.length} doc={m.doc} state={m.state} onStart={m.add} />
                </View>
              )}
            </ScreenContainer>
          </ScrollView>
        )}
      </ScreenState>

      {m.doc && set && (
        <>
          <SubSheet visible={sheet === 'sub'} onDismiss={close} doc={m.doc} set={set} initialTeam={sheetTeam} initialOut={subOut} onSubmit={m.add} />
          <LiberoSheet visible={sheet === 'libero'} onDismiss={close} doc={m.doc} set={set} initialTeam={sheetTeam} onSubmit={m.add} />
          <TimeoutSheet visible={sheet === 'timeout'} onDismiss={close} doc={m.doc} set={set} onSubmit={m.add} />
          <WrongServerSheet visible={sheet === 'wrong'} onDismiss={close} doc={m.doc} set={set} onSubmit={m.add} />
          <FixSheet visible={sheet === 'fix'} onDismiss={close} doc={m.doc} set={set} onSubmit={m.add} />
        </>
      )}
      {m.doc && (
        <>
          <SanctionSheet visible={sheet === 'sanction'} onDismiss={close} doc={m.doc} initialTeam={sheetTeam} onSubmit={m.add} />
          <TextSheet visible={sheet === 'note' || sheet === 'end_set'} onDismiss={close} doc={m.doc} mode={sheet === 'end_set' ? 'end_set' : 'note'} onSubmit={m.add} />
          <TimelineSheet visible={sheet === 'timeline'} onDismiss={close} doc={m.doc} onEdit={m.edit} onRemove={m.remove} onInsert={m.insert} />
          <BottomSheet visible={sheet === 'more'} onDismiss={close} title="More">
            <View style={{ gap: theme.spacing.sm }}>
              <Button label="Scoresheet" icon="document-text-outline" variant="secondary" onPress={() => { close(); router.push(routes.scorekeeperSheet(m.doc!.id)) }} testID="more-sheet" />
              <Button label="Timeline: fix a past rally" icon="list" variant="secondary" onPress={() => setSheet('timeline')} />
              {set && <Button label="Wrong server / out of rotation" icon="alert-circle-outline" variant="secondary" onPress={() => setSheet('wrong')} />}
              {set && <Button label="Match the scoreboard" icon="construct-outline" variant="secondary" onPress={() => setSheet('fix')} testID="more-fix" />}
              {set && <Button label="Rally replayed (no point)" icon="refresh" variant="secondary" onPress={() => { m.add({ type: 'replay' }); close() }} />}
              <Button label="Add a remark" icon="create-outline" variant="secondary" onPress={() => setSheet('note')} />
              {set && <Button label="End set early" icon="flag-outline" variant="secondary" onPress={() => setSheet('end_set')} />}
              <Button label="Delete match" icon="trash-outline" variant="danger" onPress={() => { close(); setConfirmDelete(true) }} />
            </View>
          </BottomSheet>
        </>
      )}
      <ConfirmDialog
        visible={confirmDelete}
        title="Delete this match?"
        body="It's removed from this device, including the scoresheet. This can't be undone."
        confirmLabel="Delete"
        destructive
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false)
          if (id) void deleteMatch(id).then(() => router.replace(routes.scorekeeper()))
        }}
      />
    </View>
  )
}

function Action({ icon, label, onPress, disabled, testID }: { icon: IoniconName; label: string; onPress: () => void; disabled?: boolean; testID?: string }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      testID={testID}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [styles.action, disabled && { opacity: 0.35 }, (pressed || hovered) && !disabled && { backgroundColor: theme.colors.background }]}
    >
      <Ionicons name={icon} size={20} color={theme.colors.text} />
      <Text style={styles.actionLabel} numberOfLines={1} maxFontSizeMultiplier={1.15}>{label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  topBar: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, marginBottom: theme.spacing.sm },
  topTitle: { fontFamily: theme.fonts.displaySemiBold, fontSize: theme.font.size.lg, color: theme.colors.text },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    padding: theme.spacing.sm,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    backgroundColor: theme.colors.card,
    marginBottom: theme.spacing.sm,
  },
  scores: { flexDirection: 'row', gap: theme.spacing.sm },
  scoreCard: {
    flex: 1,
    alignItems: 'center',
    padding: theme.spacing.sm,
    borderRadius: theme.radius.lg,
    borderWidth: 2,
    backgroundColor: theme.colors.card,
  },
  teamName: { fontFamily: theme.fonts.bodySemiBold, fontSize: theme.font.size.md, color: theme.colors.text, flexShrink: 1 },
  bigScore: { fontFamily: theme.fonts.display, fontSize: theme.font.heading.splash, color: theme.colors.text, lineHeight: theme.font.heading.splash * 1.15 },
  serverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    minHeight: 44,
    paddingHorizontal: theme.spacing.sm,
    marginVertical: theme.spacing.sm,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.card,
  },
  pointRow: { flexDirection: 'row', gap: theme.spacing.sm },
  pointBtn: {
    flex: 1,
    minHeight: 96,
    borderRadius: theme.radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
  },
  pointLabel: { fontFamily: theme.fonts.displaySemiBold, fontSize: theme.font.size.lg },
  actions: {
    flexDirection: 'row',
    marginTop: theme.spacing.sm,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: 'hidden',
  },
  action: { flex: 1, minHeight: 56, alignItems: 'center', justifyContent: 'center', gap: 2, paddingHorizontal: 2 },
  actionLabel: { fontFamily: theme.fonts.bodyMedium, fontSize: theme.font.size.xs, color: theme.colors.subtextStrong },
  courts: { gap: theme.spacing.sm, marginTop: theme.spacing.md },
})
