import { memo } from 'react'
import { Platform, Pressable, View } from 'react-native'
import { Text } from '../ui/Text'
import { Image } from 'expo-image'
import * as Linking from 'expo-linking'
import Ionicons from '@expo/vector-icons/Ionicons'
import { theme } from '../../constants'
import { SPONSORED_LABEL } from '../../constants/ads'
import type { AdBanner } from '../../types'

type Props = { banner: AdBanner }

function openBanner(url: string) {
  // Links are https-only (CHECK on ad_banners.link_url).
  if (Platform.OS === 'web') window.open(url, '_blank', 'noopener,noreferrer')
  else void Linking.openURL(url)
}

/**
 * A house banner in the Events feed (`ad_banners`): optional wide image, title,
 * one line of body, and a "Sponsored" tag. The whole card opens its link in the
 * browser. Rendered only where `useAdsEnabled()` allows it.
 */
function FeedBannerInner({ banner }: Props) {
  return (
    <Pressable
      testID="feed-banner"
      accessibilityRole="link"
      accessibilityLabel={`${SPONSORED_LABEL}: ${banner.title}`}
      onPress={() => openBanner(banner.link_url)}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => ({
        marginBottom: theme.spacing.sm,
        borderRadius: theme.radius.lg,
        borderWidth: 1,
        borderColor: hovered ? theme.colors.primary : theme.colors.border,
        backgroundColor: theme.colors.card,
        overflow: 'hidden',
        opacity: pressed ? 0.85 : 1,
        // No double-tap zoom delay on mobile web.
        ...(Platform.OS === 'web' ? ({ touchAction: 'manipulation', cursor: 'pointer' } as object) : null),
      })}
    >
      {banner.image_url ? (
        <Image
          source={{ uri: banner.image_url }}
          style={{ width: '100%', aspectRatio: 3, backgroundColor: theme.colors.borderSoft }}
          contentFit="cover"
          accessibilityIgnoresInvertColors
        />
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, padding: theme.spacing.md, minHeight: 44 }}>
        <View style={{ flex: 1, gap: theme.spacing.xxs }}>
          <Text style={{ fontFamily: theme.fonts.bodySemiBold, fontSize: theme.font.size.xs, color: theme.colors.subtext, letterSpacing: 0.6, textTransform: 'uppercase' }}>
            {SPONSORED_LABEL}
          </Text>
          <Text numberOfLines={2} style={{ fontFamily: theme.fonts.displaySemiBold, fontSize: theme.font.size.md, color: theme.colors.text }}>
            {banner.title}
          </Text>
          {banner.body ? (
            <Text numberOfLines={2} style={{ fontFamily: theme.fonts.body, fontSize: theme.font.size.sm, color: theme.colors.subtext }}>
              {banner.body}
            </Text>
          ) : null}
        </View>
        <Ionicons name="open-outline" size={18} color={theme.colors.subtext} />
      </View>
    </Pressable>
  )
}

export const FeedBanner = memo(FeedBannerInner)
