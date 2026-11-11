import { View } from 'react-native'
import { Text } from '../ui/Text'
import { BottomSheet, ConfirmDialog, TimePill } from '../ui'
import { Button } from '../Button'
import { JOIN_INTENT_COPY, shared, theme } from '../../constants'
import type { JoinOffer } from '../../types'

type Props = {
  /** null = closed. 'offer': grab your spot; 'setup': joined, offer player setup. */
  stage: 'offer' | 'setup' | null
  /** 'sheet' on native and narrow web; 'dialog' on desktop web. */
  layout: 'sheet' | 'dialog'
  offer: JoinOffer
  firstName: string | null
  title: string
  /** TimePill label, e.g. "Sun 9:00 AM". */
  when: string
  spotsLeft: number | null
  joining: boolean
  onJoin: () => void
  onNotNow: () => void
  onSetup: () => void
  onLater: () => void
}

const JOIN_LABEL: Record<JoinOffer, string> = {
  join: JOIN_INTENT_COPY.join,
  waitlist: JOIN_INTENT_COPY.waitlist,
  request: JOIN_INTENT_COPY.request,
}

/**
 * Back on the game after signing up or in from Join (#229): one tap to finish
 * what they started. The join itself is the screen's (same mutation as the
 * Join button, so paid, approval and waitlist rules are unchanged); nothing is
 * joined without this tap. Then, for a new player, player setup as a choice
 * here instead of a screen pushed over the game. Presentational; no navigation.
 */
export function JoinIntentSheet({ stage, layout, offer, firstName, title, when, spotsLeft, joining, onJoin, onNotNow, onSetup, onLater }: Props) {
  const visible = stage !== null
  const setup = stage === 'setup'
  const heading = setup ? JOIN_INTENT_COPY.setupTitle : JOIN_INTENT_COPY.title(firstName)
  const note = offer === 'waitlist' ? JOIN_INTENT_COPY.waitlistNote : offer === 'request' ? JOIN_INTENT_COPY.requestNote : null

  const body = setup ? (
    <Text style={shared.leaveSubtitle} testID="join-intent-setup">{JOIN_INTENT_COPY.setupBody}</Text>
  ) : (
    <View style={{ gap: theme.spacing.sm, marginBottom: theme.spacing.md }} testID="join-intent-offer">
      <Text style={shared.subheading}>{JOIN_INTENT_COPY.question}</Text>
      <Text style={shared.body} numberOfLines={2}>{title}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, flexWrap: 'wrap' }}>
        <TimePill label={when} />
        {spotsLeft != null && spotsLeft > 0 && (
          <Text style={shared.captionStrong}>{spotsLeft} {spotsLeft === 1 ? 'spot' : 'spots'} left</Text>
        )}
      </View>
      {note && <Text style={shared.captionStrong}>{note}</Text>}
    </View>
  )

  const confirmLabel = setup ? JOIN_INTENT_COPY.setup : JOIN_LABEL[offer]
  const cancelLabel = setup ? JOIN_INTENT_COPY.later : JOIN_INTENT_COPY.notNow
  const confirm = setup ? onSetup : onJoin
  const cancel = () => { if (!joining) (setup ? onLater : onNotNow)() }

  if (layout === 'dialog') {
    return (
      <ConfirmDialog
        visible={visible}
        title={heading}
        confirmLabel={confirmLabel}
        cancelLabel={cancelLabel}
        loading={joining}
        onConfirm={confirm}
        onCancel={cancel}
        width={420}
        testIDPrefix="join-intent"
      >
        {body}
      </ConfirmDialog>
    )
  }

  return (
    <BottomSheet visible={visible} onDismiss={cancel} title={heading}>
      {body}
      <View style={shared.leaveActions}>
        <Button label={confirmLabel} onPress={confirm} loading={joining} testID="join-intent-confirm" />
        <Button label={cancelLabel} variant="secondary" onPress={cancel} disabled={joining} testID="join-intent-cancel" />
      </View>
    </BottomSheet>
  )
}
