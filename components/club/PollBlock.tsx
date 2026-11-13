import React, { useState } from 'react'
import { TouchableOpacity, View } from 'react-native'
import { useRouter } from 'expo-router'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Text } from '../ui/Text'
import { BottomSheet } from '../ui'
import { shared, theme } from '../../constants'
import { useClubPollActions } from '../../hooks/useClubPollActions'
import { useNow } from '../../hooks/useNow'
import { nextPicks, tallyPoll, winningTimeOptions } from '../../utils/clubPoll'
import { routes } from '../../utils/routes'
import type { ClubPollOption, PollBlockProps } from '../../types'

/**
 * A club poll inside its post (#175): one row per option with the count and a
 * bar; members tap to vote (single choice replaces, multi toggles) until it
 * closes. Closed: the winner(s); a closed time poll gives owners "Create event
 * for <time>", and once that event exists everyone gets "Game posted".
 */
export function PollBlock({ postId, clubId, poll, question, currentUserId, isOwner, memberName }: PollBlockProps) {
  const router = useRouter()
  const now = useNow(60_000)
  const { vote } = useClubPollActions(clubId)
  const [voters, setVoters] = useState<ClubPollOption | null>(null)
  const tally = tallyPoll(poll, currentUserId, now)
  const canVote = !!currentUserId && !tally.closed

  const status = tally.closed
    ? 'Closed'
    : poll.closes_at ? `Closes ${new Date(poll.closes_at).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' })}` : 'Open'

  return (
    <View style={shared.pollBlock} testID={`poll-${postId}`}>
      <View style={shared.pollMetaRow}>
        <Text style={shared.pollTag}>Poll</Text>
        <Text style={shared.caption}>
          {status} · {tally.voters === 1 ? '1 vote' : `${tally.voters} votes`}{poll.multi && !tally.closed ? ' · pick any' : ''}
        </Text>
      </View>
      <View role={poll.multi ? 'group' : 'radiogroup'} aria-label={question}>
        {tally.options.map(t => (
          <View key={t.option.id} style={shared.pollRowWrap}>
            <TouchableOpacity
              disabled={!canVote}
              onPress={() => vote(postId, nextPicks(tally.myOptionIds, t.option.id, poll.multi))}
              role={poll.multi ? 'checkbox' : 'radio'}
              aria-checked={t.mine}
              aria-disabled={!canVote}
              accessibilityLabel={`${t.option.label}, ${t.count === 1 ? '1 vote' : `${t.count} votes`}${t.winner ? ', winner' : ''}`}
              style={[shared.pollRow, t.mine && shared.pollRowMine, t.winner && shared.pollRowWinner]}
              testID={`poll-option-${t.option.position}`}
            >
              <View style={[shared.pollBar, { width: `${Math.round(t.share * 100)}%` }]} />
              <Ionicons
                name={t.mine ? (poll.multi ? 'checkbox' : 'radio-button-on') : (poll.multi ? 'square-outline' : 'radio-button-off')}
                size={18}
                color={t.mine ? theme.colors.primary : theme.colors.subtext}
              />
              <Text style={[shared.body, { flex: 1 }]} numberOfLines={2}>{t.option.label}</Text>
              {t.winner ? <Ionicons name="trophy" size={14} color={theme.colors.medalGold} accessibilityLabel="Winner" /> : null}
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setVoters(t.option)}
              disabled={t.count === 0}
              style={shared.pollCount}
              accessibilityRole="button"
              accessibilityLabel={`Who picked ${t.option.label}`}
            >
              <Text style={shared.captionStrong}>{t.count}</Text>
            </TouchableOpacity>
          </View>
        ))}
      </View>

      {poll.event_id ? (
        <TouchableOpacity onPress={() => router.push(routes.event(poll.event_id as string))} style={shared.pollAction} accessibilityRole="link" testID="poll-event-link">
          <Text style={shared.emptyStateAction}>Game posted →</Text>
        </TouchableOpacity>
      ) : isOwner && tally.closed && poll.kind === 'time' ? (
        winningTimeOptions(tally).map(o => (
          <TouchableOpacity
            key={o.id}
            onPress={() => router.push(routes.host({ clubId, date: o.starts_at ?? undefined, title: question, pollId: postId }))}
            style={[shared.buttonBase, shared.buttonPrimary, { marginTop: theme.spacing.sm }]}
            accessibilityRole="button"
            testID="poll-create-event"
          >
            <Text style={shared.buttonLabelPrimary}>Create event for {o.label}</Text>
          </TouchableOpacity>
        ))
      ) : null}

      <BottomSheet visible={!!voters} onDismiss={() => setVoters(null)} title={voters ? `Picked ${voters.label}` : undefined}>
        <Text style={shared.caption}>
          {voters ? (voters.club_poll_votes.length === 1 ? '1 member' : `${voters.club_poll_votes.length} members`) : ''}
        </Text>
        {voters?.club_poll_votes.map(v => (
          <Text key={v.user_id} style={[shared.body, { paddingVertical: theme.spacing.xs }]}>{memberName(v.user_id)}</Text>
        ))}
      </BottomSheet>
    </View>
  )
}
