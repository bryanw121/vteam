import { Pressable, View } from 'react-native'
import { Text } from './Text'
import { ANALYTICS_EVENTS, shared } from '../../constants'
import { track } from '../../lib/analytics'
import { useOneTimeBanner } from '../../hooks/useOneTimeBanner'
import { useTour } from '../../contexts/tour'
import { IconButton } from './IconButton'
import type { BannerAction, BannerDef, TourControls } from '../../types'

type Props = {
  banner: BannerDef
  /** Extra spacing from the screen (e.g. side margins on mobile). */
  style?: object
}

function runAction(action: BannerAction, tour: TourControls): void {
  switch (action.type) {
    case 'startTour':
      tour.start(action.tourId, 'banner')
      break
  }
}

/**
 * Information someone needs once: shown the first time they open the screen
 * that renders it, then never again. Define banners in constants/banners.ts.
 * A banner may carry one `action` (a link under the body); tapping it runs the
 * action and hides the banner.
 */
export function OneTimeBanner({ banner, style }: Props) {
  const { visible, dismiss } = useOneTimeBanner(banner)
  const tour = useTour()
  if (!visible) return null
  const { action } = banner
  return (
    <View style={[shared.oneTimeBanner, style]} accessibilityRole="summary" testID={`banner-${banner.id}`}>
      <View style={shared.oneTimeBannerText}>
        <Text style={shared.oneTimeBannerTitle}>{banner.title}</Text>
        <Text style={shared.oneTimeBannerBody}>{banner.body}</Text>
        {action && (
          <Pressable
            onPress={() => {
              track(ANALYTICS_EVENTS.bannerAction, { banner: banner.id, action: action.type })
              dismiss()
              runAction(action, tour)
            }}
            accessibilityRole="link"
            accessibilityLabel={action.label}
            style={shared.oneTimeBannerAction}
            testID={`banner-${banner.id}-action`}
          >
            <Text style={shared.oneTimeBannerActionText}>{action.label}</Text>
          </Pressable>
        )}
      </View>
      <IconButton icon="close" label="Dismiss" size={44} onPress={() => { track(ANALYTICS_EVENTS.bannerDismissed, { banner: banner.id }); dismiss() }} testID={`banner-${banner.id}-dismiss`} />
    </View>
  )
}
