import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Text } from '../../../../components/ui/Text'
import { BottomSheet, ConfirmDialog, IconButton, ScreenContainer, ScreenState } from '../../../../components/ui'
import { Button } from '../../../../components/Button'
import { CourtLayout } from '../../../../components/scoresheet/CourtLayout'
import { CourtSpot } from '../../../../components/scoresheet/CourtSpot'
import { LineupSetup } from '../../../../components/scoresheet/LineupSetup'
import { SubSheet } from '../../../../components/scoresheet/SubSheet'
import { LiberoSheet } from '../../../../components/scoresheet/LiberoSheet'
import { TimeoutSheet } from '../../../../components/scoresheet/TimeoutSheet'
import { SanctionSheet } from '../../../../components/scoresheet/SanctionSheet'
import { WrongServerSheet } from '../../../../components/scoresheet/WrongServerSheet'
import { FixSheet } from '../../../../components/scoresheet/FixSheet'
import { TextSheet } from '../../../../components/scoresheet/TextSheet'
import { TimelineSheet } from '../../../../components/scoresheet/TimelineSheet'
import { SheetBody } from '../../../../components/scoresheet/SheetParts'
import { LiveSheetPanel } from '../../../../components/scoresheet/LiveSheetPanel'
import { TimeoutTimer } from '../../../../components/scoresheet/TimeoutTimer'
import { MatchClock } from '../../../../components/scoresheet/MatchClock'
import { TEAM_COLORS } from '../../../../components/scoresheet/teamColors'
import { useScoreMatch } from '../../../../hooks/useScoreMatch'
import { useScorekeeperKeys } from '../../../../hooks/useScorekeeperKeys'
import { deleteMatch } from '../../../../lib/scoresheet/storage'
import { describeEvent, playerLabel } from '../../../../lib/scoresheet/describe'
import { POSITION_LABELS, courtOf, serverOf } from '../../../../lib/scoresheet/engine'
import { teamName } from '../../../../lib/scoresheet/summary'
import { lastPointEventId } from '../../../../lib/scoresheet/minusOne'
import { shared, theme } from '../../../../constants'
import { routes } from '../../../../utils/routes'
import { TourTarget } from '../../../../components/tour/TourTarget'
import { useTour, useTourTarget } from '../../../../contexts/tour'
import { TOUR_TARGETS, tourCompletionId } from '../../../../constants/tours'
import { loadSeenBanners, markBannerSeenOnDevice } from '../../../../utils/seenBanners'

/** Recorded on the device when the tour opens by itself, so it only does that once (finishing records tour-scorekeeper-done). */
const SCOREKEEPER_TOUR_OFFERED = 'tour-scorekeeper-offered'
/** Court, counts and live scoresheet under the score buttons: off unless turned on in More (remembered on the device). */
const SHOW_COURT_KEY = 'vteam.scorekeeper.showCourt'
/** Side by side at this width; stacked on phones. */
const SIDE_BY_SIDE_MIN = 700
import type { TeamSide } from '../../../../types'

type SheetKind = 'sub' | 'libero' | 'timeout' | 'sanction' | 'wrong' | 'fix' | 'note' | 'end_set' | 'timeline' | 'more'

/** Ignore a second point tap this soon after the first (an accidental double tap). */
const DOUBLE_TAP_MS = 400

