import React from 'react'
import { TouchableOpacity, View } from 'react-native'
import { Text } from '../ui/Text'
import { Spinner } from '../ui/Spinner'
import { shared, theme } from '../../constants'
import type { EventCardVariant } from '../../types'

type Props = {
  variant: EventCardVariant
  isAttending: boolean
  /** Waitlisted / Requested / Needs approval: a status, not a button (the card opens the event). */
  awaiting: string | null
  loading: boolean
  onToggle: () => void
}

/** The card's RSVP / Going ✓ button, or the status pill that replaces it. */
export function RsvpButton({ variant, isAttending, awaiting, loading, onToggle }: Props) {
  const hero = variant === 'hero'
  const box = hero ? shared.ecRsvpHero : shared.ecRsvpRow
  const text = hero ? shared.ecRsvpTextHero : shared.ecRsvpTextRow
  if (awaiting) {
    return (
      <View style={[box, shared.ecRsvpOff]}>
        <Text style={[text, { color: theme.colors.subtext }]}>{awaiting}</Text>
      </View>
    )
  }
  // Party invite: the phone card's button is a plum ink pill ("I'm in" look).
  const onFill = hero ? theme.colors.text : theme.colors.primary
  // The ink pill inverts with the theme: plum on light, near-white on dark, page colour for its label.
  const onInk = hero ? theme.colors.background : theme.colors.white
  const ink = isAttending ? theme.colors.subtext : onInk
  return (
    <TouchableOpacity
      onPress={e => {
        e.stopPropagation?.()
        onToggle()
      }}
      disabled={loading}
      accessibilityRole="button"
      accessibilityState={{ disabled: loading, busy: loading }}
      activeOpacity={0.75}
      style={[box, isAttending ? shared.ecRsvpOff : { backgroundColor: onFill, borderColor: onFill }]}
    >
      {loading
        ? <Spinner size="small" color={ink} />
        : <Text style={[text, { color: ink }]}>{isAttending ? 'Going ✓' : 'RSVP'}</Text>}
    </TouchableOpacity>
  )
}
