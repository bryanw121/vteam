import { useMemo, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { Text } from '../ui/Text'
import { Chip } from '../ui'
import { Button } from '../Button'
import { PlayerChip } from './PlayerChip'
import { CourtSpot } from './CourtSpot'
import { TEAM_COLORS } from './teamColors'
import { shared, theme } from '../../constants'
import { nextSetDefaults } from '../../lib/scoresheet/engine'
import { teamName } from '../../lib/scoresheet/summary'
import type { Lineup, MatchDoc, MatchState, ScoreEventInput, TeamSide } from '../../types'

type Props = {
  doc: MatchDoc
  state: MatchState
  onStart: (input: ScoreEventInput) => void
}

const empty = (): (number | null)[] => [null, null, null, null, null, null]
/** Lineup slots where they stand, from behind the team's own baseline: front row at the net, server back right (slot 0). */
const FRONT_ROW = [3, 2, 1]
const BACK_ROW = [4, 5, 0]
const SPOT_NAMES = ['back right', 'front right', 'front middle', 'front left', 'back left', 'back middle']

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
  // With last set's lineups, the usual case is one tap: same six, start. Changing them opens the full editor.
  const [editing, setEditing] = useState(!defaults.lineups)
  // One team's court at a time, the same way round as on the new-match screen.
  const [team, setTeam] = useState<TeamSide>('A')

  const assign = (side: TeamSide, player: number) => {
    const slot = active?.side === side ? active.slot : lineups[side].indexOf(null)
    if (slot < 0) return
    const next = lineups[side].map(n => (n === player ? null : n))
    next[slot] = player
    setLineups({ ...lineups, [side]: next })
    // Move on to the next empty slot of this team.
    const after = [...Array(6).keys()].map(i => (slot + 1 + i) % 6).find(i => next[i] == null)
    const other: TeamSide = side === 'A' ? 'B' : 'A'
    const otherEmpty = lineups[other].indexOf(null)
    if (after != null) setActive({ side, slot: after })
    // This team is done: go on to the other team's first empty spot.
    else if (otherEmpty >= 0) { setTeam(other); setActive({ side: other, slot: otherEmpty }) }
    else setActive(null)
    setLiberos(prev => ({ ...prev, [side]: prev[side].filter(n => n !== player) }))
  }

  // Tap a spot to pick it; tap another spot of the same team to swap the two players.
  const tapSpot = (side: TeamSide, slot: number) => {
    if (active?.side === side && active.slot === slot) return setActive(null)
    if (active?.side === side) {
      const next = [...lineups[side]]
      ;[next[active.slot], next[slot]] = [next[slot], next[active.slot]]
      setLineups({ ...lineups, [side]: next })
      return setActive(null)
    }
    setActive({ side, slot })
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

  const startSame = (serve: TeamSide) => {
    if (!defaults.lineups) return
    onStart({ type: 'set_start', lineups: defaults.lineups, firstServe: serve, liberos: defaults.liberos })
  }

  if (!editing && defaults.lineups) {
    const same = defaults.lineups
    return (
      <View style={{ gap: theme.spacing.md }} testID="next-set">
        <View style={[shared.card, { gap: theme.spacing.sm }]}>
          <Text style={shared.label}>Starting six for set {defaults.index + 1} (from last set)</Text>
          {(['A', 'B'] as const).map(side => (
            <View key={side} style={{ flexDirection: 'row', gap: theme.spacing.sm, alignItems: 'center' }}>
              <Text style={[shared.body, { fontFamily: theme.fonts.bodySemiBold, color: TEAM_COLORS[side].fill, width: 120 }]} numberOfLines={1}>{teamName(doc, side)}</Text>
              <Text style={[shared.body, { flex: 1 }]}>{same[side].join(' · ')}{defaults.liberos[side].length ? `  ·  L ${defaults.liberos[side].join(', ')}` : ''}</Text>
            </View>
          ))}
        </View>
        {defaults.firstServe ? (
          <Button
            label={`Same lineups, start set ${defaults.index + 1}`}
            icon="play"
            onPress={() => startSame(defaults.firstServe!)}
            testID="start-set-same"
          />
        ) : (
          <View style={{ gap: theme.spacing.sm }}>
            <Text style={shared.subheading}>Deciding set: who serves first?</Text>
            <Text style={shared.caption}>Use the new coin toss. Same lineups as last set.</Text>
            {(['A', 'B'] as const).map(side => (
              <Button key={side} label={`${teamName(doc, side)} serves`} icon="play" variant="secondary" onPress={() => startSame(side)} testID={`start-set-same-${side}`} />
            ))}
          </View>
        )}
        {defaults.firstServe && <Text style={[shared.caption, { textAlign: 'center' }]}>{teamName(doc, defaults.firstServe)} serves first.</Text>}
        <Button label="Change lineups" variant="ghost" onPress={() => setEditing(true)} testID="change-lineups" />
      </View>
    )
  }

  return (
    <View style={{ gap: theme.spacing.md }}>
      <View>
        <Text style={shared.subheading}>Set {defaults.index + 1} lineups</Text>
        <Text style={shared.caption}>
          Tap two players on the court to swap them. To bring someone else in, tap a spot, then their number below.
          {defaults.lineups ? " Filled in from last set." : ''}
        </Text>
      </View>

      <View role="tablist" style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
        {(['A', 'B'] as const).map(side => (
          <View key={side} style={{ flex: 1 }}>
            <Button
              label={`${teamName(doc, side)}${complete(side) ? ' ✓' : ''}`}
              variant={team === side ? 'primary' : 'secondary'}
              size="touch"
              onPress={() => { setTeam(side); setActive(null) }}
              accessibilityLabel={`Show ${teamName(doc, side)}'s lineup${complete(side) ? ', complete' : ''}`}
              testID={`lineup-team-${side}`}
            />
          </View>
        ))}
      </View>

      <View style={shared.numberCourt} testID={`lineup-court-${team}`}>
        <View style={shared.numberCourtNet}>
          <Text style={shared.numberCourtNetLabel} maxFontSizeMultiplier={1.3}>NET</Text>
        </View>
        {[FRONT_ROW, BACK_ROW].map((row, r) => (
          <View key={r} style={styles.courtRow}>
            {row.map(slot => {
              const n = lineups[team][slot]
              const isActive = active?.side === team && active.slot === slot
              return (
                <View key={slot} style={{ flex: 1 }}>
                  <CourtSpot
                    position={slot}
                    number={n}
                    name={n != null ? names[team].get(n) : undefined}
                    highlight={isActive ? TEAM_COLORS[team] : null}
                    placeholder="–"
                    onPress={() => tapSpot(team, slot)}
                    accessibilityLabel={`${teamName(doc, team)} ${SPOT_NAMES[slot]}${slot === 0 ? ', serves first' : ''}${n != null ? `: #${n}` : ', empty'}`}
                    testID={`slot-${team}-${slot}`}
                  />
                </View>
              )
            })}
          </View>
        ))}
      </View>

      {(() => {
        const side = team
        const roster = doc.setup.teams[side].players
        const color = TEAM_COLORS[side]
        const picking = active?.side === side
        return (
          <View style={[shared.card, { gap: theme.spacing.sm, borderLeftWidth: 4, borderLeftColor: color.fill }]} testID={`lineup-${side}`}>
            <Text style={shared.label}>
              {picking ? 'Tap a number to put them in, or another spot to swap' : `${teamName(doc, side)}'s players`}
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
      })()}

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
  courtRow: { flexDirection: 'row', gap: theme.spacing.xs },
})
