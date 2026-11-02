import { useMemo, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { Text } from '../ui/Text'
import { Chip } from '../ui'
import { Button } from '../Button'
import { PlayerChip } from './PlayerChip'
import { CourtLayout } from './CourtLayout'
import { CourtSpot } from './CourtSpot'
import { TEAM_COLORS } from './teamColors'
import { shared, theme } from '../../constants'
import { POSITION_LABELS, nextSetDefaults } from '../../lib/scoresheet/engine'
import { teamName } from '../../lib/scoresheet/summary'
import type { Lineup, MatchDoc, MatchState, ScoreEventInput, TeamSide } from '../../types'

type Props = {
  doc: MatchDoc
  state: MatchState
  onStart: (input: ScoreEventInput) => void
}

const empty = (): (number | null)[] => [null, null, null, null, null, null]

/** Before each set: six players per team in serving order, liberos, and who serves first. */
export function LineupSetup({ doc, state, onStart }: Props) {
  const defaults = useMemo(() => nextSetDefaults(doc.setup, state), [doc.setup, state])
  const [lineups, setLineups] = useState<Record<TeamSide, (number | null)[]>>(() => ({
    A: defaults.lineups ? [...defaults.lineups.A] : empty(),
    B: defaults.lineups ? [...defaults.lineups.B] : empty(),
  }))
  const [liberos, setLiberos] = useState<Record<TeamSide, number[]>>(defaults.liberos)
  const [firstServe, setFirstServe] = useState<TeamSide | null>(defaults.firstServe)
  const [active, setActive] = useState<{ side: TeamSide; slot: number } | null>(defaults.lineups ? null : { side: 'A', slot: 0 })

  const assign = (side: TeamSide, player: number) => {
    const slot = active?.side === side ? active.slot : lineups[side].indexOf(null)
    if (slot < 0) return
    const next = lineups[side].map(n => (n === player ? null : n))
    next[slot] = player
    setLineups({ ...lineups, [side]: next })
    // Move on to the next empty slot of this team.
    const after = [...Array(6).keys()].map(i => (slot + 1 + i) % 6).find(i => next[i] == null)
    setActive(after != null ? { side, slot: after } : null)
    setLiberos(prev => ({ ...prev, [side]: prev[side].filter(n => n !== player) }))
  }

  const toggleLibero = (side: TeamSide, n: number) => {
    setLiberos(prev => ({ ...prev, [side]: prev[side].includes(n) ? prev[side].filter(x => x !== n) : [...prev[side], n].slice(-2) }))
    setLineups(prev => ({ ...prev, [side]: prev[side].map(x => (x === n ? null : x)) }))
  }

  const names = useMemo(() => ({
    A: new Map(doc.setup.teams.A.players.map(p => [p.number, p.name ?? ''])),
    B: new Map(doc.setup.teams.B.players.map(p => [p.number, p.name ?? ''])),
  }), [doc.setup])

  const complete = (side: TeamSide) => lineups[side].every(n => n != null)
  const canStart = complete('A') && complete('B') && firstServe != null

  const start = () => {
    if (!canStart || !firstServe) return
    onStart({
      type: 'set_start',
      lineups: { A: lineups.A as unknown as Lineup, B: lineups.B as unknown as Lineup },
      firstServe,
      liberos,
    })
  }

  return (
    <View style={{ gap: theme.spacing.md }}>
      <View>
        <Text style={shared.subheading}>Set {defaults.index + 1} lineups</Text>
        <Text style={shared.caption}>
          Tap a spot on the court, then a player. Position I serves first, then II, III and on around.
          {defaults.lineups ? " Filled in from last set; change anything that's different." : ''}
        </Text>
      </View>

      <CourtLayout
        renderLabel={side => <Text style={[shared.label, { color: TEAM_COLORS[side].fill, marginBottom: 0 }]}>{teamName(doc, side)}</Text>}
        renderSpot={(side, slot) => {
          const n = lineups[side][slot]
          const isActive = active?.side === side && active.slot === slot
          return (
            <CourtSpot
              position={slot}
              number={n}
              name={n != null ? names[side].get(n) : undefined}
              highlight={isActive ? TEAM_COLORS[side] : null}
              placeholder="–"
              onPress={() => setActive({ side, slot })}
              accessibilityLabel={`${teamName(doc, side)} position ${POSITION_LABELS[slot]}${n != null ? `: #${n}` : ', empty'}`}
              testID={`slot-${side}-${slot}`}
            />
          )
        }}
      />

      {(['A', 'B'] as const).map(side => {
        const roster = doc.setup.teams[side].players
        const color = TEAM_COLORS[side]
        const picking = active?.side === side
        return (
          <View key={side} style={[shared.card, { gap: theme.spacing.sm, borderLeftWidth: 4, borderLeftColor: color.fill }]} testID={`lineup-${side}`}>
            <Text style={shared.label}>
              {teamName(doc, side)}{picking && active ? `: pick position ${POSITION_LABELS[active.slot]}` : ''}
            </Text>
            <View role="radiogroup" style={styles.chips}>
              {roster.filter(p => !liberos[side].includes(p.number)).map(p => (
                <PlayerChip
                  key={p.number}
                  number={p.number}
                  name={p.name}
                  libero={p.libero}
                  selected={lineups[side].includes(p.number)}
                  onPress={() => assign(side, p.number)}
                  testID={`pick-${side}-${p.number}`}
                />
              ))}
            </View>
            <Text style={shared.label}>Liberos this set (up to 2)</Text>
            <View style={styles.chips}>
              {roster.filter(p => p.libero || liberos[side].includes(p.number)).map(p => (
                <Chip key={p.number} label={`#${p.number}${p.name ? ` ${p.name.split(' ')[0]}` : ''}`} variant="tint" active={liberos[side].includes(p.number)} onPress={() => toggleLibero(side, p.number)} />
              ))}
              {!roster.some(p => p.libero) && <Text style={shared.caption}>No libero on the roster.</Text>}
            </View>
          </View>
        )
      })}

      <View style={[shared.card, { gap: theme.spacing.sm }]}>
        <Text style={shared.subheading}>Serves first</Text>
        {defaults.deciding && <Text style={shared.caption}>Deciding set: use the new coin toss.</Text>}
        <View role="radiogroup" style={styles.chips}>
          {(['A', 'B'] as const).map(side => (
            <Chip key={side} label={teamName(doc, side)} role="radio" active={firstServe === side} onPress={() => setFirstServe(side)} testID={`first-serve-${side}`} />
          ))}
        </View>
      </View>

      <Button label={`Start set ${defaults.index + 1}`} icon="play" disabled={!canStart} onPress={start} testID="start-set" />
    </View>
  )
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
})
