import React from 'react'
import { ActivityIndicator, ScrollView, TouchableOpacity, View } from 'react-native'
import { Text } from '../ui/Text'
import type { RefreshControlProps } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { theme } from '../../constants'
import { FORMAT_LABELS } from '../../constants/tournamentCopy'
import { formatCommentTime, formatPriceAmount } from '../../utils'
import { Button } from '../Button'
import type {
  Tournament, TournamentCommentWithAuthor, TournamentPrize, TournamentRules, TournamentTeam, TournamentTeamWithRoster,
} from '../../types'
import type { PendingInvite } from '../../types'
import { MiniButton } from './TournamentBits'
import { ts } from './tournamentStyles'
import { VenmoPayButton } from '../VenmoPayButton'

type Props = {
  /** Pull-to-refresh for the whole tournament page. */
  refreshControl?: React.ReactElement<RefreshControlProps>
  tournament: Tournament
  rules: TournamentRules | null
  prizes: TournamentPrize[]
  teams: TournamentTeamWithRoster[]
  myTeam: TournamentTeam | null
  invites: PendingInvite[]
  announcements: TournamentCommentWithAuthor[]
  isCreator: boolean
  registrationOpen: boolean
  withdrawing: boolean
  publishing: boolean
  /** Invite id being accepted right now, to disable its buttons. */
  acceptingInviteId: string | null
  onGoToTeams: () => void
  onWithdraw: () => void
  onRegister: () => void
  onAcceptInvite: (inviteId: string) => void
  onDeclineInvite: (inviteId: string) => void
  onAddAnnouncement: () => void
  onAddPrize: () => void
  onDeletePrize: (prizeId: string) => void
  onPublish: () => void
}

const PODIUM_COLORS = [theme.colors.medalGold, theme.colors.medalSilver, theme.colors.medalBronze]
const PODIUM_HEIGHTS = [76, 58, 44]
const MEDALS = ['🥇', '🥈', '🥉']
const PODIUM_ORDER = [1, 0, 2] // show 2nd left, 1st center, 3rd right

