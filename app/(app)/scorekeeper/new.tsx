import { useEffect, useRef, useState } from 'react'
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native'
import { Stack, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Text } from '../../../components/ui/Text'
import { BottomSheet, Chip, ScreenContainer, ScreenHeader } from '../../../components/ui'
import { Input } from '../../../components/Input'
import { Button } from '../../../components/Button'
import { RosterTextSheet } from '../../../components/scoresheet/RosterTextSheet'
import { TeamNumbersCard } from '../../../components/scoresheet/TeamNumbersCard'
import { SheetBody } from '../../../components/scoresheet/SheetParts'
import { emptyGrid, gridBoxes, gridFromRoster, gridIsEmpty, gridIssues, gridReady, gridTeamLabel, gridToRoster, numbersIn, typeIntoBox } from '../../../lib/scoresheet/numberGrid'
import { rosterToText } from '../../../lib/scoresheet/rosterText'
import { TEAM_COLORS } from '../../../components/scoresheet/teamColors'
import { createMatch } from '../../../hooks/useScoreMatch'
import { MATCH_FORMATS, makeRules, withOptions, type MatchFormatKey } from '../../../lib/scoresheet/rules'
import { shared, theme } from '../../../constants'
import { routes } from '../../../utils/routes'
import { SavedTeamsPicker } from '../../../components/scoresheet/SavedTeamsPicker'
import { loadSavedTeams, loadTodaysInfo, rememberInfo, rememberTeams } from '../../../lib/scoresheet/teamStore'
import type { GridBox, Lineup, MatchInfo, NumberGridTeam, RosterPlayer, RulesPreset, SavedTeam, TeamSide } from '../../../types'

const FORMAT_OPTIONS: { key: MatchFormatKey; label: string; hint: string }[] = [
  { key: 'oneSet', label: '1 set', hint: 'One set to 25 decides it' },
  { key: 'bestOf3', label: 'Best of 3', hint: '25, 25, 15' },
  { key: 'bestOf5', label: 'Best of 5', hint: '25 ×4, 15' },
  { key: 'twoSets', label: 'Pool: 2 sets', hint: 'Both sets played, can split' },
  { key: 'threeSetsAllPlayed', label: 'Pool: 3 sets', hint: '25, 25, 15, all played' },
]
const RULE_OPTIONS: { key: RulesPreset; label: string; hint: string }[] = [
  { key: 'usav', label: 'USA Volleyball', hint: '12 subs a set, players keep their spot in the order, libero serves in one spot' },
  { key: 'international', label: 'International', hint: '6 subs a set, starters out and back once, libero never serves' },
  { key: 'casual', label: 'Rec', hint: 'No sub limits or re-entry warnings' },
]
const START_OPTIONS = [0, 4] as const
const TIME_OPTIONS: { value: number | null; label: string }[] = [
  { value: null, label: 'No time limit' },
  { value: 35, label: '35 min' },
  { value: 40, label: '40 min' },
  { value: 45, label: '45 min' },
]
/** Tournament shortcuts: NAGVA pool play and bracket formats. */
const QUICK_SETUPS: { key: string; label: string; hint: string; format: MatchFormatKey; start: number; cap: number | null; time: number | null }[] = [
  { key: 'nagva-pool', label: 'NAGVA pool play', hint: '2 sets to 25 from 4–4, cap 27, 40-minute clock', format: 'twoSets', start: 4, cap: 27, time: 40 },
  { key: 'nagva-bracket', label: 'NAGVA bracket', hint: 'Best of 3: two sets to 25 from 4–4 (cap 27), third to 15 from 0', format: 'bestOf3', start: 4, cap: 27, time: null },
]
const CAP_OPTIONS: { value: number | null; label: string }[] = [
  { value: null, label: 'No cap' },
  { value: 27, label: 'Cap 27' },
  { value: 30, label: 'Cap 30' },
]

const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const boxKey = (side: TeamSide, b: GridBox) => `${side}:${b.part}:${b.index}`

