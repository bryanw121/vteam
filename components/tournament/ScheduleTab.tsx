import React, { useState } from 'react'
import { ScrollView, TouchableOpacity, View } from 'react-native'
import { Text } from '../ui/Text'
import type { RefreshControlProps } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { shared, theme } from '../../constants'
import { Button } from '../Button'
import type { Tournament, TournamentTeam, TournamentTeamWithRoster } from '../../types'
import type { ScheduleConfig, TournamentMatchRow } from '../../types'
import { MatchEditForm } from './MatchEditForm'
import { ScheduleConfigForm } from './ScheduleConfigForm'
import { ScheduleSectionLabel } from './TournamentBits'
import { ts } from './tournamentStyles'
import { Spinner } from '../ui/Spinner'

type Props = {
  /** Pull-to-refresh for the whole tournament page. */
  refreshControl?: React.ReactElement<RefreshControlProps>
  tournament: Tournament
  teams: TournamentTeamWithRoster[]
  matches: TournamentMatchRow[]
  matchesLoading: boolean
  matchesError: boolean
  onRetryMatches: () => void
  myTeam: TournamentTeam | null
  isCreator: boolean
  config: ScheduleConfig
  onConfigChange: (config: ScheduleConfig) => void
  generating: boolean
  /** Resolves true when the schedule was replaced. */
  onGenerate: () => Promise<boolean>
  publishing: boolean
  onPublishSchedule: () => void
  savingMatch: boolean
  /** Resolves true when saved. */
  onSaveMatch: (matchId: string, scheduledAt: string, court: string, teamAId: string | null, teamBId: string | null) => Promise<boolean>
  /** Pool display name by pool id. */
  poolName: (poolId: string | null) => string | null
  /** Organizer: open result entry for a match with both teams known. */
  onRecordResult: (match: TournamentMatchRow) => void
}

function NotPublished({ text }: { text: string }) {
  return (
    <View style={ts.centeredEmpty}>
      <Ionicons name="calendar-outline" size={40} color={theme.colors.border} />
      <Text style={ts.emptyCaption}>{text}</Text>
    </View>
  )
}

/** "2-1" in sets for a finished match, "W" / "L" style fallback when no scores were kept. */
function setsWonLabel(m: TournamentMatchRow): string {
  if (m.status === 'forfeit') return 'FF'
  if (m.sets.length === 0) return 'Final'
  const a = m.sets.filter(s => s.team_a_score > s.team_b_score).length
  return `${a}-${m.sets.length - a}`
}

function timeLabel(iso: string | null): string | null {
  return iso ? new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : null
}

