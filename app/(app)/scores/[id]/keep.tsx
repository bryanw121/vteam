import React, { useMemo, useState } from 'react'
import { ScrollView, TouchableOpacity, View } from 'react-native'
import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Text, TextInput } from '../../../../components/ui/Text'
import { Chip, ScreenContainer, ScreenHeader, ScreenState } from '../../../../components/ui'
import { Button } from '../../../../components/Button'
import { SheetScoringPanel } from '../../../../components/programs/SheetScoringPanel'
import { ts } from '../../../../components/tournament/tournamentStyles'
import { shared, theme } from '../../../../constants'
import { useSheetScores } from '../../../../hooks/useSheetScores'
import { callSheet, getKeeper, setKeeper } from '../../../../lib/sheetScorekeeper'
import { toast } from '../../../../lib/toast'
import { routes } from '../../../../utils/routes'
import { sheetExecUrl } from '../../../../utils/sheetScores'
import { keepGames, keepGroups } from '../../../../utils/sheetScoring'
import type { SheetKeepGame, SheetMatch } from '../../../../types'

const inputStyle = {
  minHeight: 48, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.md, paddingHorizontal: 12,
  backgroundColor: theme.colors.card, fontFamily: theme.fonts.body, fontSize: theme.font.size.base, color: theme.colors.text, minWidth: 0,
} as const

/**
 * Scorekeeping inside vteam for an outside tournament run on the Google Sheet app: enter the
 * scorekeeper PIN, pick a pool or division and a game, then score it point by point. Every save
 * goes straight to the Sheet (its doPost), which checks the PIN and keeps two phones from
 * overwriting each other. Nothing is stored in vteam's database.
 */
