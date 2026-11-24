import React from 'react'
import { View } from 'react-native'
import { shared, theme } from '../../constants'
import { eventDateMs } from '../../hooks/event/derive'
import type { useEventRecap } from '../../hooks/event/useEventRecap'
import type { EventWithDetails } from '../../types'
import { pointsLine } from '../../utils/recap'
import { EventCard } from '../EventCard'
import { Text } from '../ui/Text'
import { YourGameCard } from './YourGameCard'

type Props = {
  event: EventWithDetails
  userId: string | null
  recap: ReturnType<typeof useEventRecap>
}

/** On a finished game's Details (#227): "Your game" for players who were there, and the host's next game for everyone. */
export function RecapCards({ event, userId, recap }: Props) {
  const host = event.profiles ?? null
  return (
    <>
      {recap.attended ? (
        <YourGameCard
          points={recap.points}
          pointsLine={pointsLine(recap.points, eventDateMs(event.event_date) + (event.duration_minutes ?? 120) * 60_000, recap.recap?.pointsPaid != null, Date.now())}
          cheers={recap.recap?.cheers ?? 0}
          gamesThisYear={recap.recap?.gamesThisYear ?? 1}
          onShare={() => { void recap.share() }}
          sharing={recap.sharing}
        />
      ) : null}
      {recap.hostNext && recap.hostNext.id !== event.id ? (
        <View style={{ marginBottom: theme.spacing.md }} testID="host-next-game">
          <Text style={[shared.subheading, { marginBottom: theme.spacing.sm }]}>{host?.first_name ? `${host.first_name} plays again` : 'The host plays again'}</Text>
          <EventCard event={recap.hostNext} currentUserId={userId ?? undefined} />
        </View>
      ) : null}
    </>
  )
}
