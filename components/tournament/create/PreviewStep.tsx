import React from 'react'
import { View, ScrollView, TouchableOpacity } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Text } from '../../ui/Text'
import { theme, shared } from '../../../constants'
import { TIEBREAKER_LABELS } from '../../../constants/tournamentCopy'
import { Spinner } from '../../ui/Spinner'
import { TOURNAMENT_FORMAT_LABELS } from '../../../utils/tournamentDraft'
import { PreviewRow } from './CreateBits'
import type { TournamentPreviewStepProps } from '../../../types'
import { formatDate } from '../../../utils/dateFormat'

/** Wizard step 5: how the tournament will look, then Publish or Save as Draft. */
export function PreviewStep({ draft, clubs, onSaveDraft, onPublish, saving }: TournamentPreviewStepProps) {
  const club = clubs.find(c => c.id === draft.clubId)
  const fmtDate = (d: Date | null) => d ? formatDate(d, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20 }} showsVerticalScrollIndicator={false}>
      {/* Banner card */}
      <View style={{
        backgroundColor: theme.colors.primary, borderRadius: 20, padding: 20, marginBottom: 20,
        position: 'relative', overflow: 'hidden',
      }}>
        <View pointerEvents="none" style={{ position: 'absolute', right: -10, top: -20 }}>
          <Text style={{ fontSize: theme.font.watermark.lg, opacity: 0.12 }}>🏆</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
          <View style={{ paddingHorizontal: 9, paddingVertical: 4, borderRadius: theme.radius.full, backgroundColor: theme.colors.accent }}>
            <Text style={{ fontFamily: theme.fonts.bodySemiBold, fontSize: theme.font.size.xs, color: theme.colors.accentInk }}>
              {draft.startDate ? fmtDate(draft.startDate) : 'Date TBD'}
            </Text>
          </View>
          <View style={{ paddingHorizontal: 9, paddingVertical: 4, borderRadius: theme.radius.full, borderWidth: 1, borderColor: theme.colors.onPrimaryLine }}>
            <Text style={{ fontFamily: theme.fonts.bodySemiBold, fontSize: theme.font.size.xs, color: theme.colors.onPrimaryStrong }}>
              🏆 {TOURNAMENT_FORMAT_LABELS[draft.format]}
            </Text>
          </View>
        </View>
        <Text style={{ fontFamily: theme.fonts.display, fontWeight: '700', fontSize: theme.font.size.xl, letterSpacing: -0.6, color: theme.colors.onPrimary, lineHeight: 28 }}>
          {draft.title || 'Untitled Tournament'}
        </Text>
        {draft.location ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 }}>
            <Ionicons name="location-outline" size={12} color={theme.colors.onPrimaryMuted} />
            <Text style={{ fontFamily: theme.fonts.body, fontSize: theme.font.size.sm, color: theme.colors.onPrimaryMuted }}>{draft.location}</Text>
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
          <View style={{ paddingHorizontal: 9, paddingVertical: 4, borderRadius: theme.radius.full, backgroundColor: theme.colors.onPrimaryFill }}>
            <Text style={{ fontFamily: theme.fonts.body, fontSize: theme.font.size.xs, color: theme.colors.onPrimarySoft }}>
              {draft.price > 0 ? `$${draft.price} entry${draft.teamMode === 'solo' ? ' each' : ''}` : 'Free entry'}
            </Text>
          </View>
          <View style={{ paddingHorizontal: 9, paddingVertical: 4, borderRadius: theme.radius.full, backgroundColor: theme.colors.onPrimaryFill }}>
            <Text style={{ fontFamily: theme.fonts.body, fontSize: theme.font.size.xs, color: theme.colors.onPrimarySoft }}>
              {draft.teamMode === 'solo' ? `Solo sign-up · teams of ${draft.teamSize}` : draft.maxTeams ? `Up to ${draft.maxTeams} teams` : 'Unlimited teams'}
            </Text>
          </View>
        </View>
      </View>

      {/* Details */}
      <View style={[shared.card, { marginBottom: 16 }]}>
        <PreviewRow icon="people-outline"      label="Club"               value={club?.name ?? '—'} />
        <PreviewRow icon="calendar-outline"    label="Registration closes" value={fmtDate(draft.registrationDeadline)} />
        <PreviewRow icon="git-network-outline" label="Bracket"            value={draft.bracketType === 'double' ? 'Double elimination' : 'Single elimination'} />
        {draft.teamMode === 'solo'
          ? <PreviewRow icon="shuffle-outline" label="Teams" value={`You make teams of ${draft.teamSize} from solo sign-ups`} />
          : <PreviewRow icon="people-outline"  label="Roster size" value={`${draft.minRosterSize}–${draft.maxRosterSize} players`} />}
        <PreviewRow icon="flag-outline"        label="Refs"               value={draft.hasRefs ? 'Rotation enabled' : 'No refs'} />
      </View>

      <View style={[shared.card, { marginBottom: 24 }]}>
        <Text style={{ fontFamily: theme.fonts.bodySemiBold, fontSize: theme.font.size.xs, letterSpacing: 1, textTransform: 'uppercase', color: theme.colors.subtext, marginBottom: 8 }}>Scoring Rules</Text>
        <PreviewRow icon="remove-outline"       label="Starting score"  value={`${draft.startingScore}–${draft.startingScore}`} />
        <PreviewRow icon="flag-outline"         label="Win a set"       value={`${draft.winningScore} pts (win by ${draft.winByMargin})`} />
        <PreviewRow icon="star-outline"         label="Deciding set"    value={`${draft.decidingSetScore} pts`} />
        <PreviewRow icon="trophy-outline"       label="Match format"    value={`Best of ${draft.setsToWin * 2 - 1}`} />
        <PreviewRow icon="podium-outline"       label="Tiebreakers"     value={draft.tiebreakers.map(k => TIEBREAKER_LABELS[k]).join(' → ')} />
        {draft.pointCap !== null && (
          <PreviewRow icon="close-circle-outline" label="Point cap"     value={`${draft.pointCap} pts`} />
        )}
      </View>

      {/* Action buttons */}
      <View style={{ gap: 10 }}>
        <TouchableOpacity
          onPress={onPublish}
          disabled={saving}
          style={{ backgroundColor: theme.colors.primary, borderRadius: 14, padding: 16, alignItems: 'center' }}
        >
          {saving
            ? <Spinner color={theme.colors.onPrimary} />
            : <Text style={{ fontFamily: theme.fonts.displaySemiBold, fontSize: theme.font.size.lgs, color: theme.colors.onPrimary }}>Publish Tournament</Text>
          }
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onSaveDraft}
          disabled={saving}
          style={{ backgroundColor: theme.colors.card, borderRadius: 14, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: theme.colors.border }}
        >
          <Text style={{ fontFamily: theme.fonts.bodyMedium, fontSize: theme.font.size.lgs, color: theme.colors.text }}>Save as Draft</Text>
        </TouchableOpacity>
        <Text style={{ fontFamily: theme.fonts.body, fontSize: theme.font.size.sm, color: theme.colors.subtext, textAlign: 'center', paddingHorizontal: 20 }}>
          Drafts are only visible to you. You can publish any time from the tournament page.
        </Text>
      </View>
    </ScrollView>
  )
}
