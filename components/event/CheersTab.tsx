import React from 'react'
import { View, ScrollView, TouchableOpacity } from 'react-native'
import { Text } from '../ui/Text'
import { RefreshControl } from '../RefreshControl'
import { Image } from 'expo-image'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Button } from '../Button'
import { shared, theme, CHEER_TYPES, CHEERS_MAX_PER_EVENT, TEAM_COLORS, TEAM_COLOR_NAMES } from '../../constants'
import type { Profile, CheerType, Cheer, IoniconName, PendingCheer, TeamAssignment } from '../../types'
import { profileAvatarSmallUri, profileDisplayName, profileInitial } from '../../utils'
import type { EventCheersApi, EventData, EventTeamsApi } from '../../types'
import { Spinner } from '../ui/Spinner'

type CheerPersonCardProps = {
  profile: Profile
  hasGiven: boolean
  disabled: boolean
  teamColor: string | null
  onPress: () => void
}

function CheerPersonCard({ profile, hasGiven, disabled, teamColor, onPress }: CheerPersonCardProps) {
  const avatarUri = profileAvatarSmallUri(profile.avatar_url)

  const activeColor = teamColor ?? theme.colors.primary
  const initials = profileInitial(profile)
  const displayName = profileDisplayName(profile)

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      style={[
        shared.playerCardShell,
        {
          borderColor: hasGiven ? activeColor : theme.colors.border,
          backgroundColor: hasGiven ? activeColor + '12' : disabled ? theme.colors.background : theme.colors.card,
          opacity: disabled ? 0.45 : 1,
        },
      ]}
    >
      <View style={[
        shared.playerCardAvatar,
        {
          borderColor: activeColor,
          backgroundColor: activeColor + '18',
          borderWidth: hasGiven ? 2 : 1.5,
          overflow: 'hidden',
        }
      ]}>
        {avatarUri ? (
          <Image source={{ uri: avatarUri }} style={{ width: 40, height: 40 }} contentFit="cover" transition={200} />
        ) : (
          <Text style={[shared.playerCardAvatarInitial, { color: activeColor }]}>{initials}</Text>
        )}
      </View>
      <Text style={[shared.playerCardName, { color: hasGiven ? activeColor : theme.colors.text, flex: 1 }]} numberOfLines={1}>
        {displayName}
      </Text>
      {hasGiven && <Ionicons name="checkmark-circle" size={16} color={activeColor} />}
    </TouchableOpacity>
  )
}

type Props = {
  cheers: EventCheersApi
  isEventOver: boolean
  isAttending: boolean
  isOwner: boolean
  /** Attendees, viewer id and pull-to-refresh. */
  data: EventData
  /** Team colours on the person cards. */
  teams: Pick<EventTeamsApi, 'hasTeams' | 'assignments' | 'numTeams'>
  isMobileWeb: boolean
  bottomInset: number
}

