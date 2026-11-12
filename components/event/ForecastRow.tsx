import { useCallback } from 'react'
import { View } from 'react-native'
import { Text } from '../ui/Text'
import { shared, theme, COMPACT_TEXT_SCALE } from '../../constants'
import { FORECAST_COPY } from '../../constants/weather'
import { useForecast } from '../../hooks/useForecast'
import { eventCourt, forecastSummary, forecastWindow, pickForecastHours } from '../../utils/forecast'
import type { EventWithDetails, ForecastCell } from '../../types'

type Props = { event: EventWithDetails }

const hourLabel = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric' })

/** Desktop web: the NWS short forecast as the cell's hover tooltip. Native views have no `setAttribute`. */
function useTitle(title: string) {
  return useCallback((node: unknown) => {
    const el = node as { setAttribute?: (k: string, v: string) => void } | null
    if (el && typeof el.setAttribute === 'function') el.setAttribute('title', title)
  }, [title])
}

type CellProps = { cell: ForecastCell }

function HourCell({ cell }: CellProps) {
  const ref = useTitle(cell.short)
  const time = hourLabel(cell.t)
  return (
    <View
      ref={ref as never}
      testID={cell.inGame ? 'forecast-cell-game' : 'forecast-cell'}
      accessible
      accessibilityLabel={`${time}: ${cell.tempF} degrees, ${cell.pop} percent chance of rain${cell.short ? `, ${cell.short}` : ''}${cell.inGame ? ', during the game' : ''}`}
      style={[shared.forecastCell, cell.inGame && shared.forecastCellInGame]}
    >
      <Text maxFontSizeMultiplier={COMPACT_TEXT_SCALE} style={shared.forecastCellTime}>{time}</Text>
      <Text maxFontSizeMultiplier={COMPACT_TEXT_SCALE} style={shared.forecastCellTemp}>{cell.tempF}°</Text>
      <Text maxFontSizeMultiplier={COMPACT_TEXT_SCALE} style={shared.forecastCellPop}>{cell.pop}%</Text>
    </View>
  )
}

/**
 * Event page forecast (#165), after the location row: the hours from one
 * before the start to the end, game hours highlighted, with a headline (rain,
 * heat, or the NWS short forecast). More than 7 days out it says when the
 * forecast will appear. Nothing at all for indoor events, events without
 * coordinates, or when there is no forecast: it never holds up the page.
 */
export function ForecastRow({ event }: Props) {
  const now = Date.now()
  const when = forecastWindow(event, now)
  const court = eventCourt(event)
  const forecast = useForecast(court, when === 'show')
  if (!when || !court) return null

  if (when === 'later') {
    return (
      <>
        <View style={{ height: 1, backgroundColor: theme.colors.border }} />
        <View testID="forecast-row" style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, paddingVertical: theme.spacing.md }}>
          <View style={{ width: 36, height: 36, borderRadius: theme.radius.sm, backgroundColor: theme.colors.primary + '14', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Text style={{ fontSize: theme.font.size.lg }} accessibilityElementsHidden importantForAccessibility="no">🌤</Text>
          </View>
          <Text style={[shared.caption, { flex: 1 }]}>{FORECAST_COPY.later}</Text>
        </View>
      </>
    )
  }

  if (!forecast) return null
  const cells = pickForecastHours(forecast.hours, event.event_date, event.duration_minutes)
  const summary = forecastSummary(cells)
  if (!summary) return null
  const headColor = summary.tone === 'heat' ? theme.colors.warm : summary.tone === 'rain' ? theme.colors.accent : theme.colors.text
  const updated = new Date(forecast.updatedAt)
  const updatedLabel = Number.isFinite(updated.getTime()) ? updated.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : ''

  return (
    <>
      <View style={{ height: 1, backgroundColor: theme.colors.border }} />
      <View testID="forecast-row" style={{ flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.md, paddingVertical: theme.spacing.md }}>
        <View style={{ width: 36, height: 36, borderRadius: theme.radius.sm, backgroundColor: theme.colors.primary + '14', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Text style={{ fontSize: theme.font.size.lg }} accessibilityElementsHidden importantForAccessibility="no">{summary.emoji}</Text>
        </View>
        <View style={{ flex: 1, paddingTop: 2 }}>
          <Text testID="forecast-headline" style={{ fontSize: theme.font.size.md, fontWeight: theme.font.weight.semibold, color: headColor }}>
            {summary.headline}
          </Text>
          <Text style={[shared.caption, { marginTop: 2 }]}>{summary.detail}</Text>
          <View style={shared.forecastCells}>
            {cells.map(c => <HourCell key={c.t} cell={c} />)}
          </View>
          <Text style={[shared.caption, { marginTop: theme.spacing.sm, fontSize: theme.font.size.xs }]}>
            {FORECAST_COPY.source(updatedLabel)}
          </Text>
        </View>
      </View>
    </>
  )
}
