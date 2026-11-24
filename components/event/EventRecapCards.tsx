import React from 'react'
import { View } from 'react-native'
import { EventCard } from '../EventCard'
import { Text } from '../ui/Text'
import { YourGameCard } from './YourGameCard'
import { eventDateMs } from '../../hooks/event/derive'
import { pointsLine } from '../../utils/recap'
import { shared, theme } from '../../constants'
import type { EventRecapApi, EventWithDetails } from '../../types'

type Props = {
  event: EventWithDetails
  userId: string | null
  recap: EventRecapApi
}

/** Top of a finished game's Details (#227): "Your game" for players who attended, then the host's next game. */
export function EventRecapCards({ event, userId, recap }: Props) {
  const host = event.profiles ?? null
  const next = recap.hostNext.data
  return (
    <>
      {recap.attended ? (
        <YourGameCard
          points={recap.points}
          pointsLine={pointsLine(recap.points, eventDateMs(event.event_date) + (event.duration_minutes ?? 120) * 60_000, recap.recap.data?.pointsPaid != null, Date.now())}
          cheers={recap.recap.data?.cheers ?? 0}
          gamesThisYear={recap.recap.data?.gamesThisYear ?? 1}
          onShare={() => { void recap.share() }}
          sharing={recap.sharing}
        />
      ) : null}
      {next && next.id !== event.id ? (
        <View style={{ marginBottom: theme.spacing.md }} testID="host-next-game">
          <Text style={[shared.subheading, { marginBottom: theme.spacing.sm }]}>{host?.first_name ? `${host.first_name} plays again` : 'The host plays again'}</Text>
          <EventCard event={next} currentUserId={userId ?? undefined} />
        </View>
      ) : null}
    </>
  )
}