export function OverviewTab(p: Props) {
  const { tournament, rules, prizes, myTeam, isCreator } = p
  return (
    <ScrollView contentContainerStyle={ts.scrollContent} showsVerticalScrollIndicator={false} refreshControl={p.refreshControl}>

      {/* My team CTA card */}
      {!isCreator && myTeam && (
        <View style={{
          backgroundColor: theme.colors.primarySoft, borderRadius: 18, padding: 14, marginBottom: 12,
          borderWidth: 1.5, borderColor: theme.colors.primary,
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 }}>
              <Ionicons name="checkmark-circle" size={14} color={theme.colors.primary} />
              <Text style={{ fontFamily: theme.fonts.bodySemiBold, fontSize: theme.font.size.sm, color: theme.colors.primary }}>
                {myTeam.status === 'free_agent' ? 'Registered as Free Agent' : myTeam.status === 'waitlisted' ? 'On the waitlist' : 'Registered'}
              </Text>
            </View>
            <Text style={{ fontFamily: theme.fonts.display, fontSize: theme.font.size.lgm, letterSpacing: -0.3, color: theme.colors.text }}>{myTeam.name}</Text>
            <Text style={{ fontFamily: theme.fonts.body, fontSize: theme.font.size.xs, color: theme.colors.subtext, marginTop: 1 }}>
              {p.teams.find(t => t.id === myTeam.id)?.members.length ?? 0} players on roster
            </Text>
          </View>
          <View style={{ flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
            <TouchableOpacity
              onPress={p.onGoToTeams}
              style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: theme.colors.background }}
            >
              <Text style={{ fontFamily: theme.fonts.bodySemiBold, fontSize: theme.font.size.sm, color: theme.colors.text }}>Manage →</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={p.onWithdraw} disabled={p.withdrawing}>
              {p.withdrawing
                ? <ActivityIndicator size="small" color={theme.colors.error} />
                : <Text style={{ fontSize: theme.font.size.sm, color: theme.colors.error }}>Withdraw</Text>}
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Registration CTA (organizers can enter a team of their own too) */}
      {!myTeam && p.registrationOpen && (
        <Button label="Register Team" testID="register-team" onPress={p.onRegister} style={{ marginBottom: 12 }} />
      )}
      {!isCreator && !myTeam && !p.registrationOpen && tournament.status === 'published' && (
        <Text style={{ fontFamily: theme.fonts.body, fontSize: theme.font.size.smd, color: theme.colors.subtext, marginBottom: 12, textAlign: 'center' }}>
          Registration is closed: the deadline has passed.
        </Text>
      )}

      {/* Pay via Venmo — non-creators, when there is a fee and a handle */}
      {!isCreator && tournament.price > 0 && tournament.venmo_handle && (
        <View style={{ marginBottom: 12 }}>
          <VenmoPayButton
            handle={tournament.venmo_handle}
            amount={formatPriceAmount(tournament.price)}
            title={tournament.title}
            date={tournament.start_date}
            label={`Pay $${formatPriceAmount(tournament.price)} entry via Venmo`}
          />
        </View>
      )}

      {/* Pending invitations */}
      {p.invites.length > 0 && (
        <View style={[ts.card, { borderColor: theme.colors.accent + '44' }]}>
          <Text style={[ts.sectionTitle, { marginBottom: 10 }]}>Team Invitations</Text>
          {p.invites.map(inv => (
            <View key={inv.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderTopWidth: 1, borderTopColor: theme.colors.border }}>
              <Text style={{ flex: 1, fontSize: theme.font.size.md, color: theme.colors.text }}>Invited to <Text style={{ fontWeight: '600' }}>{inv.team_name}</Text></Text>
              <MiniButton label="Accept" tone="primary" disabled={p.acceptingInviteId === inv.id} onPress={() => p.onAcceptInvite(inv.id)} />
              <MiniButton label="Decline" tone="neutral" onPress={() => p.onDeclineInvite(inv.id)} />
            </View>
          ))}
        </View>
      )}

      {/* Announcements */}
      {(p.announcements.length > 0 || isCreator) && (
        <View style={ts.card}>
          <View style={[ts.rowBetween, { marginBottom: 10 }]}>
            <Text style={ts.sectionTitle}>📢 Announcements</Text>
            {isCreator && (
              <TouchableOpacity hitSlop={8} accessibilityLabel="Post announcement" onPress={p.onAddAnnouncement}>
                <Ionicons name="add-circle-outline" size={20} color={theme.colors.primary} />
              </TouchableOpacity>
            )}
          </View>
          {p.announcements.length === 0 ? (
            <Text style={ts.muted13}>No announcements yet.</Text>
          ) : (
            p.announcements.slice().reverse().map((ann, i) => (
              <View key={ann.id} style={{ paddingTop: i > 0 ? 10 : 0, marginTop: i > 0 ? 10 : 0, borderTopWidth: i > 0 ? 1 : 0, borderTopColor: theme.colors.border }}>
                <Text style={{ fontFamily: theme.fonts.body, fontSize: theme.font.size.smd, color: theme.colors.text, lineHeight: 20 }}>{ann.body}</Text>
                <Text style={{ fontFamily: theme.fonts.body, fontSize: theme.font.size.xs, color: theme.colors.subtext, marginTop: 3 }}>{formatCommentTime(ann.created_at)}</Text>
              </View>
            ))
          )}
        </View>
      )}

      {/* Prizes */}
      {(prizes.length > 0 || isCreator) && (
        <View style={ts.card}>
          <View style={[ts.rowBetween, { marginBottom: 12 }]}>
            <Text style={ts.sectionTitle}>Prize Pool</Text>
            {isCreator && (
              <TouchableOpacity hitSlop={8} accessibilityLabel="Add prize" onPress={p.onAddPrize}>
                <Ionicons name="add-circle-outline" size={20} color={theme.colors.primary} />
              </TouchableOpacity>
            )}
          </View>
          {prizes.length === 0 ? (
            <Text style={ts.muted13}>No prizes configured yet.</Text>
          ) : (
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
              {prizes.slice(0, 3).map((_, idx) => {
                const displayIdx = PODIUM_ORDER[idx]
                const prize = prizes[displayIdx]
                if (!prize) return null
                return (
                  <View key={prize.id} style={{ flex: 1, alignItems: 'center' }}>
                    <Text style={{ fontFamily: theme.fonts.display, fontSize: theme.font.size.md, color: theme.colors.text, marginBottom: 4 }}>{prize.amount ?? prize.place_label}</Text>
                    <View style={{
                      height: PODIUM_HEIGHTS[idx], width: '100%', borderTopLeftRadius: 8, borderTopRightRadius: 8,
                      backgroundColor: PODIUM_COLORS[displayIdx], alignItems: 'center', justifyContent: 'flex-start', paddingTop: 8,
                    }}>
                      <Text style={{ fontSize: theme.font.emoji.sm }}>{MEDALS[displayIdx]}</Text>
                    </View>
                    <View style={{ width: '100%', paddingVertical: 5, backgroundColor: theme.colors.borderSoft, borderBottomLeftRadius: 6, borderBottomRightRadius: 6, alignItems: 'center' }}>
                      <Text style={{ fontFamily: theme.fonts.bodySemiBold, fontSize: theme.font.size.xs, color: theme.colors.text }}>{prize.place_label}</Text>
                    </View>
                    {isCreator && (
                      <TouchableOpacity hitSlop={8} accessibilityLabel="Delete prize" onPress={() => p.onDeletePrize(prize.id)} style={{ marginTop: 4 }}>
                        <Ionicons name="trash-outline" size={13} color={theme.colors.subtext} />
                      </TouchableOpacity>
                    )}
                  </View>
                )
              })}
            </View>
          )}
          {prizes.length > 3 && prizes.slice(3).map(prize => (
            <View key={prize.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: theme.colors.border, marginTop: 10 }}>
              <Text style={{ fontSize: theme.font.emoji.xs }}>🏅</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: theme.fonts.bodySemiBold, fontSize: theme.font.size.smd, color: theme.colors.text }}>{prize.place_label}</Text>
                <Text style={{ fontSize: theme.font.size.sm, color: theme.colors.subtext }}>{prize.description}{prize.amount ? ` · ${prize.amount}` : ''}</Text>
              </View>
              {isCreator && (
                <TouchableOpacity hitSlop={8} accessibilityLabel="Delete prize" onPress={() => p.onDeletePrize(prize.id)}>
                  <Ionicons name="trash-outline" size={15} color={theme.colors.subtext} />
                </TouchableOpacity>
              )}
            </View>
          ))}
        </View>
      )}

      {/* Format + details grid */}
      <View style={ts.card}>
        <Text style={[ts.sectionTitle, { marginBottom: 10 }]}>Format</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {[
            { label: 'Format',    value: FORMAT_LABELS[tournament.format] ?? tournament.format },
            { label: 'Bracket',   value: tournament.bracket_type === 'double' ? 'Double elim' : 'Single elim', hide: !tournament.bracket_type },
            { label: 'Max teams', value: tournament.max_teams ? String(tournament.max_teams) : 'Unlimited' },
            { label: 'Roster',    value: `${tournament.min_roster_size}–${tournament.max_roster_size}` },
            { label: 'Entry fee', value: tournament.price > 0 ? `$${tournament.price.toFixed(2)}` : 'Free' },
            { label: 'Refs',      value: tournament.has_refs ? 'Yes' : 'No' },
          ].filter(r => !r.hide).map((row, i, arr) => (
            <View key={row.label} style={{ width: '50%', paddingVertical: 9, paddingHorizontal: 4, borderBottomWidth: i < arr.length - (arr.length % 2 === 0 ? 2 : 1) ? 1 : 0, borderBottomColor: theme.colors.borderSoft }}>
              <Text style={{ fontFamily: theme.fonts.body, fontSize: theme.font.size.xs, color: theme.colors.subtext, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>{row.label}</Text>
              <Text style={{ fontFamily: theme.fonts.display, fontSize: theme.font.size.md, color: theme.colors.text }}>{row.value}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* About */}
      {!!tournament.description && (
        <View style={ts.card}>
          <Text style={[ts.sectionTitle, { marginBottom: 8 }]}>About</Text>
          <Text style={{ fontFamily: theme.fonts.body, fontSize: theme.font.size.md, color: theme.colors.text, lineHeight: 21 }}>{tournament.description}</Text>
        </View>
      )}

      {/* Scoring rules */}
      {rules && (
        <View style={ts.card}>
          <Text style={[ts.sectionTitle, { marginBottom: 8 }]}>Scoring Rules</Text>
          {[
            { label: 'Win to',       value: `${rules.winning_score} pts` },
            { label: 'Deciding set', value: `${rules.deciding_set_score} pts` },
            { label: 'Win by',       value: `${rules.win_by_margin}` },
            { label: 'Sets to win',  value: String(rules.sets_to_win) },
            { label: 'Point cap',    value: rules.point_cap ? String(rules.point_cap) : 'None' },
          ].map((row, i, arr) => (
            <View key={row.label} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 9, paddingHorizontal: 4, borderBottomWidth: i < arr.length - 1 ? 1 : 0, borderBottomColor: theme.colors.borderSoft }}>
              <Text style={{ fontFamily: theme.fonts.body, fontSize: theme.font.size.smd, color: theme.colors.subtext }}>{row.label}</Text>
              <Text style={{ fontFamily: theme.fonts.bodyMedium, fontSize: theme.font.size.smd, color: theme.colors.text }}>{row.value}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Publish button for draft */}
      {isCreator && tournament.status === 'draft' && (
        <Button label="Publish Tournament" onPress={p.onPublish} loading={p.publishing} />
      )}
    </ScrollView>
  )
}