/** Tab 3 of the event detail screen: give post-event cheers to other attendees. */
export function CheersTab({ cheers, isEventOver, isAttending, isOwner, data, teams, isMobileWeb, bottomInset }: Props) {
  const {
    cheersLoading, selectedCheerType, setSelectedCheerType, myCheersGiven, pendingCheers,
    cheersSent, cheerSubmitError, submittingCheers, submitCheers, resetCheers, toggleCheer,
  } = cheers
  const { refreshing, refresh: onRefresh, userId } = data
  const { attendees } = data.roster
  const { hasTeams, assignments, numTeams } = teams
  const refresh = <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />

  return (
    <View style={[shared.screen, { flex: 1 }]}>
      {!isEventOver ? (
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: theme.spacing.xl }}
          refreshControl={refresh}
        >
          <Ionicons name="time-outline" size={40} color={theme.colors.subtext} />
          <Text style={[shared.subheading, { marginTop: theme.spacing.md, textAlign: 'center' }]}>Not available yet</Text>
          <Text style={[shared.caption, { marginTop: theme.spacing.sm, textAlign: 'center' }]}>
            Cheers open after the event ends.
          </Text>
        </ScrollView>
      ) : !isAttending && !isOwner ? (
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: theme.spacing.xl }}
          refreshControl={refresh}
        >
          <Ionicons name="lock-closed-outline" size={40} color={theme.colors.subtext} />
          <Text style={[shared.subheading, { marginTop: theme.spacing.md, textAlign: 'center' }]}>Attendees only</Text>
          <Text style={[shared.caption, { marginTop: theme.spacing.sm, textAlign: 'center' }]}>
            Only people who attended this event can give cheers.
          </Text>
        </ScrollView>
      ) : cheersLoading ? (
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: theme.spacing.xl }}
          refreshControl={refresh}
        >
          <Spinner color={theme.colors.primary} />
        </ScrollView>
      ) : selectedCheerType === null ? (
        /* Step 1: Pick a cheer type */
        <ScrollView
          contentContainerStyle={[shared.scrollContent, { paddingBottom: bottomInset + theme.spacing.lg }]}
          refreshControl={refresh}
        >
          <View style={[shared.rowBetween, { marginBottom: theme.spacing.xs }]}>
            <Text style={shared.subheading}>Give Cheers</Text>
            {(myCheersGiven.length > 0 || pendingCheers.length > 0) && (
              <TouchableOpacity onPress={resetCheers} hitSlop={8}>
                <Text style={{ fontSize: theme.font.size.sm, color: theme.colors.subtext }}>Reset</Text>
              </TouchableOpacity>
            )}
          </View>
          <Text style={[shared.caption, { marginBottom: theme.spacing.lg }]}>
            {myCheersGiven.length + pendingCheers.length}/{CHEERS_MAX_PER_EVENT} selected · What do you want to recognize?
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
            {CHEER_TYPES.map(kt => {
              const submittedCount = myCheersGiven.filter(k => k.cheer_type === kt.type).length
              const pendingCount = pendingCheers.filter(p => p.cheerType === kt.type).length
              const totalCount = submittedCount + pendingCount
              const totalGiven = myCheersGiven.length + pendingCheers.length
              const atCap = totalGiven >= CHEERS_MAX_PER_EVENT && totalCount === 0
              return (
                <TouchableOpacity
                  key={kt.type}
                  onPress={() => !atCap ? setSelectedCheerType(kt.type) : null}
                  disabled={atCap}
                  style={{
                    width: '47%',
                    backgroundColor: totalCount > 0 ? theme.colors.primary + '12' : theme.colors.card,
                    borderWidth: 1.5,
                    borderColor: totalCount > 0 ? theme.colors.primary : theme.colors.border,
                    borderRadius: theme.radius.lg,
                    padding: theme.spacing.md,
                    alignItems: 'center',
                    gap: theme.spacing.xs,
                    opacity: atCap ? 0.4 : 1,
                  }}
                >
                  <Ionicons
                    name={kt.icon as IoniconName}
                    size={28}
                    color={totalCount > 0 ? theme.colors.primary : theme.colors.subtext}
                  />
                  <Text style={{
                    fontSize: theme.font.size.sm,
                    fontWeight: theme.font.weight.semibold,
                    color: totalCount > 0 ? theme.colors.primary : theme.colors.text,
                    textAlign: 'center',
                  }}>
                    {kt.label}
                  </Text>
                  {totalCount > 0 && (
                    <Text style={{ fontSize: theme.font.size.xs, color: theme.colors.primary }}>
                      {totalCount} selected
                    </Text>
                  )}
                </TouchableOpacity>
              )
            })}
          </View>
          {cheersSent ? (
            <View style={{
              marginTop: theme.spacing.lg,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: theme.spacing.sm,
              paddingVertical: theme.spacing.md,
              borderRadius: theme.radius.lg,
              backgroundColor: theme.colors.primary + '12',
              borderWidth: 1.5,
              borderColor: theme.colors.primary + '40',
            }}>
              <Ionicons name="checkmark-circle" size={20} color={theme.colors.primary} />
              <Text style={{ fontSize: theme.font.size.md, fontWeight: theme.font.weight.semibold, color: theme.colors.primary }}>
                Cheers sent!
              </Text>
            </View>
          ) : pendingCheers.length > 0 ? (
            <View style={{ marginTop: theme.spacing.lg, gap: theme.spacing.sm }}>
              {cheerSubmitError && (
                <View style={{
                  flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm,
                  paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.sm,
                  borderRadius: theme.radius.md,
                  backgroundColor: theme.colors.error + '18',
                  borderWidth: 1, borderColor: theme.colors.error + '50',
                }}>
                  <Ionicons name="alert-circle-outline" size={16} color={theme.colors.error} />
                  <Text style={{ fontSize: theme.font.size.sm, color: theme.colors.error, flex: 1 }}>
                    {cheerSubmitError}
                  </Text>
                </View>
              )}
              <Button
                label={submittingCheers ? 'Submitting…' : `Submit Cheers (${pendingCheers.length})`}
                onPress={submitCheers}
                loading={submittingCheers}
              />
            </View>
          ) : null}
        </ScrollView>
      ) : (
        /* Step 2: Pick recipients for the selected cheer type */
        <View style={{ flex: 1 }}>
          {/* Header */}
          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.sm,
            paddingHorizontal: theme.spacing.lg,
            paddingTop: theme.spacing.md,
            paddingBottom: theme.spacing.sm,
            borderBottomWidth: 1,
            borderBottomColor: theme.colors.border,
          }}>
            <TouchableOpacity onPress={() => setSelectedCheerType(null)} hitSlop={12}>
              <Ionicons name="arrow-back" size={22} color={theme.colors.text} />
            </TouchableOpacity>
            <Ionicons
              name={(CHEER_TYPES.find(k => k.type === selectedCheerType)?.icon ?? 'star-outline') as IoniconName}
              size={18}
              color={theme.colors.primary}
            />
            <Text style={[shared.subheading, { flex: 1 }]}>
              {CHEER_TYPES.find(k => k.type === selectedCheerType)?.label}
            </Text>
            <Text style={shared.caption}>
              {myCheersGiven.length + pendingCheers.length}/{CHEERS_MAX_PER_EVENT}
            </Text>
          </View>
          {myCheersGiven.length + pendingCheers.length >= CHEERS_MAX_PER_EVENT ? (
            <View style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.spacing.sm,
              marginHorizontal: theme.spacing.lg,
              marginTop: theme.spacing.sm,
              marginBottom: theme.spacing.xs,
              paddingHorizontal: theme.spacing.md,
              paddingVertical: theme.spacing.sm,
              borderRadius: theme.radius.md,
              backgroundColor: theme.colors.warning + '18',
              borderWidth: 1.5,
              borderColor: theme.colors.warning + '60',
            }}>
              <Ionicons name="warning" size={16} color={theme.colors.warning} />
              <Text style={{ fontSize: theme.font.size.sm, color: theme.colors.warning, flex: 1 }}>
                Limit reached ({CHEERS_MAX_PER_EVENT} cheers max). Deselect someone to swap.
              </Text>
            </View>
          ) : (
            <Text style={[shared.caption, { paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.sm }]}>
              Who deserves it? Tap to select or deselect.
            </Text>
          )}
          {attendees.filter(a => a.id !== userId).length === 0 ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: theme.spacing.xl }}>
              <Text style={shared.caption}>No other attendees.</Text>
            </View>
          ) : (
            <ScrollView
              contentContainerStyle={[shared.scrollContent, { paddingBottom: bottomInset + theme.spacing.lg }]}
              keyboardShouldPersistTaps="handled"
              refreshControl={refresh}
            >
              {(() => {
                const others = attendees.filter(a => a.id !== userId)
                const totalGiven = myCheersGiven.length + pendingCheers.length
                function renderCheerCard(profile: Profile, teamColor: string | null) {
                  const hasGiven = myCheersGiven.some(k => k.receiver_id === profile.id && k.cheer_type === selectedCheerType)
                    || pendingCheers.some(p => p.receiverId === profile.id && p.cheerType === selectedCheerType)
                  const atCap = totalGiven >= CHEERS_MAX_PER_EVENT && !hasGiven
                  return (
                    <View key={profile.id} style={[shared.playerCell, isMobileWeb && { width: '50%' }]}>
                      <CheerPersonCard
                        profile={profile}
                        hasGiven={hasGiven}
                        disabled={atCap}
                        teamColor={teamColor}
                        onPress={() => toggleCheer(profile.id, selectedCheerType!)}
                      />
                    </View>
                  )
                }
                if (!hasTeams) {
                  return <View style={shared.playerGrid}>{others.map(p => renderCheerCard(p, null))}</View>
                }
                const unassigned = others.filter(p => !assignments[p.id]?.team)
                return (
                  <View style={{ gap: theme.spacing.sm }}>
                    {Array.from({ length: numTeams }, (_, i) => i + 1).map(teamNum => {
                      const teamColor = TEAM_COLORS[(teamNum - 1) % TEAM_COLORS.length]
                      const members = others.filter(p => assignments[p.id]?.team === teamNum)
                      return (
                        <View key={teamNum}>
                          <View style={shared.teamHeader}>
                            <View style={[shared.teamDot, { backgroundColor: teamColor }]} />
                            <Text style={[shared.teamHeading, { color: teamColor }]}>
                              {TEAM_COLOR_NAMES[(teamNum - 1) % TEAM_COLOR_NAMES.length]} Team
                            </Text>
                          </View>
                          {members.length === 0
                            ? <Text style={[shared.caption, { paddingHorizontal: theme.spacing.xs }]}>No players</Text>
                            : <View style={shared.playerGrid}>{members.map(p => renderCheerCard(p, teamColor))}</View>
                          }
                        </View>
                      )
                    })}
                    {unassigned.length > 0 && (
                      <View>
                        <View style={shared.teamHeader}>
                          <View style={[shared.teamDot, { backgroundColor: theme.colors.subtext }]} />
                          <Text style={[shared.teamHeading, { color: theme.colors.subtext }]}>Unassigned</Text>
                        </View>
                        <View style={shared.playerGrid}>{unassigned.map(p => renderCheerCard(p, null))}</View>
                      </View>
                    )}
                  </View>
                )
              })()}
            </ScrollView>
          )}
        </View>
      )}
    </View>
  )
}
