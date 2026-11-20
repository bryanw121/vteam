import React, { useState } from 'react'
import { View } from 'react-native'
import { Text } from '../../ui/Text'
import { IconButton } from '../../ui'
import { Button } from '../../Button'
import { CourtQueueSetupSheet } from './CourtQueueSetupSheet'
import { shared, teamColor, teamColorName } from '../../../constants'
import { COURT_QUEUE_COPY as C } from '../../../constants/copy'
import { useCourtQueue } from '../../../hooks/event/useCourtQueue'
import {
  courtQueueOffered, moveInQueue, placeOf, recordResult, setCourtCount, startQueue, syncTeams, tally, undoLast,
} from '../../../utils/courtQueue'
import type { CourtQueueRule, CourtQueueState } from '../../../types'
import type { CourtQueueCardProps } from '../../../types/people'

const DEFAULT_RULE: CourtQueueRule = { kind: 'stay', stayMax: 3 }

function TeamName({ team }: { team: number }) {
  return (
    <View style={shared.courtTeam}>
      <View style={[shared.courtDot, { backgroundColor: teamColor(team) }]} />
      <Text style={shared.courtTeamName} numberOfLines={1}>{teamColorName(team)}</Text>
    </View>
  )
}

function ruleText(rule: CourtQueueRule): string {
  return C.ruleLabel(rule.kind === 'both_off' ? 'both_off' : rule.stayMax)
}

/** "You're on Green · up next on Court 1" for a player whose team is in the rotation. */
function YourCourtBanner({ state, team }: { state: CourtQueueState; team: number }) {
  const place = placeOf(state, team)
  if (!place) return null
  const name = teamColorName(team)
  const title = place.kind === 'court' ? C.youOnCourt(name, place.court + 1)
    : place.ahead === 0 ? C.youNext(name) : C.youWaiting(name, place.ahead)
  const playing = state.courts[0]
  return (
    <View style={shared.courtBanner} testID="court-queue-banner" accessibilityRole="summary">
      <Text style={shared.courtBannerTitle}>{title}</Text>
      {place.kind === 'queue' && playing && (
        <Text style={shared.courtBannerSub}>{C.playing(teamColorName(playing[0]), teamColorName(playing[1]))}</Text>
      )}
    </View>
  )
}

/**
 * Courts on the People tab (#333). The host or a co-host starts the queue and
 * taps who won after each game; the winner stays (up to the night's limit) or
 * both come off, and the longest-waiting teams go on. Players see it live, with
 * their own team's place on top; guests see the courts.
 */
