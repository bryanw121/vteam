import { useMemo, useState } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native'
import { Stack, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Text } from '../../../components/ui/Text'
import { Chip, ScreenContainer, ScreenHeader } from '../../../components/ui'
import { Input } from '../../../components/Input'
import { Button } from '../../../components/Button'
import { createMatch } from '../../../hooks/useScoreMatch'
import { MATCH_FORMATS, makeRules, type MatchFormatKey } from '../../../lib/scoresheet/rules'
import { parseRoster } from '../../../lib/scoresheet/roster'
import { shared, theme } from '../../../constants'
import { routes } from '../../../utils/routes'
import type { MatchInfo, RulesPreset, TeamSide } from '../../../types'

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

const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** New scorekeeper match: teams and rosters, format and rules, optional match details. */
export default function NewScoreMatchScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const [names, setNames] = useState<Record<TeamSide, string>>({ A: '', B: '' })
  const [rosters, setRosters] = useState<Record<TeamSide, string>>({ A: '', B: '' })
  const [format, setFormat] = useState<MatchFormatKey>('bestOf3')
  const [preset, setPreset] = useState<RulesPreset>('usav')
  const [cap, setCap] = useState<number | null>(null)
  const [info, setInfo] = useState<MatchInfo>({ date: today() })
  const [showDetails, setShowDetails] = useState(false)
  const [tried, setTried] = useState(false)
  const [saving, setSaving] = useState(false)

  const parsed = useMemo(() => ({ A: parseRoster(rosters.A), B: parseRoster(rosters.B) }), [rosters])
  const problems = (side: TeamSide): string | undefined => {
    const p = parsed[side]
    if (p.errors.length) return p.errors[0]
    const regulars = p.players.filter(x => !x.libero).length
    if (regulars < 6) return `Add at least 6 players (not counting liberos); ${regulars} so far.`
    return undefined
  }
  const ready = !problems('A') && !problems('B')

  async function start() {
    setTried(true)
    if (!ready || saving) return
    setSaving(true)
    try {
      const id = await createMatch({
        info,
        teams: {
          A: { name: names.A.trim() || 'Team A', players: parsed.A.players },
          B: { name: names.B.trim() || 'Team B', players: parsed.B.players },
        },
        rules: makeRules(preset, { ...MATCH_FORMATS[format], cap }),
      })
      router.replace(routes.scorekeeperMatch(id))
    } finally {
      setSaving(false)
    }
  }

  const setInfoField = (key: keyof MatchInfo) => (v: string) => setInfo(prev => ({ ...prev, [key]: v }))

  return (
    <View style={shared.screen}>
      <Stack.Screen options={{ headerShown: false }} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: theme.spacing.md, paddingBottom: insets.bottom + theme.spacing.xxl }} keyboardShouldPersistTaps="handled">
          <ScreenContainer>
            <ScreenHeader safeTop kicker="Scorekeeper" title="New match" onBack={() => router.back()} />

            {(['A', 'B'] as const).map(side => (
              <View key={side} style={[shared.card, { marginTop: theme.spacing.md, gap: theme.spacing.sm }]}>
                <Text style={shared.subheading}>Team {side}</Text>
                <Input
                  label="Team name"
                  value={names[side]}
                  onChangeText={v => setNames(prev => ({ ...prev, [side]: v }))}
                  placeholder={side === 'A' ? 'Home team' : 'Visiting team'}
                  maxLength={40}
                  testID={`team-name-${side}`}
                />
                <Input
                  label="Roster: one player per line"
                  value={rosters[side]}
                  onChangeText={v => setRosters(prev => ({ ...prev, [side]: v }))}
                  placeholder={'7 Jane Doe\n12 Kim L\n3 Ana C'}
                  multiline
                  numberOfLines={6}
                  autoCapitalize="words"
                  autoCorrect={false}
                  error={tried ? problems(side) : undefined}
                  testID={`team-roster-${side}`}
                />
                <Text style={shared.caption}>
                  Number first, name optional. Add L for a libero and C for the captain.
                  {parsed[side].players.length ? ` ${parsed[side].players.length} players.` : ''}
                </Text>
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

            <Button label="Next: lineups" icon="arrow-forward" onPress={() => void start()} loading={saving} style={{ marginTop: theme.spacing.lg }} testID="start-match" />
            {tried && !ready && <Text style={[shared.caption, { color: theme.colors.error, marginTop: theme.spacing.sm }]}>Fix the rosters above to continue.</Text>}
          </ScreenContainer>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  )
}