/** The live scorekeeper: lineups before each set, scoring during it, the result after. */
export default function ScoreMatchScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const m = useScoreMatch(id)
  const [sheet, setSheet] = useState<SheetKind | null>(null)
  const [sheetTeam, setSheetTeam] = useState<TeamSide>('A')
  const [subOut, setSubOut] = useState<number | undefined>(undefined)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const lastPointAt = useRef(0)
  const { width, height } = useWindowDimensions()
  const wide = width >= SIDE_BY_SIDE_MIN
  const [showCourt, setShowCourt] = useState(false)
  useEffect(() => {
    AsyncStorage.getItem(SHOW_COURT_KEY).then(v => setShowCourt(v === 'on')).catch(() => {})
  }, [])
  const toggleCourt = () => {
    const next = !showCourt
    setShowCourt(next)
    void AsyncStorage.setItem(SHOW_COURT_KEY, next ? 'on' : 'off').catch(() => {})
  }

  const set = m.state && m.state.current != null ? m.state.sets[m.state.current] : null
  const tour = useTour()
  const serverRef = useTourTarget(TOUR_TARGETS.scoreServer)
  const pointsRef = useTourTarget(TOUR_TARGETS.scorePoints)
  const actionsRef = useTourTarget(TOUR_TARGETS.scoreActions)
  // The first time someone has a set to score, walk them through the screen (once per device; "?" replays it).
  const setInPlay = !!set
  useEffect(() => {
    if (!setInPlay) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    void loadSeenBanners().then(seen => {
      if (cancelled || seen.has(SCOREKEEPER_TOUR_OFFERED) || seen.has(tourCompletionId('scorekeeper'))) return
      markBannerSeenOnDevice(SCOREKEEPER_TOUR_OFFERED)
      timer = setTimeout(() => tour.start('scorekeeper', 'first_use'), 600)
    })
    return () => { cancelled = true; if (timer) clearTimeout(timer) }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per screen, when a set is first in play
  }, [setInPlay])
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
        <Text style={styles.topTitle} numberOfLines={1}>
          {!m.state ? 'Match' : set ? `Set ${set.index + 1} · Sets ${m.state.setsWon.A}–${m.state.setsWon.B}` : m.state.over ? 'Final' : `Set ${m.state.sets.length + 1} next`}
        </Text>
        {m.state && m.doc && (
          <Text style={shared.caption} numberOfLines={1}>
            {set ? `To ${set.target}${set.cap != null ? `, cap ${set.cap}` : ''}` : `${teamName(m.doc, 'A')} vs ${teamName(m.doc, 'B')} · Sets ${m.state.setsWon.A}–${m.state.setsWon.B}`}
          </Text>
        )}
      </View>
      {set && <IconButton icon="help-circle-outline" size={44} label="How scoring works" onPress={() => tour.start('scorekeeper', 'help_button')} testID="score-help" />}
      <TourTarget id={TOUR_TARGETS.scoreMore}>
        <Button label="More" variant="secondary" size="touch" fullWidth={false} onPress={() => openSheet('more')} testID="score-more" />
      </TourTarget>
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

              <MatchClock doc={m.doc} state={m.state} onTimeUp={() => m.add({ type: 'time_up' })} onAddTime={minutes => m.add({ type: 'add_time', minutes })} />
              {set?.nextPointWins && (
                <View style={[styles.banner, { borderColor: theme.colors.warning }]} accessibilityRole="alert" testID="next-point-wins">
                  <Ionicons name="flash-outline" size={18} color={theme.colors.warning} />
                  <Text style={[shared.body, { flex: 1 }]}>Time's up with the set tied: the next point wins it.</Text>
                </View>
              )}
              {set && <TimeoutTimer doc={m.doc} />}

              {set && (
                <>
                  <View ref={pointsRef} collapsable={false} style={[styles.pointArea, { minHeight: Math.max(320, height - 280) }, wide && { flexDirection: 'row' }]}>
                    {(['A', 'B'] as const).map(side => {
                      const color = TEAM_COLORS[side]
                      const serving = set.serving === side
                      const server = serverOf(set.teams[side])
                      return (
                        <Pressable
                          key={side}
                          onPress={() => point(side)}
                          accessibilityRole="button"
                          accessibilityLabel={`Point to ${teamName(m.doc!, side)}, ${set.teams[side].score}${serving ? `, serving #${server}` : ''}`}
                          testID={`point-${side}`}
                          style={({ pressed }) => [shared.scorePointBtn, { backgroundColor: color.fill }, pressed && { opacity: 0.85, transform: [{ scale: 0.99 }] }]}
                        >
                          <Text style={[shared.scorePointTeam, { color: color.ink }]} numberOfLines={1}>{teamName(m.doc!, side)}</Text>
                          <Text style={[styles.bigScore, { color: color.ink }]} testID={`score-${side}`} maxFontSizeMultiplier={1.3}>{set.teams[side].score}</Text>
                          <View ref={serving ? serverRef : undefined} collapsable={false}>
                            <Text
                              style={[shared.scorePointServing, { color: color.ink, borderColor: serving ? color.ink : 'transparent' }]}
                              testID={serving ? 'serving-now' : undefined}
                              maxFontSizeMultiplier={1.3}
                            >
                              {serving ? `Serving · #${server}` : ' '}
                            </Text>
                          </View>
                        </Pressable>
                      )
                    })}
                  </View>

                  {set.courtSwitchAt != null && Math.max(set.teams.A.score, set.teams.B.score) === set.courtSwitchAt && (
                    <View style={[styles.banner, { borderColor: theme.colors.accent, marginTop: theme.spacing.sm }]} accessibilityRole="alert">
                      <Ionicons name="swap-horizontal" size={18} color={theme.colors.accent} />
                      <Text style={[shared.body, { flex: 1 }]}>Switch courts: a team reached {set.courtSwitchAt}.</Text>
                    </View>
                  )}

                  <View ref={actionsRef} collapsable={false} style={{ marginTop: theme.spacing.sm }}>
                    <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
                      {(['A', 'B'] as const).map(side => {
                        const target = lastPointEventId(m.doc!.log, side)
                        return (
                          <View key={side} style={{ flex: 1 }}>
                            <Button
                              label={`−1 ${teamName(m.doc!, side)}`}
                              variant="secondary"
                              size="touch"
                              disabled={!target}
                              onPress={() => { if (target) m.remove(target) }}
                              accessibilityLabel={`Take a point away from ${teamName(m.doc!, side)}`}
                              testID={`minus-${side}`}
                            />
                          </View>
                        )
                      })}
                    </View>
                    {lastEvent && (
                      <Text style={[shared.caption, { textAlign: 'center', marginTop: theme.spacing.xs }]} numberOfLines={1}>
                        Last: {describeEvent(m.doc.setup, lastEvent)}
                      </Text>
                    )}
                  </View>

                  {showCourt && (
                    <View style={styles.courts} testID="court-details">
                      <Text style={[shared.caption, { textAlign: 'center' }]}>
                        {(['A', 'B'] as const).map(side => {
                          const t = set.teams[side]
                          const rules = m.doc!.setup.rules
                          return `${teamName(m.doc!, side)}: T/O ${t.timeouts.length}/${rules.timeoutsPerSet} · Subs ${t.subs.filter(x => !x.exceptional).length}${rules.subsPerSet != null ? `/${rules.subsPerSet}` : ''}`
                        }).join('   ')}
                      </Text>
                      <CourtLayout
                        renderLabel={side => (
                          <Text style={[shared.label, { color: TEAM_COLORS[side].fill, marginBottom: 0, textAlign: 'center' }]}>
                            {teamName(m.doc!, side)}{set.serving === side ? ' · serving' : ''}
                          </Text>
                        )}
                        renderSpot={(side, position) => {
                          const spot = courtOf(set.teams[side])[position]
                          const isServer = set.serving === side && position === 0
                          return (
                            <CourtSpot
                              position={position}
                              number={spot.player}
                              name={names[side].get(spot.player)}
                              libero={spot.libero}
                              highlight={isServer ? TEAM_COLORS[side] : null}
                              onPress={() => {
                                if (spot.libero) return openSheet('libero', side)
                                setSubOut(spot.player)
                                openSheet('sub', side)
                              }}
                              accessibilityLabel={`${teamName(m.doc!, side)} position ${POSITION_LABELS[position]}: ${spot.libero ? 'libero ' : ''}#${spot.player}${isServer ? ', serving' : ''}`}
                              testID={`court-${side}-${position}`}
                            />
                          )
                        }}
                      />
                      <LiveSheetPanel doc={m.doc} state={m.state} setIndex={set.index} onOpenSheet={() => router.push(routes.scorekeeperSheet(m.doc!.id))} />
                    </View>
                  )}
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
            <SheetBody>
              <Button label="Undo last action" icon="arrow-undo" variant="secondary" disabled={!m.doc.undo.length} onPress={() => { m.undo(); close() }} testID="action-undo" />
              {set && (
                <View style={styles.moreGrid}>
                  {(['A', 'B'] as const).map(side => (
                    <Pressable
                      key={`to-${side}`}
                      onPress={() => { m.add({ type: 'timeout', team: side }); close() }}
                      accessibilityRole="button"
                      accessibilityLabel={`${teamName(m.doc!, side)} time-out`}
                      testID={`more-timeout-${side}`}
                      style={({ pressed }) => [styles.moreTile, { borderColor: TEAM_COLORS[side].fill, backgroundColor: TEAM_COLORS[side].soft }, pressed && { opacity: 0.8 }]}
                    >
                      <Text style={[shared.body, { fontFamily: theme.fonts.bodySemiBold }]} numberOfLines={1}>{teamName(m.doc!, side)} time-out</Text>
                      <Text style={shared.caption}>{set.teams[side].timeouts.length} of {m.doc!.setup.rules.timeoutsPerSet} used</Text>
                    </Pressable>
                  ))}
                  {(['A', 'B'] as const).map(side => (
                    <Pressable
                      key={`sub-${side}`}
                      onPress={() => { setSubOut(undefined); openSheet('sub', side) }}
                      accessibilityRole="button"
                      accessibilityLabel={`${teamName(m.doc!, side)} substitution`}
                      testID={`more-sub-${side}`}
                      style={({ pressed }) => [styles.moreTile, { borderColor: TEAM_COLORS[side].fill, backgroundColor: TEAM_COLORS[side].soft }, pressed && { opacity: 0.8 }]}
                    >
                      <Text style={[shared.body, { fontFamily: theme.fonts.bodySemiBold }]} numberOfLines={1}>{teamName(m.doc!, side)} sub</Text>
                      <Text style={shared.caption}>
                        {set.teams[side].subs.filter(x => !x.exceptional).length}{m.doc!.setup.rules.subsPerSet != null ? ` of ${m.doc!.setup.rules.subsPerSet}` : ''} used
                      </Text>
                    </Pressable>
                  ))}
                </View>
              )}
              {set && <Button label="Libero in / out" icon="shirt-outline" variant="secondary" onPress={() => setSheet('libero')} testID="action-libero" />}
              <Button label="Card or sanction" icon="card-outline" variant="secondary" onPress={() => setSheet('sanction')} testID="action-card" />
              {set && <Button label="Out of rotation or wrong server" icon="alert-circle-outline" variant="secondary" onPress={() => setSheet('wrong')} testID="more-wrong" />}
              <Button label="Timeline: fix a past rally" icon="list" variant="secondary" onPress={() => setSheet('timeline')} testID="action-timeline" />
              {set && <Button label="Match the scoreboard" icon="construct-outline" variant="secondary" onPress={() => setSheet('fix')} testID="more-fix" />}
              <Button label="Redo" icon="arrow-redo" variant="secondary" disabled={!m.doc.redo.length} onPress={() => { m.redo(); close() }} testID="action-redo" />
              {set && <Button label="Rally replayed (no point)" icon="refresh" variant="secondary" onPress={() => { m.add({ type: 'replay' }); close() }} />}
              <Button label="Add a remark" icon="create-outline" variant="secondary" onPress={() => setSheet('note')} />
              {set && <Button label="End set early" icon="flag-outline" variant="secondary" onPress={() => setSheet('end_set')} />}
              {set && (
                <Button
                  label={showCourt ? 'Hide court and live scoresheet' : 'Show court and live scoresheet'}
                  icon={showCourt ? 'eye-off-outline' : 'grid-outline'}
                  variant="secondary"
                  onPress={() => { toggleCourt(); close() }}
                  testID="more-court"
                />
              )}
              <Button label="Scoresheet" icon="document-text-outline" variant="secondary" onPress={() => { close(); router.push(routes.scorekeeperSheet(m.doc!.id)) }} testID="more-sheet" />
              <Button label="Delete match" icon="trash-outline" variant="danger" onPress={() => { close(); setConfirmDelete(true) }} />
            </SheetBody>
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
  pointArea: { gap: theme.spacing.sm },
  bigScore: { fontFamily: theme.fonts.display, fontSize: theme.font.heading.scoreboard, lineHeight: theme.font.heading.scoreboard * 1.1, fontVariant: ['tabular-nums'] },
  moreGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
  moreTile: { flexBasis: '47%', flexGrow: 1, minHeight: 60, borderRadius: theme.radius.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center', padding: theme.spacing.sm },
  courts: { gap: theme.spacing.sm, marginTop: theme.spacing.md },
})