export function ScheduleTab(p: Props) {
  const { tournament, teams, matches, myTeam, isCreator } = p
  const [editingMatchId, setEditingMatchId] = useState<string | null>(null)
  const [editingConfig, setEditingConfig] = useState(false)
  const registeredCount = teams.filter(t => t.status === 'registered').length

  const teamName = (id: string | null) => teams.find(t => t.id === id)?.name ?? 'TBD'
  const generateHint = tournament.format === 'bracket'
    ? 'Builds the elimination bracket from your seeds (Teams tab). Top seeds get any byes.'
    : 'Deals teams into pools by seed and packs round-robin matches onto your courts, with breaks and ref duty. You can edit individual matches after generating.'

  function matchLabel(m: TournamentMatchRow): string {
    if (m.stage === 'bracket') return m.bracket_round_name ?? 'Bracket'
    const pool = m.stage === 'pool_play' ? p.poolName(m.pool_id) : null
    return pool ? `${pool} · Match ${m.match_number}` : `Match ${m.match_number}`
  }

  function renderMatch(match: TournamentMatchRow, prev: TournamentMatchRow | undefined) {
    const isEditing = editingMatchId === match.id
    const isMyMatch = !!myTeam && (match.team_a_id === myTeam.id || match.team_b_id === myTeam.id)
    const isLive = match.status === 'in_progress'
    const isDone = !!match.winner_id && (match.status === 'completed' || match.status === 'forfeit')
    const isMyRef = !!myTeam && match.ref_team_id === myTeam.id
    // true = won, false = lost, null = not decided (or not in this match).
    const wonBy = (id: string | null): boolean | null => (isDone && id ? match.winner_id === id : null)
    const timeStr = timeLabel(match.scheduled_at)
    const showTimeHeader = !!timeStr && timeStr !== timeLabel(prev?.scheduled_at ?? null)

    return (
      <React.Fragment key={match.id}>
        {showTimeHeader && (
          <Text style={{ fontFamily: theme.fonts.display, fontSize: theme.font.size.smd, color: theme.colors.text, paddingVertical: 10, paddingHorizontal: 2, letterSpacing: -0.2 }}>{timeStr}</Text>
        )}
        <View style={{
          backgroundColor: isMyMatch ? theme.colors.primarySoft : theme.colors.card,
          borderRadius: 16, padding: 12, marginBottom: 8,
          borderWidth: 1.5,
          borderColor: isMyMatch ? theme.colors.primary : theme.colors.border,
          overflow: 'hidden', position: 'relative',
        }}>
          {isLive && (
            <View style={{ position: 'absolute', top: 9, right: 10, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: theme.colors.hot }} />
              <Text style={{ fontFamily: theme.fonts.bodySemiBold, fontSize: theme.font.size.xs, color: theme.colors.hot, letterSpacing: 0.5 }}>LIVE</Text>
            </View>
          )}
          {!isEditing && (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5, backgroundColor: theme.colors.border }}>
                  <Text style={{ fontFamily: theme.fonts.body, fontSize: theme.font.size.xs, color: theme.colors.subtext }}>
                    {matchLabel(match)}
                  </Text>
                </View>
                {match.court && (
                  <Text style={{ fontFamily: theme.fonts.body, fontSize: theme.font.size.xs, color: theme.colors.subtext }}>{match.court}</Text>
                )}
                {isCreator && (
                  <TouchableOpacity hitSlop={8} accessibilityLabel="Edit match" onPress={() => setEditingMatchId(match.id)} style={{ marginLeft: 'auto' }}>
                    <Ionicons name="pencil-outline" size={14} color={theme.colors.subtext} />
                  </TouchableOpacity>
                )}
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ flex: 1, fontFamily: theme.fonts.display, fontSize: theme.font.size.md, color: wonBy(match.team_a_id) === false ? theme.colors.subtext : theme.colors.text, letterSpacing: -0.2 }}>
                  {teamName(match.team_a_id)}
                </Text>
                <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: isDone ? theme.colors.border : 'transparent', minWidth: 40, alignItems: 'center' }}>
                  <Text style={{ fontFamily: theme.fonts.display, fontSize: theme.font.size.smd, color: isDone ? theme.colors.text : theme.colors.subtext, letterSpacing: -0.3 }}>
                    {isDone ? setsWonLabel(match) : 'vs'}
                  </Text>
                </View>
                <Text style={{ flex: 1, fontFamily: theme.fonts.display, fontSize: theme.font.size.md, color: wonBy(match.team_b_id) === false ? theme.colors.subtext : theme.colors.text, letterSpacing: -0.2, textAlign: 'right' }}>
                  {teamName(match.team_b_id)}
                </Text>
              </View>
              {isDone && match.sets.length > 0 && (
                <Text style={{ fontFamily: theme.fonts.body, fontSize: theme.font.size.xs, color: theme.colors.subtext, textAlign: 'center', marginTop: 4 }}>
                  {match.sets.map(s => `${s.team_a_score}-${s.team_b_score}`).join(' · ')}
                </Text>
              )}
              {!!match.ref_team_id && (
                <Text style={{ fontFamily: theme.fonts.body, fontSize: theme.font.size.xs, color: isMyRef ? theme.colors.primary : theme.colors.subtext, marginTop: 6 }}>
                  {isMyRef ? 'Your team refs this match' : `Ref: ${teamName(match.ref_team_id)}`}
                </Text>
              )}
              {isCreator && !!match.team_a_id && !!match.team_b_id && (
                <View style={{ marginTop: 10 }}>
                  <Button
                    label={isDone ? 'Edit result' : 'Record result'}
                    icon={isDone ? 'create-outline' : 'checkmark-done-outline'}
                    variant="secondary"
                    size="touch"
                    onPress={() => p.onRecordResult(match)}
                    testID={`record-result-${match.id}`}
                  />
                </View>
              )}
            </>
          )}
          {isEditing && (
            <MatchEditForm
              match={match}
              teams={teams.filter(t => t.status === 'registered')}
              saving={p.savingMatch}
              onSave={async (scheduledAt, court, aId, bId) => {
                if (await p.onSaveMatch(match.id, scheduledAt, court, aId, bId)) setEditingMatchId(null)
              }}
              onCancel={() => setEditingMatchId(null)}
            />
          )}
        </View>
      </React.Fragment>
    )
  }

  function renderMatchList(list: TournamentMatchRow[]) {
    return list.map((m, i) => renderMatch(m, list[i - 1]))
  }

  function renderMatches() {
    if (p.matchesLoading && matches.length === 0) {
      return <View style={{ paddingVertical: 32 }}><Spinner color={theme.colors.primary} /></View>
    }
    if (p.matchesError && matches.length === 0) {
      return (
        <View style={[shared.screenStateCenter, { flex: 0, paddingVertical: 32 }]}>
          <Text style={[shared.caption, shared.emptyStateBody]}>Couldn't load the schedule.</Text>
          <Button label="Retry" variant="secondary" size="sm" fullWidth={false} onPress={p.onRetryMatches} />
        </View>
      )
    }
    const poolMatches = matches.filter(m => m.stage === 'pool_play')
    const bracketMatches = matches.filter(m => m.stage !== 'pool_play')
    const showHeaders = poolMatches.length > 0 && bracketMatches.length > 0
    return (
      <>
        {showHeaders && <ScheduleSectionLabel title="Pool Play" count={poolMatches.length} />}
        {renderMatchList(poolMatches)}
        {showHeaders && <ScheduleSectionLabel title="Bracket" count={bracketMatches.length} />}
        {renderMatchList(bracketMatches)}
      </>
    )
  }

  // ── Not generated yet ──
  if (!tournament.schedule_generated_at) {
    return (
      <ScrollView contentContainerStyle={ts.scrollContent} showsVerticalScrollIndicator={false} refreshControl={p.refreshControl}>
        {isCreator ? (
          <View style={[shared.card, { gap: 16 }]}>
            <Text style={{ fontFamily: theme.fonts.displaySemiBold, fontSize: theme.font.size.base, color: theme.colors.text }}>Generate Schedule</Text>
            <Text style={ts.muted13}>{generateHint}</Text>
            <ScheduleConfigForm
              format={tournament.format}
              config={p.config}
              onChange={p.onConfigChange}
              submitLabel="Generate Schedule"
              busy={p.generating}
              disabled={registeredCount < 2}
              onSubmit={() => { void p.onGenerate() }}
            />
            {registeredCount < 2 && (
              <Text style={{ fontSize: theme.font.size.sm, color: theme.colors.subtext, textAlign: 'center' }}>Need at least 2 registered teams.</Text>
            )}
          </View>
        ) : (
          <NotPublished text="The schedule hasn't been published yet." />
        )}
      </ScrollView>
    )
  }

  // ── Generated ──
  return (
    <ScrollView contentContainerStyle={ts.scrollContent} showsVerticalScrollIndicator={false} refreshControl={p.refreshControl}>
      {isCreator && !tournament.schedule_published && (
        editingConfig ? (
          <View style={[shared.card, { gap: 16, marginBottom: 16 }]}>
            <View style={ts.rowBetween}>
              <Text style={{ fontFamily: theme.fonts.displaySemiBold, fontSize: theme.font.size.base, color: theme.colors.text }}>Regenerate Schedule</Text>
              <TouchableOpacity hitSlop={8} accessibilityLabel="Close" onPress={() => setEditingConfig(false)}>
                <Ionicons name="close" size={20} color={theme.colors.subtext} />
              </TouchableOpacity>
            </View>
            <Text style={ts.muted13}>This will replace the existing schedule, including any results.</Text>
            <ScheduleConfigForm
              format={tournament.format}
              config={p.config}
              onChange={p.onConfigChange}
              submitLabel="Regenerate Schedule"
              busy={p.generating}
              onSubmit={async () => { if (await p.onGenerate()) setEditingConfig(false) }}
            />
          </View>
        ) : (
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
            <View style={{ flex: 1 }}>
              <Button label="Change Settings" icon="settings-outline" variant="secondary" onPress={() => setEditingConfig(true)} />
            </View>
            <View style={{ flex: 1 }}>
              <Button label="Publish Schedule" onPress={p.onPublishSchedule} loading={p.publishing} />
            </View>
          </View>
        )
      )}

      {!tournament.schedule_published && !isCreator && <NotPublished text="Schedule not yet published." />}

      {(tournament.schedule_published || isCreator) && renderMatches()}
    </ScrollView>
  )
}
