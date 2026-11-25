import { View } from 'react-native'
import { Text } from '../ui/Text'
import { shared, COMPACT_TEXT_SCALE } from '../../constants'
import type { ForecastSummary } from '../../types'

type Props = { summary: ForecastSummary }

/**
 * Weather chip on an outdoor event's card, next to its TimePill (#165):
 * "☀️ 78°" in quiet grey, or a warning style for rain (accent) or heat (warm).
 * Presentational: the feed works out the summary (`useFeedForecasts`).
 */
export function ForecastChip({ summary }: Props) {
  const rain = summary.tone === 'rain'
  const heat = summary.tone === 'heat'
  return (
    <View
      testID="forecast-chip"
      accessible
      accessibilityLabel={summary.a11yLabel}
      style={[shared.forecastChip, rain && shared.forecastChipRain, heat && shared.forecastChipHeat]}
    >
      <Text
        maxFontSizeMultiplier={COMPACT_TEXT_SCALE}
        style={[shared.forecastChipLabel, rain && shared.forecastChipLabelRain, heat && shared.forecastChipLabelHeat]}
      >
        {summary.chipLabel}
      </Text>
    </View>
  )
}
