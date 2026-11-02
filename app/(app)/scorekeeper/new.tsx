import { useState } from 'react'
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native'
import { Stack, useRouter } from 'expo-router'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Text } from '../../../components/ui/Text'
import { Chip, ScreenContainer, ScreenHeader } from '../../../components/ui'
import { Input } from '../../../components/Input'
import { Button } from '../../../components/Button'
import { CourtLayout } from '../../../components/scoresheet/CourtLayout'
import { CourtSpot } from '../../../components/scoresheet/CourtSpot'
import { PlayerChip } from '../../../components/scoresheet/PlayerChip'
import { PlayerSheet } from '../../../components/scoresheet/PlayerSheet'
import { TEAM_COLORS } from '../../../components/scoresheet/teamColors'
import { createMatch } from '../../../hooks/useScoreMatch'
import { POSITION_LABELS } from '../../../lib/scoresheet/engine'
import { MATCH_FORMATS, makeRules, type MatchFormatKey } from '../../../lib/scoresheet/rules'
import { shared, theme } from '../../../constants'
import { routes } from '../../../utils/routes'
import type { Lineup, MatchInfo, RosterPlayer, RulesPreset, TeamSide } from '../../../types'

const FORMAT_OPTIONS: { key: MatchFormatKey; label: string; hint: string }[] = [
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
const CAP_OPTIONS: { value: number | null; label: string }[] = [
  { value: null, label: 'No cap' },
  { value: 27, label: 'Cap 27' },
  { value: 30, label: 'Cap 30' },
]

type TeamDraft = { name: string; court: (RosterPlayer | null)[]; bench: RosterPlayer[] }
type Editing = { side: TeamSide; spot: 'court'; position: number } | { side: TeamSide; spot: 'bench'; index: number | null }

const emptyTeam = (): TeamDraft => ({ name: '', court: [null, null, null, null, null, null], bench: [] })
const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * New scorekeeper match: put the starting six of each team on the court (tap a spot, type the
 * number and name), add subs and liberos on the bench, pick who serves, the format and the rules.
 * Starting the match starts set 1 with that lineup.
 */
export default function NewScoreMatchScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const [teams, setTeams] = useState<Record<TeamSide, TeamDraft>>({ A: emptyTeam(), B: emptyTeam() })
  const [editing, setEditing] = useState<Editing | null>(null)
  const [firstServe, setFirstServe] = useState<TeamSide | null>(null)
  const [format, setFormat] = useState<MatchFormatKey>('bestOf3')
  const [preset, setPreset] = useState<RulesPreset>('usav')
  const [cap, setCap] = useState<number | null>(null)
  const [info, setInfo] = useState<MatchInfo>({ date: today() })
  const [showDetails, setShowDetails] = useState(false)
  const [tried, setTried] = useState(false)
  const [saving, setSaving] = useState(false)

  const teamLabel = (side: TeamSide) => teams[side].name.trim() || `Team ${side}`
  const allPlayers = (side: TeamSide) => [...teams[side].court.filter((p): p is RosterPlayer => p != null), ...teams[side].bench]
  const missing = (side: TeamSide) => teams[side].court.filter(p => p == null).length
  const ready = missing('A') === 0 && missing('B') === 0 && firstServe != null

  // The next empty court spot after this one: this team in serving order, then the other team.
  const nextEmpty = (side: TeamSide, position: number, draft = teams): { side: TeamSide; position: number } | null => {
    for (let i = 1; i <= 6; i++) {
      const p = (position + i) % 6
      if (draft[side].court[p] == null) return { side, position: p }
    }
    const otherSide: TeamSide = side === 'A' ? 'B' : 'A'
    const p = draft[otherSide].court.findIndex(x => x == null)
    return p >= 0 ? { side: otherSide, position: p } : null
  }

  const current: RosterPlayer | null = !editing
    ? null
    : editing.spot === 'court'
      ? teams[editing.side].court[editing.position]
      : editing.index != null ? teams[editing.side].bench[editing.index] : null
  const taken = editing ? allPlayers(editing.side).filter(p => p !== current).map(p => p.number) : []
  const upcoming = editing?.spot === 'court' && !current ? nextEmpty(editing.side, editing.position) : null

  const save = (player: RosterPlayer) => {
    if (!editing) return
    const draft = { ...teams, [editing.side]: { ...teams[editing.side], court: [...teams[editing.side].court], bench: [...teams[editing.side].bench] } }
    const t = draft[editing.side]
    if (editing.spot === 'court') t.court[editing.position] = player
    else if (editing.index != null) t.bench[editing.index] = player
    else t.bench.push(player)
    setTeams(draft)
    // Filling an empty spot moves straight on to the next one.
    if (editing.spot === 'court' && !current) {
      const next = nextEmpty(editing.side, editing.position, draft)
      setEditing(next ? { side: next.side, spot: 'court', position: next.position } : null)
    } else setEditing(null)
  }

  const remove = () => {
    if (!editing) return
    const t = { ...teams[editing.side], court: [...teams[editing.side].court], bench: [...teams[editing.side].bench] }
    if (editing.spot === 'court') t.court[editing.position] = null
    else if (editing.index != null) t.bench.splice(editing.index, 1)
    setTeams({ ...teams, [editing.side]: t })
    setEditing(null)
  }

  async function start() {
    setTried(true)
    if (!ready || saving || !firstServe) return
    setSaving(true)
    try {
      const lineup = (side: TeamSide) => teams[side].court.map(p => p!.number) as unknown as Lineup
      const liberos = (side: TeamSide) => teams[side].bench.filter(p => p.libero).map(p => p.number).slice(0, 2)
      const id = await createMatch(
        {
          info,
          teams: {
            A: { name: teamLabel('A'), players: allPlayers('A').sort((a, b) => a.number - b.number) },
            B: { name: teamLabel('B'), players: allPlayers('B').sort((a, b) => a.number - b.number) },
          },
          rules: makeRules(preset, { ...MATCH_FORMATS[format], cap }),
        },
        { type: 'set_start', lineups: { A: lineup('A'), B: lineup('B') }, firstServe, liberos: { A: liberos('A'), B: liberos('B') } },
      )
      router.replace(routes.scorekeeperMatch(id))
    } finally {
      setSaving(false)
    }
  }

  const setInfoField = (key: keyof MatchInfo) => (v: string) => setInfo(prev => ({ ...prev, [key]: v }))

  const label = (side: TeamSide) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
      <View style={{ flex: 1 }}>
        <Input
          value={teams[side].name}
          onChangeText={v => setTeams(prev => ({ ...prev, [side]: { ...prev[side], name: v } }))}
          placeholder={side === 'A' ? 'Team A name' : 'Team B name'}
          maxLength={40}
          accessibilityLabel={`Team ${side} name`}
          testID={`team-name-${side}`}
        />
      </View>
      <Pressable
        onPress={() => setFirstServe(side)}
        role="radio"
        aria-checked={firstServe === side}
        accessibilityLabel={`${teamLabel(side)} serves first`}
        testID={`first-serve-${side}`}
        style={[
          { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: theme.spacing.sm, borderRadius: theme.radius.full, borderWidth: 1, borderColor: theme.colors.border },
          firstServe === side && { backgroundColor: TEAM_COLORS[side].fill, borderColor: TEAM_COLORS[side].fill },
        ]}
      >
        <Ionicons name="tennisball-outline" size={16} color={firstServe === side ? TEAM_COLORS[side].ink : theme.colors.subtextStrong} />
        <Text style={[shared.caption, { color: firstServe === side ? TEAM_COLORS[side].ink : theme.colors.subtextStrong }]}>{firstServe === side ? 'Serves first' : 'Serve?'}</Text>
      </Pressable>
    </View>
  )

  return (
    <View style={shared.screen}>
      <Stack.Screen options={{ headerShown: false }} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: theme.spacing.md, paddingBottom: insets.bottom + theme.spacing.xxl }} keyboardShouldPersistTaps="handled">
          <ScreenContainer>
            <ScreenHeader safeTop kicker="Scorekeeper" title="New match" onBack={() => router.back()} />
            <Text style={[shared.body, { color: theme.colors.subtextStrong, marginBottom: theme.spacing.md }]}>
              Tap a spot to put a player on the court. Position I serves first. Then add subs and liberos on each bench.
            </Text>

            <CourtLayout
              renderLabel={label}
              renderSpot={(side, position) => {
                const p = teams[side].court[position]
                const active = editing?.spot === 'court' && editing.side === side && editing.position === position
                return (
                  <CourtSpot
                    position={position}
                    number={p?.number}
                    name={p?.name}
                    highlight={active ? TEAM_COLORS[side] : null}
                    onPress={() => setEditing({ side, spot: 'court', position })}
                    accessibilityLabel={`${teamLabel(side)} position ${POSITION_LABELS[position]}${p ? `: #${p.number}${p.name ? ` ${p.name}` : ''}` : ', empty'}`}
                    testID={`spot-${side}-${position}`}
                  />
                )
              }}
            />
            {tried && !ready && (
              <Text style={[shared.caption, { color: theme.colors.error, marginTop: theme.spacing.sm }]}>
                {missing('A') + missing('B') > 0 ? `Fill all six spots for both teams (${missing('A') + missing('B')} empty).` : 'Pick who serves first.'}
              </Text>
            )}

            {(['A', 'B'] as const).map(side => (
              <View key={side} style={[shared.card, { marginTop: theme.spacing.md, gap: theme.spacing.sm, borderLeftWidth: 4, borderLeftColor: TEAM_COLORS[side].fill }]} testID={`bench-${side}`}>
                <Text style={shared.label}>{teamLabel(side)} bench: subs and liberos</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
                  {teams[side].bench.map((p, index) => (
                    <PlayerChip key={p.number} number={p.number} name={p.name} libero={p.libero} onPress={() => setEditing({ side, spot: 'bench', index })} />
                  ))}
                  <Chip label="+ Add player" variant="tint" onPress={() => setEditing({ side, spot: 'bench', index: null })} testID={`bench-add-${side}`} />
                </View>
              </View>
            ))}

            <View style={[shared.card, { marginTop: theme.spacing.md, gap: theme.spacing.sm }]}>
              <Text style={shared.subheading}>Format</Text>
              <View role="radiogroup" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
                {FORMAT_OPTIONS.map(o => <Chip key={o.key} label={o.label} role="radio" active={format === o.key} onPress={() => setFormat(o.key)} testID={`format-${o.key}`} />)}
              </View>
              <Text style={shared.caption}>{FORMAT_OPTIONS.find(o => o.key === format)?.hint}. Win by 2.</Text>
              <View role="radiogroup" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
                {CAP_OPTIONS.map(o => <Chip key={o.label} label={o.label} role="radio" variant="tint" active={cap === o.value} onPress={() => setCap(o.value)} />)}
              </View>
              <Text style={[shared.subheading, { marginTop: theme.spacing.sm }]}>Rules</Text>
              <View role="radiogroup" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
                {RULE_OPTIONS.map(o => <Chip key={o.key} label={o.label} role="radio" active={preset === o.key} onPress={() => setPreset(o.key)} testID={`rules-${o.key}`} />)}
              </View>
              <Text style={shared.caption}>{RULE_OPTIONS.find(o => o.key === preset)?.hint}. Breaking a rule shows a warning but is still recorded.</Text>
            </View>

            <View style={[shared.card, { marginTop: theme.spacing.md, gap: theme.spacing.sm }]}>
              <Button
                label={showDetails ? 'Hide match details' : 'Add match details (optional)'}
                variant="ghost"
                icon={showDetails ? 'chevron-up' : 'chevron-down'}
                onPress={() => setShowDetails(v => !v)}
              />
              {showDetails && (
                <View style={{ gap: theme.spacing.sm }}>
                  <Input label="Competition" value={info.competition ?? ''} onChangeText={setInfoField('competition')} maxLength={80} />
                  <Input label="Division / category" value={info.division ?? ''} onChangeText={setInfoField('division')} maxLength={40} />
                  <Input label="Match no." value={info.matchNo ?? ''} onChangeText={setInfoField('matchNo')} maxLength={20} />
                  <Input label="City, state" value={info.city ?? ''} onChangeText={setInfoField('city')} maxLength={60} />
                  <Input label="Hall" value={info.hall ?? ''} onChangeText={setInfoField('hall')} maxLength={60} />
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
                </View>
              )}
            </View>

            <Button label="Start match" icon="play" onPress={() => void start()} loading={saving} style={{ marginTop: theme.spacing.lg }} testID="start-match" />
          </ScreenContainer>
        </ScrollView>
      </KeyboardAvoidingView>

      <PlayerSheet
        visible={editing != null}
        editKey={editing ? `${editing.side}:${editing.spot}:${editing.spot === 'court' ? editing.position : editing.index ?? 'new'}` : ''}
        title={editing ? `${teamLabel(editing.side)} · ${editing.spot === 'court' ? `position ${POSITION_LABELS[editing.position]}${editing.position === 0 ? ' (serves first)' : ''}` : 'bench'}` : ''}
        initial={current}
        taken={taken}
        allowLibero={editing?.spot === 'bench'}
        saveLabel={upcoming ? `Save, next: ${upcoming.side === editing?.side ? '' : `${teamLabel(upcoming.side)} `}position ${POSITION_LABELS[upcoming.position]}` : 'Save'}
        onSave={save}
        onRemove={current ? remove : undefined}
        onDismiss={() => setEditing(null)}
      />
    </View>
  )
}