export function CourtQueueCard({ eventId, startMs, durationMinutes, cancelled, teams, myTeam, canRun }: CourtQueueCardProps) {
  const { queue, saving, apply } = useCourtQueue(eventId)
  const [setupOpen, setSetupOpen] = useState(false)
  const offered = courtQueueOffered(startMs, durationMinutes, cancelled)
  const running = queue && !queue.ended

  if (!queue) {
    if (!canRun || !offered) return null
    return (
      <View style={[shared.card, shared.courtCard]} testID="court-queue-card">
        <Text style={shared.subheading}>{C.title}</Text>
        <Text style={shared.caption}>{teams.length >= 2 ? C.startHint : C.needsTeams}</Text>
        {teams.length >= 2 && <Button label={C.start} onPress={() => setSetupOpen(true)} testID="court-queue-start" />}
        <CourtQueueSetupSheet
          visible={setupOpen}
          onDismiss={() => setSetupOpen(false)}
          teamCount={teams.length}
          courts={1}
          rule={DEFAULT_RULE}
          saveLabel={C.start}
          onSave={(courts, rule) => {
            setSetupOpen(false)
            apply(startQueue(teams, courts), rule, { event: 'start' })
          }}
        />
      </View>
    )
  }

  const { state, rule } = queue
  // The host's next change starts from the teams as saved now (re-made teams, a team gone).
  const current = () => (teams.length >= 2 ? syncTeams(state, teams) : state)
  const host = canRun && !!running
  const minutes = Math.max(0, Math.floor((Date.now() - Date.parse(queue.updatedAt)) / 60_000))
  const records = tally(state)

  return (
    <View style={[shared.card, shared.courtCard]} testID="court-queue-card">
      {running && myTeam !== null && <YourCourtBanner state={state} team={myTeam} />}
      <View style={shared.courtHeader}>
        <Text style={shared.subheading}>{C.title} · {running ? C.live : C.ended}</Text>
        <Text style={shared.courtHeaderNote}>{canRun ? ruleText(rule) : C.updated(minutes)}</Text>
      </View>

      {running && state.courts.map((pair, i) => {
        if (!pair) return null
        const streakTeam = pair.find(t => (state.streaks[String(t)] ?? 0) > 0)
        return (
          <View key={i} style={shared.courtBox} testID={`court-${i + 1}`}>
            <View style={shared.courtRow}>
              <Text style={shared.courtLabel}>{C.court(i + 1)}</Text>
              {streakTeam !== undefined && (
                <Text style={shared.courtStreak}>{C.streak(teamColorName(streakTeam), state.streaks[String(streakTeam)])}</Text>
              )}
            </View>
            <View style={shared.courtRow}>
              <TeamName team={pair[0]} />
              <Text style={shared.courtVs}>vs</Text>
              <TeamName team={pair[1]} />
            </View>
            {host && (
              <View style={shared.courtButtons}>
                {pair.map(t => (
                  <View key={t} style={shared.courtButton}>
                    <Button
                      label={C.won(teamColorName(t))}
                      variant="secondary"
                      disabled={saving}
                      onPress={() => {
                        const base = current()
                        const at = base.courts.findIndex(p => !!p && p.includes(t))
                        if (at >= 0) apply(recordResult(base, rule, at, t), rule, { event: 'result' })
                      }}
                      testID={`court-${i + 1}-won-${t}`}
                    />
                  </View>
                ))}
              </View>
            )}
          </View>
        )
      })}

      {running && (
        <>
          <Text style={shared.courtLabel}>{C.upNext}</Text>
          {state.queue.length === 0 ? <Text style={shared.caption}>{C.nobodyWaiting}</Text> : state.queue.map((t, i) => (
            <View key={t} style={[shared.courtQueueRow, t === myTeam && shared.courtQueueRowMine]} testID={`court-queue-next-${i + 1}`}>
              <Text style={shared.courtQueuePlace}>{i + 1}</Text>
              <TeamName team={t} />
              <View style={shared.courtSpacer} />
              {t === myTeam ? <Text style={shared.courtQueueNote}>You</Text> : null}
              {host && (
                <View style={shared.courtButtons}>
                  <IconButton icon="chevron-up" size={44} label={C.moveUp(teamColorName(t))} onPress={() => apply(moveInQueue(current(), t, -1), rule)} />
                  <IconButton icon="chevron-down" size={44} label={C.moveDown(teamColorName(t))} onPress={() => apply(moveInQueue(current(), t, 1), rule)} />
                </View>
              )}
            </View>
          ))}
        </>
      )}

      {records.length > 0 && (
        <View style={shared.courtTally} testID="court-queue-tally">
          <Text style={shared.courtLabel}>{C.tonight}</Text>
          {records.map(r => (
            <View key={r.team} style={shared.courtTallyItem}>
              <View style={[shared.courtDot, { backgroundColor: teamColor(r.team) }]} />
              <Text style={shared.caption}>{teamColorName(r.team)} {C.record(r.wins, r.losses)}</Text>
            </View>
          ))}
        </View>
      )}

      {host && (
        <View style={shared.courtButtons}>
          <View style={shared.courtButton}>
            <Button label={C.undo} variant="secondary" disabled={saving || state.undo.length === 0} onPress={() => apply(undoLast(state), rule)} testID="court-queue-undo" />
          </View>
          <View style={shared.courtButton}>
            <Button label={C.rules} variant="secondary" disabled={saving} onPress={() => setSetupOpen(true)} />
          </View>
          <View style={shared.courtButton}>
            <Button label={C.end} variant="secondary" disabled={saving} onPress={() => apply(state, rule, { ended: true, event: 'end' })} testID="court-queue-end" />
          </View>
        </View>
      )}
      {canRun && !running && offered && teams.length >= 2 && (
        <Button label={C.restart} variant="secondary" onPress={() => apply(startQueue(teams, state.courts.length), rule, { event: 'start' })} testID="court-queue-restart" />
      )}

      <CourtQueueSetupSheet
        visible={setupOpen}
        onDismiss={() => setSetupOpen(false)}
        teamCount={teams.length}
        courts={state.courts.length}
        rule={rule}
        saveLabel={C.save}
        onSave={(courts, next) => {
          setSetupOpen(false)
          apply(setCourtCount(current(), courts), next)
        }}
      />
    </View>
  )
}