/**
 * New scorekeeper match in two steps. Step 1: every number of both teams on one screen
 * (starting six in serving order, bench, liberos), typed box after box or pasted.
 * Step 2: tap the team that serves first, and the match starts.
 */
export default function NewScoreMatchScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const [teams, setTeams] = useState<Record<TeamSide, NumberGridTeam>>({ A: emptyGrid(), B: emptyGrid() })
  const [step, setStep] = useState<'numbers' | 'serve'>('numbers')
  const [format, setFormat] = useState<MatchFormatKey>('bestOf3')
  const [preset, setPreset] = useState<RulesPreset>('usav')
  const [cap, setCap] = useState<number | null>(null)
  const [startAt, setStartAt] = useState<number>(0)
  const [timeLimit, setTimeLimit] = useState<number | null>(null)
  // null: the rules preset's own length.
  const [timeoutSeconds, setTimeoutSeconds] = useState<number | null>(null)
  const [info, setInfo] = useState<MatchInfo>({ date: today() })
  const [sheet, setSheet] = useState<'format' | 'details' | null>(null)
  const [tried, setTried] = useState(false)
  const [saving, setSaving] = useState(false)
  // A whole team typed or pasted at once, with names, instead of box by box.
  const [typing, setTyping] = useState<TeamSide | null>(null)
  const [savedTeams, setSavedTeams] = useState<SavedTeam[]>([])
  const [carried, setCarried] = useState(false)
  const inputs = useRef(new Map<string, { focus?: () => void }>())

  // Teams from earlier matches, and today's competition / court / officials from the last match.
  useEffect(() => {
    let live = true
    void loadSavedTeams().then(t => { if (live) setSavedTeams(t) })
    void loadTodaysInfo().then(last => {
      if (!live || !last) return
      setInfo(prev => ({ ...last, ...Object.fromEntries(Object.entries(prev).filter(([, v]) => v)) }))
      setCarried(true)
    })
    return () => { live = false }
  }, [])

  const teamLabel = (side: TeamSide) => gridTeamLabel(teams[side], side)
  const ready = gridReady(teams.A) && gridReady(teams.B)
  // Saved teams fill the first team that's still empty.
  const pickTarget: TeamSide | null = gridIsEmpty(teams.A) ? 'A' : gridIsEmpty(teams.B) ? 'B' : null
  const usedNames = new Set((['A', 'B'] as const).map(side => teams[side].name.trim().toLowerCase()))
  const applySaved = (team: SavedTeam) => {
    if (!pickTarget) return
    setTeams(prev => ({ ...prev, [pickTarget]: gridFromRoster(team.name, team.court, team.bench) }))
  }

  // Focus order: team A's court, bench and liberos, then team B's.
  const order = (draft: Record<TeamSide, NumberGridTeam>) =>
    (['A', 'B'] as const).flatMap(side => gridBoxes(draft[side]).map(b => boxKey(side, b)))
  const focusAfter = (side: TeamSide, b: GridBox, steps: number, draft = teams) => {
    const keys = order(draft)
    const at = keys.indexOf(boxKey(side, b))
    const next = keys[at + steps]
    // Wait a frame so a bench box added by this keystroke exists before it's focused.
    if (next) setTimeout(() => inputs.current.get(next)?.focus?.(), 0)
  }

  const typeBox = (side: TeamSide, b: GridBox, text: string) => {
    const { team, filled } = typeIntoBox(teams[side], b, text)
    const draft = { ...teams, [side]: team }
    setTeams(draft)
    const value = team[b.part][b.index]
    // Two digits, a space or comma after a number, or a pasted list: on to the next box.
    if (filled > 1) focusAfter(side, b, filled, draft)
    else if (value.length === 2 || (value && /\D$/.test(text) && numbersIn(text).length === 1)) focusAfter(side, b, 1, draft)
  }

  const applyTyped = (team: { name: string; court: (RosterPlayer | null)[]; bench: RosterPlayer[] }) => {
    if (!typing) return
    const side = typing
    setTeams(prev => ({ ...prev, [side]: gridFromRoster(team.name || prev[side].name, team.court, team.bench) }))
    setTyping(null)
  }

  const next = () => {
    setTried(true)
    if (ready) setStep('serve')
  }

  async function start(firstServe: TeamSide) {
    if (!ready || saving) return
    setSaving(true)
    try {
      const roster = { A: gridToRoster(teams.A), B: gridToRoster(teams.B) }
      const lineup = (side: TeamSide) => roster[side].court.map(p => p.number) as unknown as Lineup
      const liberos = (side: TeamSide) => roster[side].bench.filter(p => p.libero).map(p => p.number).slice(0, 2)
      const players = (side: TeamSide) => [...roster[side].court, ...roster[side].bench].sort((a, b) => a.number - b.number)
      const id = await createMatch(
        {
          info,
          teams: { A: { name: teamLabel('A'), players: players('A') }, B: { name: teamLabel('B'), players: players('B') } },
          rules: { ...makeRules(preset, withOptions(MATCH_FORMATS[format], { start: startAt, cap, timeLimitMinutes: timeLimit })), ...(timeoutSeconds ? { timeoutSeconds } : {}) },
        },
        { type: 'set_start', lineups: { A: lineup('A'), B: lineup('B') }, firstServe, liberos: { A: liberos('A'), B: liberos('B') } },
      )
      void rememberTeams((['A', 'B'] as const).map(side => ({ name: teamLabel(side), court: roster[side].court, bench: roster[side].bench })))
      void rememberInfo(info)
      router.replace(routes.scorekeeperMatch(id))
    } finally {
      setSaving(false)
    }
  }

  const setInfoField = (key: keyof MatchInfo) => (v: string) => setInfo(prev => ({ ...prev, [key]: v }))
  const quick = QUICK_SETUPS.find(q => format === q.format && startAt === q.start && cap === q.cap && timeLimit === q.time && preset === 'usav')
  const formatSummary = [
    quick?.label ?? FORMAT_OPTIONS.find(o => o.key === format)?.label,
    quick ? null : FORMAT_OPTIONS.find(o => o.key === format)?.hint,
    RULE_OPTIONS.find(o => o.key === preset)?.label,
  ].filter(Boolean).join(' · ')
  const missingTotal = gridIssues(teams.A).missingCourt + gridIssues(teams.B).missingCourt
  const back = () => (step === 'serve' ? setStep('numbers') : router.canGoBack() ? router.back() : router.replace(routes.scorekeeper()))

  return (
    <View style={shared.screen}>
      <Stack.Screen options={{ headerShown: false }} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, padding: theme.spacing.md, paddingBottom: insets.bottom + theme.spacing.xxl }} keyboardShouldPersistTaps="handled">
          <ScreenContainer>
            <ScreenHeader safeTop kicker={step === 'numbers' ? 'New match · 1 of 2' : 'New match · 2 of 2'} title={step === 'numbers' ? 'Team numbers' : 'Who serves first?'} onBack={back} />

            {step === 'numbers' && (
              <>
                <Text style={[shared.body, { color: theme.colors.subtextStrong, marginBottom: theme.spacing.md }]}>
                  Type each player's jersey number. Tap the first box and keep typing: it moves to the next box by itself.
                </Text>
                <SavedTeamsPicker
                  teams={savedTeams.filter(t => !usedNames.has(t.name.trim().toLowerCase()))}
                  target={pickTarget}
                  targetLabel={pickTarget === 'A' ? 'team A' : 'team B'}
                  onPick={applySaved}
                />
                <View style={{ gap: theme.spacing.md }}>
                  {(['A', 'B'] as const).map(side => (
                    <TeamNumbersCard
                      key={side}
                      side={side}
                      team={teams[side]}
                      showMissing={tried}
                      onName={v => setTeams(prev => ({ ...prev, [side]: { ...prev[side], name: v } }))}
                      onType={(b, t) => typeBox(side, b, t)}
                      onSubmitBox={b => focusAfter(side, b, 1)}
                      onPaste={() => setTyping(side)}
                      boxRef={b => el => {
                        const key = boxKey(side, b)
                        if (el) inputs.current.set(key, el as { focus?: () => void })
                        else inputs.current.delete(key)
                      }}
                    />
                  ))}
                </View>
                {tried && !ready && (
                  <Text style={[shared.caption, { color: theme.colors.error, marginTop: theme.spacing.sm }]} accessibilityRole="alert">
                    {missingTotal > 0 ? `Fill all six starting spots for both teams (${missingTotal} empty).` : 'A number is in more than one box.'}
                  </Text>
                )}
                <Button label="Next: who serves" icon="arrow-forward" onPress={next} style={{ marginTop: theme.spacing.lg }} testID="numbers-next" />
              </>
            )}

            {step === 'serve' && (
              <View style={{ flex: 1, gap: theme.spacing.md }}>
                <Text style={[shared.body, { color: theme.colors.subtextStrong }]}>Tap the team. The match starts right away.</Text>
                {(['A', 'B'] as const).map(side => (
                  <Pressable
                    key={side}
                    onPress={() => void start(side)}
                    disabled={saving}
                    accessibilityRole="button"
                    accessibilityLabel={`${teamLabel(side)} serves first`}
                    testID={`first-serve-${side}`}
                    style={({ pressed }) => [shared.serveFirstBtn, { backgroundColor: TEAM_COLORS[side].fill }, pressed && { opacity: 0.85 }]}
                  >
                    <Text style={[shared.scorePointTeam, { color: TEAM_COLORS[side].ink, fontSize: theme.font.size.xl }]} numberOfLines={1}>{teamLabel(side)}</Text>
                    <Text style={[shared.body, { color: TEAM_COLORS[side].ink }]}>#{teams[side].court[0]} serves</Text>
                  </Pressable>
                ))}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, flexWrap: 'wrap' }}>
                  <Text style={[shared.body, { flex: 1, minWidth: 160 }]} testID="format-summary">{formatSummary}</Text>
                  <Button label="Change format" variant="ghost" size="sm" fullWidth={false} onPress={() => setSheet('format')} testID="change-format" />
                </View>
                <Button
                  label={carried ? 'Match details (from your last match today)' : 'Match details (optional)'}
                  variant="ghost"
                  icon="create-outline"
                  onPress={() => setSheet('details')}
                  testID="match-details-open"
                />
              </View>
            )}
          </ScreenContainer>
        </ScrollView>
      </KeyboardAvoidingView>

      <BottomSheet visible={sheet === 'format'} onDismiss={() => setSheet(null)} title="Format">
        <SheetBody>
          <Text style={[shared.label, { marginBottom: 0 }]}>Quick setup</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
            {QUICK_SETUPS.map(q => (
              <Chip
                key={q.key}
                label={q.label}
                variant="tint"
                active={quick?.key === q.key}
                onPress={() => { setFormat(q.format); setStartAt(q.start); setCap(q.cap); setTimeLimit(q.time); setPreset('usav'); setTimeoutSeconds(null) }}
                testID={`quick-${q.key}`}
              />
            ))}
          </View>
          {quick && <Text style={shared.caption}>{quick.hint}. NAGVA plays USA Volleyball rules.</Text>}
          <View role="radiogroup" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
            {FORMAT_OPTIONS.map(o => <Chip key={o.key} label={o.label} role="radio" active={format === o.key} onPress={() => setFormat(o.key)} testID={`format-${o.key}`} />)}
          </View>
          <Text style={shared.caption}>{FORMAT_OPTIONS.find(o => o.key === format)?.hint}. Win by 2. Caps apply to sets to 25.</Text>
          <View role="radiogroup" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
            {CAP_OPTIONS.map(o => <Chip key={o.label} label={o.label} role="radio" variant="tint" active={cap === o.value} onPress={() => setCap(o.value)} />)}
          </View>
          <Text style={[shared.label, { marginBottom: 0 }]}>Sets to 25 start at</Text>
          <View role="radiogroup" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
            {START_OPTIONS.map(v => <Chip key={v} label={`${v}–${v}`} role="radio" variant="tint" active={startAt === v} onPress={() => setStartAt(v)} testID={`start-${v}`} />)}
          </View>
          <Text style={[shared.label, { marginBottom: 0 }]}>Match clock</Text>
          <View role="radiogroup" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
            {TIME_OPTIONS.map(o => <Chip key={o.label} label={o.label} role="radio" variant="tint" active={timeLimit === o.value} onPress={() => setTimeLimit(o.value)} testID={`time-${o.value ?? 'none'}`} />)}
          </View>
          {timeLimit != null && <Text style={shared.caption}>Counts from the first serve. No time-outs in the last 2 minutes; at time the leader takes the set, and a tied set goes to the next point.</Text>}
          <Text style={[shared.label, { marginBottom: 0 }]}>Rules</Text>
          <View role="radiogroup" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
            {RULE_OPTIONS.map(o => <Chip key={o.key} label={o.label} role="radio" active={preset === o.key} onPress={() => { setPreset(o.key); setTimeoutSeconds(null) }} testID={`rules-${o.key}`} />)}
          </View>
          <Text style={shared.caption}>{RULE_OPTIONS.find(o => o.key === preset)?.hint}. Breaking a rule shows a warning but is still recorded.</Text>
          <Text style={[shared.label, { marginBottom: 0 }]}>Time-out length</Text>
          <View role="radiogroup" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
            {[30, 60, 75].map(sec => {
              const current = timeoutSeconds ?? makeRules(preset).timeoutSeconds
              return <Chip key={sec} label={`${sec} seconds`} role="radio" variant="tint" active={current === sec} onPress={() => setTimeoutSeconds(sec)} testID={`timeout-length-${sec}`} />
            })}
          </View>
          <Button label="Done" onPress={() => setSheet(null)} testID="format-done" />
        </SheetBody>
      </BottomSheet>

      <BottomSheet visible={sheet === 'details'} onDismiss={() => setSheet(null)} title="Match details">
        <SheetBody>
          <Input label="Competition" value={info.competition ?? ''} onChangeText={setInfoField('competition')} maxLength={80} />
          <Input label="Division / category" value={info.division ?? ''} onChangeText={setInfoField('division')} maxLength={40} />
          <Input label="Match no." value={info.matchNo ?? ''} onChangeText={setInfoField('matchNo')} maxLength={20} />
          <Input label="City, state" value={info.city ?? ''} onChangeText={setInfoField('city')} maxLength={60} />
          <Input label="Court" value={info.court ?? ''} onChangeText={setInfoField('court')} maxLength={20} />
          <Input label="Date" value={info.date ?? ''} onChangeText={setInfoField('date')} placeholder="2026-11-01" maxLength={10} />
          <View role="radiogroup" style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
            {(['men', 'women', 'coed'] as const).map(g => (
              <Chip key={g} label={{ men: 'Men', women: 'Women', coed: 'CoEd' }[g]} role="radio" variant="tint" active={info.gender === g} onPress={() => setInfo(prev => ({ ...prev, gender: prev.gender === g ? undefined : g }))} />
            ))}
          </View>
          <Input label="1st referee" value={info.firstReferee ?? ''} onChangeText={setInfoField('firstReferee')} maxLength={60} />
          <Input label="2nd referee" value={info.secondReferee ?? ''} onChangeText={setInfoField('secondReferee')} maxLength={60} />
          <Input label="Scorer" value={info.scorer ?? ''} onChangeText={setInfoField('scorer')} maxLength={60} />
          <Button label="Done" onPress={() => setSheet(null)} />
        </SheetBody>
      </BottomSheet>

      <RosterTextSheet
        visible={typing != null}
        teamLabel={typing ? teamLabel(typing) : ''}
        initialName={typing ? teams[typing].name : ''}
        initialText={typing ? rosterToText(gridToRoster(teams[typing]).court, gridToRoster(teams[typing]).bench) : ''}
        onApply={applyTyped}
        onDismiss={() => setTyping(null)}
      />
    </View>
  )
}
