import React, { useMemo } from 'react'
import { TouchableOpacity, View } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Text } from '../../ui/Text'
import { Button } from '../../Button'
import { Chip } from '../../ui'
import { shared, theme, SKILL_LEVEL_LABELS, teamColor, teamColorName, teamTint } from '../../../constants'
import { TEAM_MODE_COPY } from '../../../constants/copy'
import { rosterHasLevels, teamSummary } from '../../../hooks/event/derive'
import { GuestRosterCell, PlayerRosterCell } from './RosterCard'
import type { BalancePlayer, EventGuest, Profile } from '../../../types'
import type { RosterCardContext, TeamBoardProps } from '../../../types/people'

/** The most teams the stepper offers: 6 colours, and never more teams than players. */
function maxTeams(players: number): number { return Math.min(6, players) }

function Cards({ players, guests, ctx }: { players: Profile[]; guests: EventGuest[]; ctx: RosterCardContext }) {
  return (
    <View style={shared.playerGrid}>
      {players.map(p => <PlayerRosterCell key={p.id} profile={p} ctx={ctx} />)}
      {guests.map(g => <GuestRosterCell key={g.id} guest={g} ctx={ctx} />)}
    </View>
  )
}

/**
 * Going + teams (#332): the count, the host's team stepper and mode chips,
 * every player and +1 as a draggable card in its team's drop zone, and the
 * host's Reset / Shuffle / Save.
 */