export default function SheetScorekeeperScreen() {
  const router = useRouter()
  const { id } = useLocalSearchParams<{ id: string }>()
  const programId = id ?? ''
  const execUrl = sheetExecUrl(programId)
  const scores = useSheetScores(programId || null)
  const state = scores.data
  const [keeper, setKeeperState] = useState(() => getKeeper(programId))
  const [name, setName] = useState(keeper?.by ?? '')
  const [pin, setPin] = useState('')
  const [checking, setChecking] = useState(false)
  const [pinError, setPinError] = useState<string | null>(null)
  const [group, setGroup] = useState('')
  const [court, setCourt] = useState('')
  const [starting, setStarting] = useState<string | null>(null)
  const [open, setOpen] = useState<SheetMatch | null>(null)

  const groups = useMemo(() => (state ? keepGroups(state) : []), [state])
  const activeGroup = groups.some(g => g.key === group) ? group : groups[0]?.key ?? ''
  const games = useMemo(() => (state && activeGroup ? keepGames(state, activeGroup) : []), [state, activeGroup])
  const latest = open ? state?.matches.find(m => m.match_id === open.match_id) ?? null : null

  async function signIn() {
    if (!execUrl || !state) return
    const by = name.trim().slice(0, 40) || 'vteam scorekeeper'
    if (!state.settings.pin_required) {
      const k = { pin: '', by }
      setKeeper(programId, k)
      setKeeperState(k)
      return
    }
    setChecking(true)
    setPinError(null)
    try {
      const res = await callSheet(execUrl, 'checkPin', { pin: pin.trim() })
      if (res.valid) {
        const k = { pin: pin.trim(), by }
        setKeeper(programId, k)
        setKeeperState(k)
      } else {
        setPinError("That PIN isn't right. Ask the tournament desk.")
      }
    } catch (e) {
      toast.error("Couldn't reach the tournament sheet", e)
    } finally {
      setChecking(false)
    }
  }

  function signOut() {
    setKeeper(programId, null)
    setKeeperState(null)
    setPin('')
    setOpen(null)
  }

  async function openGame(g: SheetKeepGame) {
    if (!execUrl || !keeper) return
    const existing = g.matchId ? state?.matches.find(m => m.match_id === g.matchId) : undefined
    if (existing && existing.status !== 'scheduled') { setOpen(existing); return }
    setStarting(g.key)
    const typedCourt = Number(court) || null
    try {
      const res = await callSheet(execUrl, 'startMatch', g.matchId
        ? { matchId: g.matchId, court: typedCourt ?? g.court ?? '', by: keeper.by, pin: keeper.pin }
        : { pool: g.pool, teamA: g.teamA, teamB: g.teamB, court: typedCourt ?? g.court ?? '', by: keeper.by, pin: keeper.pin })
      if (res.ok && res.match) {
        setOpen(res.match)
        // The Sheet answers `existed` for every bracket start; it's someone else's game only if they saved it last.
        if (res.existed && res.match.updated_by && res.match.updated_by !== keeper.by) toast.show({ message: 'Someone already started this game. You joined it.', variant: 'info' })
        void scores.refetch({ force: true })
      } else if (res.error === 'bad_pin') {
        toast.show({ message: 'The scorekeeper PIN changed. Enter it again.', variant: 'error' })
        signOut()
      } else {
        toast.show({ title: "Couldn't start the game", message: res.error === 'teams_not_set' ? 'Both teams aren’t known yet.' : 'The tournament sheet refused it.', variant: 'error' })
      }
    } catch (e) {
      toast.error("Couldn't start the game", e)
    } finally {
      setStarting(null)
    }
  }

  return (
    <View style={shared.screen}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenContainer>
        <ScreenHeader
          kicker="Scorekeeper"
          title="Score a game"
          safeTop
          onBack={() => (open ? setOpen(null) : router.canGoBack() ? router.back() : router.replace(routes.programScores(programId)))}
        />
        <ScreenState
          loading={scores.isLoading}
          ready={!!state}
          error={!execUrl ? null : scores.error && !state ? "Couldn't reach the tournament sheet." : null}
          onRetry={() => { void scores.refetch({ force: true }) }}
          empty={!execUrl}
          emptyIcon="clipboard-outline"
          emptyTitle="No scorekeeping for this tournament"
          emptyBody="Scorekeeping works for tournaments run on the vteam tournament sheet."
        >
          <ScrollView contentContainerStyle={{ paddingHorizontal: theme.spacing.md, paddingBottom: theme.spacing.xl }} keyboardShouldPersistTaps="handled">
            {!keeper && state ? (
              <View style={ts.card} testID="sheet-keeper-signin">
                <Text style={{ fontFamily: theme.fonts.bodySemiBold, fontSize: theme.font.size.md, color: theme.colors.text }}>
                  {state.settings.pin_required ? 'Enter the scorekeeper PIN from the tournament desk.' : 'Who is scoring?'}
                </Text>
                <Text style={[ts.muted13, { marginTop: 4 }]}>Your name goes in the sheet's log next to each final.</Text>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder="Your name"
                  placeholderTextColor={theme.colors.subtext}
                  accessibilityLabel="Your name"
                  autoCapitalize="words"
                  maxLength={40}
                  style={[inputStyle, { marginTop: theme.spacing.md }]}
                  testID="sheet-keeper-name"
                />
                {state.settings.pin_required && (
                  <TextInput
                    value={pin}
                    onChangeText={t => { setPin(t.replace(/\D/g, '')); setPinError(null) }}
                    placeholder="PIN"
                    placeholderTextColor={theme.colors.subtext}
                    accessibilityLabel="Scorekeeper PIN"
                    keyboardType="number-pad"
                    secureTextEntry
                    maxLength={12}
                    onSubmitEditing={() => { void signIn() }}
                    style={[inputStyle, { marginTop: theme.spacing.sm }]}
                    testID="sheet-keeper-pin"
                  />
                )}
                {pinError && <Text style={{ marginTop: theme.spacing.sm, color: theme.colors.hot, fontFamily: theme.fonts.body, fontSize: theme.font.size.smd }}>{pinError}</Text>}
                <View style={{ marginTop: theme.spacing.md }}>
                  <Button label="Start scoring" onPress={() => { void signIn() }} loading={checking} disabled={!!state.settings.pin_required && pin.trim().length < 4} testID="sheet-keeper-go" />
                </View>
              </View>
            ) : keeper && open && execUrl && state ? (
              <SheetScoringPanel
                key={open.match_id}
                execUrl={execUrl}
                keeper={keeper}
                match={open}
                latest={latest}
                rules={state.settings}
                onClose={changed => { setOpen(null); if (changed) void scores.refetch({ force: true }) }}
              />
            ) : keeper && state ? (
              <View testID="sheet-keeper-games">
                <View style={[ts.rowBetween, { marginBottom: theme.spacing.sm }]}>
                  <Text style={ts.muted13}>Scoring as {keeper.by}</Text>
                  <TouchableOpacity onPress={signOut} accessibilityRole="button" style={{ minHeight: 44, justifyContent: 'center' }}>
                    <Text style={{ fontFamily: theme.fonts.bodySemiBold, fontSize: theme.font.size.smd, color: theme.colors.primary }}>Sign out</Text>
                  </TouchableOpacity>
                </View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm, marginBottom: theme.spacing.md }} accessibilityRole="radiogroup">
                  {groups.map(g => (
                    <Chip key={g.key} label={g.label} role="radio" variant={g.kind === 'bracket' ? 'tint' : 'solid'} active={activeGroup === g.key} onPress={() => setGroup(g.key)} testID={`sheet-group-${g.key}`} />
                  ))}
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, marginBottom: theme.spacing.md }}>
                  <Text style={ts.muted13}>Your court</Text>
                  <TextInput
                    value={court}
                    onChangeText={t => setCourt(t.replace(/\D/g, '').slice(0, 3))}
                    placeholder="#"
                    placeholderTextColor={theme.colors.subtext}
                    keyboardType="number-pad"
                    accessibilityLabel="Your court number"
                    style={[inputStyle, { width: 72, textAlign: 'center' }]}
                    testID="sheet-keeper-court"
                  />
                  <Text style={[ts.muted13, { flex: 1 }]}>Used when a game has no court yet.</Text>
                </View>
                {games.length === 0 && <Text style={ts.muted13}>No games to score here right now.</Text>}
                {games.map(g => (
                  <TouchableOpacity
                    key={g.key}
                    onPress={() => { void openGame(g) }}
                    disabled={!!starting}
                    accessibilityRole="button"
                    accessibilityLabel={`${g.status === 'live' ? 'Continue' : g.status === 'final' ? 'Correct' : 'Start'} ${g.teamA} versus ${g.teamB}, ${g.label}`}
                    style={[ts.card, { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, borderColor: g.status === 'live' ? theme.colors.hot : theme.colors.border }]}
                    testID={`sheet-game-${g.key}`}
                  >
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text numberOfLines={1} style={{ fontFamily: theme.fonts.bodySemiBold, fontSize: theme.font.size.md, color: theme.colors.text }}>{g.teamA} vs {g.teamB}</Text>
                      <Text numberOfLines={1} style={[ts.muted13, { marginTop: 2 }]}>{[g.label, g.court ? `Court ${g.court}` : null].filter(Boolean).join(' · ')}</Text>
                    </View>
                    <Text style={{ fontFamily: theme.fonts.bodySemiBold, fontSize: theme.font.size.smd, color: g.status === 'live' ? theme.colors.hot : g.status === 'final' ? theme.colors.subtext : theme.colors.primary }}>
                      {starting === g.key ? 'Starting…' : g.status === 'live' ? 'Continue' : g.status === 'final' ? 'Correct' : 'Start'}
                    </Text>
                    <Ionicons name="chevron-forward" size={16} color={theme.colors.subtext} />
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}
          </ScrollView>
        </ScreenState>
      </ScreenContainer>
    </View>
  )
}
