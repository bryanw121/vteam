import { useEffect, useRef, useState } from 'react'
import { ScrollView, View } from 'react-native'
import { Text, useScaledFontSize } from '../ui/Text'
import type { LayoutChangeEvent } from 'react-native'
import Svg, { Line, Rect, Text as SvgText } from 'react-native-svg'
import { shared, theme } from '../../constants'
import { TIGHT_TEXT_SCALE } from '../../constants/textSize'
import { describeLane, formatClock, gridTicks } from '../../utils/courts'
import type { FacilityDay, MinuteRange } from '../../types'

type Props = {
  day: FacilityDay
  /** Shared across the day's facilities so every grid lines up. */
  span: MinuteRange
  /** Minute of the day for the "now" line (today only). */
  nowMin: number | null
}

const AXIS_H = 18
const LANE_H = 26
const LANE_GAP = 6
/** Below this the grid scrolls sideways rather than squeezing hours together. */
const MIN_PX_PER_HOUR = 40

/**
 * One facility's courts as horizontal hour bars: free time clear (a light
 * wash), booked blocks solid red, closed hours shaded, a line at "now" on today.
 * Court labels sit outside the horizontal scroller, so they stay put while
 * the hours scroll on a phone.
 */
export function CourtGrid({ day, span, nowMin }: Props) {
  // Axis labels sit in a fixed-height strip, so they grow only a little.
  const svgLabelSize = useScaledFontSize(theme.font.size.xs, TIGHT_TEXT_SCALE)
  const [viewport, setViewport] = useState(0)
  const scrollRef = useRef<ScrollView>(null)
  const [start, end] = span
  const hours = (end - start) / 60
  const width = Math.max(viewport, Math.ceil(hours * MIN_PX_PER_HOUR))
  const x = (min: number) => ((Math.min(Math.max(min, start), end) - start) / (end - start)) * width
  const height = AXIS_H + day.lanes.length * (LANE_H + LANE_GAP)
  const laneY = (i: number) => AXIS_H + i * (LANE_H + LANE_GAP)
  const showNow = nowMin !== null && nowMin > start && nowMin < end

  // On a phone, start scrolled to "now" (today), else an hour before the first
  // booking (where the day gets interesting), else opening time. The summary
  // line above already lists every free window, scrolled into view or not.
  const firstBooked = Math.min(...day.lanes.flatMap(l => l.booked.map(([a]) => a)).filter(a => a >= day.openMin), Infinity)
  const anchor = showNow ? nowMin : Number.isFinite(firstBooked) ? Math.max(day.openMin, firstBooked - 60) : day.openMin
  useEffect(() => {
    if (!viewport || width <= viewport) return
    const target = Math.max(0, Math.min(width - viewport, x(anchor) - viewport / 4))
    scrollRef.current?.scrollTo({ x: target, animated: false })
    // x depends only on span and width
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewport, width, anchor, start, end])

  const onLayout = (e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width)
    if (w && w !== viewport) setViewport(w)
  }

  const a11y = day.lanes.map(l => describeLane(l.label, l.booked, l.free)).join('. ')

  const scrolls = viewport > 0 && width > viewport

  return (
    <View>
    <View style={shared.bookGrid} accessible accessibilityRole="image" accessibilityLabel={a11y}>
      <View style={shared.bookGridLabels}>
        <View style={{ height: AXIS_H }} />
        {day.lanes.map(lane => (
          <View key={lane.name} style={[shared.bookGridLabelRow, { height: LANE_H, marginBottom: LANE_GAP }]}>
            <Text style={shared.bookGridLabel} numberOfLines={1}>{lane.label}</Text>
          </View>
        ))}
      </View>
      <ScrollView
        ref={scrollRef}
        horizontal
        style={shared.bookGridScroll}
        onLayout={onLayout}
        showsHorizontalScrollIndicator={scrolls}
      >
        {viewport > 0 && (
          <Svg width={width} height={height}>
            {gridTicks(span).map(t => (
              <SvgText
                key={t}
                x={Math.min(Math.max(x(t), 2), width - 2)}
                y={12}
                fontSize={svgLabelSize}
                fontFamily={theme.fonts.body}
                fill={theme.colors.subtext}
                textAnchor={t === start ? 'start' : t === end ? 'end' : 'middle'}
              >
                {formatClock(t)}
              </SvgText>
            ))}

            {day.lanes.map((lane, i) => {
              const y = laneY(i)
              return (
                <Rect key={`${lane.name}-bg`} x={0} y={y} width={width} height={LANE_H} rx={5} fill={theme.colors.borderSoft} />
              )
            })}
            {day.lanes.map((lane, i) => {
              const y = laneY(i)
              return (
                <Rect
                  key={`${lane.name}-open`}
                  x={x(day.openMin)}
                  y={y}
                  width={Math.max(0, x(day.closeMin) - x(day.openMin))}
                  height={LANE_H}
                  fill={theme.colors.cool}
                  fillOpacity={0.28}
                />
              )
            })}
            {day.lanes.flatMap((lane, i) => lane.booked.map(([a, b]) => (
              <Rect
                key={`${lane.name}-${a}-${b}`}
                x={x(a)}
                y={laneY(i)}
                width={Math.max(1, x(b) - x(a))}
                height={LANE_H}
                fill={theme.colors.error}
                fillOpacity={0.85}
              />
            )))}
            {/* Closing time: a firm edge so "free until close" reads clearly. */}
            {day.closeMin < end && (
              <Line x1={x(day.closeMin)} y1={AXIS_H} x2={x(day.closeMin)} y2={height - LANE_GAP} stroke={theme.colors.subtext} strokeWidth={1} />
            )}
            {showNow && (
              <Line x1={x(nowMin)} y1={AXIS_H - 4} x2={x(nowMin)} y2={height - LANE_GAP} stroke={theme.colors.text} strokeWidth={2} />
            )}
          </Svg>
        )}
      </ScrollView>
    </View>
    {scrolls ? <Text style={shared.bookGridHint}>Scroll sideways for more hours</Text> : null}
    </View>
  )
}