export function TeamBoard({ event, eventStatus, attendees, guests, teams, card, paidCount }: TeamBoardProps) {
  const { assignments, numTeams, setNumTeams, hasTeams, savingTeams, mode, setMode, balancePlayers } = teams
  const { hoveredTeamKey, teamZoneRefs } = card.drag
  const balanceById = useMemo(() => new Map(balancePlayers.map(p => [p.id, p])), [balancePlayers])
  const showAverages = useMemo(() => rosterHasLevels(balancePlayers), [balancePlayers])
  const owner = eventStatus.isOwner && attendees.length > 0
  const playerCount = attendees.length + guests.length
  const top = maxTeams(playerCount)

  const unassignedZone = (players: Profile[], gs: EventGuest[], heading: boolean) => (
    <View
      ref={(r) => { teamZoneRefs.current['unassigned'] = r }}
      style={[shared.peopleDropZone, hoveredTeamKey === 'unassigned' && shared.peopleDropZoneActive]}
    >
      {heading && (
        <View style={shared.teamHeader}>
          <View style={[shared.teamDot, { backgroundColor: theme.colors.subtext }]} />
          <Text style={[shared.teamHeading, { color: theme.colors.subtext }]}>Unassigned</Text>
        </View>
      )}
      <Cards players={players} guests={gs} ctx={card} />
    </View>
  )

  function teamZone(n: number) {
    const players = attendees.filter(p => assignments[p.id]?.team === n)
    const gs = guests.filter(g => assignments[g.id]?.team === n)
    const color = teamColor(n)
    const summary = teamSummary(
      [...players, ...gs].map(x => balanceById.get(x.id)).filter((x): x is BalancePlayer => !!x),
      showAverages,
    )
    return (
      <View
        key={n}
        ref={(r) => { teamZoneRefs.current[String(n)] = r }}
        style={[shared.peopleDropZone, hoveredTeamKey === String(n) && { backgroundColor: teamTint(color, 'zone'), borderColor: teamTint(color, 'zoneLine') }]}
      >
        <View style={shared.teamHeader}>
          <View style={[shared.teamDot, { backgroundColor: color }]} />
          <Text style={[shared.teamHeading, { color }]}>{teamColorName(n)} Team</Text>
          <View style={shared.peopleTeamChips} testID={`team-summary-${n}`}>
            {summary.avgLevel && <Text style={shared.teamSummaryChip}>{TEAM_MODE_COPY.average(SKILL_LEVEL_LABELS[summary.avgLevel])}</Text>}
            {summary.setters > 0 && (
              <Text style={[shared.teamSummaryChip, shared.teamSummaryChipSetter]}>{TEAM_MODE_COPY.setters(summary.setters)}</Text>
            )}
          </View>
        </View>
        {players.length === 0 && gs.length === 0
          ? <Text style={[shared.caption, shared.peopleTeamEmpty]}>No players</Text>
          : <Cards players={players} guests={gs} ctx={card} />}
      </View>
    )
  }

  function board() {
    if (playerCount === 0) return <Text style={shared.caption}>no one yet — be the first!</Text>
    if (!hasTeams) return unassignedZone(attendees, guests, false)
    const unassigned = attendees.filter(p => !assignments[p.id]?.team)
    const unassignedGuests = guests.filter(g => !assignments[g.id]?.team)
    return (
      <View style={shared.peopleTeams}>
        {Array.from({ length: numTeams }, (_, i) => teamZone(i + 1))}
        {(unassigned.length > 0 || unassignedGuests.length > 0) && unassignedZone(unassigned, unassignedGuests, true)}
      </View>
    )
  }

  return (
    <>
      <View style={[shared.rowBetween, shared.mb_sm]}>
        <Text style={shared.subheading}>Going</Text>
        <View style={shared.peopleHeaderRight}>
          <Text style={shared.caption}>
            {eventStatus.count}{event.max_attendees ? ` / ${event.max_attendees}` : ''} people
          </Text>
          {owner && (
            <View style={shared.peopleStepper}>
              <TouchableOpacity
                style={[shared.peopleStepBtn, numTeams <= 2 && shared.peopleStepBtnDisabled]}
                onPress={() => setNumTeams(t => Math.max(2, t - 1))}
                disabled={numTeams <= 2}
              >
                <Text style={shared.peopleStepBtnText}>−</Text>
              </TouchableOpacity>
              <Text style={shared.peopleStepLabel}>{numTeams} teams</Text>
              <TouchableOpacity
                style={[shared.peopleStepBtn, numTeams >= top && shared.peopleStepBtnDisabled]}
                onPress={() => setNumTeams(t => Math.min(top, t + 1))}
                disabled={numTeams >= top}
              >
                <Text style={shared.peopleStepBtnText}>+</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>

      {owner && (
        <View role="radiogroup" aria-label={TEAM_MODE_COPY.groupLabel} style={shared.peopleModeRow}>
          <Chip role="radio" label={TEAM_MODE_COPY.random} active={mode === 'random'} onPress={() => setMode('random')} testID="team-mode-random" />
          <Chip role="radio" label={TEAM_MODE_COPY.balanced} active={mode === 'balanced'} onPress={() => setMode('balanced')} testID="team-mode-balanced" />
        </View>
      )}

      {paidCount !== null && attendees.length > 0 && (
        <View testID="roster-paid-summary" style={shared.peoplePaidSummary}>
          <Ionicons name="cash-outline" size={14} color={theme.colors.subtext} />
          <Text style={shared.caption}>
            {paidCount} of {attendees.length} marked paid
            {guests.length > 0 ? ' · +1 guests are covered by whoever added them' : ''}
          </Text>
        </View>
      )}

      {board()}

      {owner && (
        <>
          {playerCount % numTeams !== 0 && (
            <Text style={[shared.caption, shared.peopleSplitWarning]}>
              {playerCount} players can't be split into {numTeams} equal teams
            </Text>
          )}
          <View style={shared.peopleTeamActions}>
            <View style={shared.peopleTeamAction}>
              <Button label="Reset" onPress={teams.resetTeams} variant="secondary" />
            </View>
            <View style={shared.peopleTeamAction}>
              <Button
                label={mode === 'balanced' ? TEAM_MODE_COPY.balanceButton : TEAM_MODE_COPY.randomButton}
                onPress={teams.randomizeTeams}
                variant="secondary"
                testID="team-shuffle"
              />
            </View>
            <View style={shared.peopleTeamAction}>
              <Button label="Save" onPress={teams.saveTeams} loading={savingTeams} />
            </View>
          </View>
        </>
      )}
    </>
  )
}
