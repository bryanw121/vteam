import { useState } from 'react'
import { StyleSheet, View } from 'react-native'
import type { LayoutChangeEvent } from 'react-native'
import Svg, { Circle, Line, Polyline, Rect, Text as SvgText } from 'react-native-svg'
import { theme } from '../../constants'
import { TIGHT_TEXT_SCALE } from '../../constants/textSize'
import { Text, useScaledFontSize } from '../ui/Text'
import { axisTicks, axisTop } from '../../utils/metrics'

type LineProps = {
  values: readonly number[]
  height: number
  color: string
  /** What the chart shows, for screen readers. */
  label: string
  /** Mark the highest point. */
  markMax?: boolean
  /** Mark the last point (Live: "now"). */
  markLast?: boolean
  /** Under the left and right ends of the x axis ("Nov 1" / "Nov 7", "60 min ago" / "now"). */
  xLabels?: readonly [string, string]
}

type BarProps = {
  values: readonly (number | null)[]
  height: number
  color: string
  label: string
  xLabels?: readonly [string, string]
}

/** Width of the parent, measured once laid out (charts draw nothing until then). */
function useWidth(): [number, (e: LayoutChangeEvent) => void] {
  const [width, setWidth] = useState(0)
  return [width, e => setWidth(Math.round(e.nativeEvent.layout.width))]
}

/** Room above the top gridline and below the bottom one, so the end labels aren't clipped. */
const PAD = 7

/**
 * The y axis both charts share: counts from 0 to `axisTop(max)`, gridlines at `axisTicks`,
 * each labelled on the left, and the plot area to the right of the labels.
 */
function useAxis(max: number, width: number, height: number) {
  const fontSize = useScaledFontSize(theme.font.size.xs, TIGHT_TEXT_SCALE)
  const top = axisTop(max)
  const ticks = axisTicks(max)
  // Digits are about 0.6 em wide; leave a gap between the label and the plot.
  const gutter = Math.ceil(String(top).length * fontSize * 0.62) + theme.spacing.sm
  const plotH = height - PAD * 2
  const y = (v: number) => PAD + plotH * (1 - v / top)
  const grid = ticks.map(t => (
    <Line key={`g${t}`} x1={gutter} y1={y(t)} x2={width} y2={y(t)}
      stroke={t === 0 ? theme.colors.border : theme.colors.borderSoft} strokeWidth={1} strokeDasharray={t === 0 ? undefined : '3 4'} />
  ))
  const labels = ticks.map(t => (
    <SvgText key={`l${t}`} x={gutter - theme.spacing.xs - 2} y={y(t)} textAnchor="end" alignmentBaseline="middle"
      fontSize={fontSize} fontFamily={theme.fonts.body} fill={theme.colors.subtext}>
      {String(t)}
    </SvgText>
  ))
  return { gutter, y, plotH, grid, labels }
}

function XLabels({ labels, gutter }: { labels?: readonly [string, string]; gutter: number }) {
  if (!labels) return null
  return (
    <View style={[styles.xRow, { paddingLeft: gutter }]}>
      <Text style={styles.xLabel}>{labels[0]}</Text>
      <Text style={styles.xLabel}>{labels[1]}</Text>
    </View>
  )
}

/** A line over evenly spaced values, on a 0-based count axis labelled on the left. */
export function MetricLineChart({ values, height, color, label, markMax, markLast, xLabels }: LineProps) {
  const [width, onLayout] = useWidth()
  const axis = useAxis(Math.max(0, ...values), width, height)
  const plotW = width - axis.gutter - PAD
  const step = values.length > 1 ? plotW / (values.length - 1) : 0
  const pts = values.map((v, i) => ({ x: axis.gutter + PAD / 2 + i * step, y: axis.y(v) }))
  const maxIndex = values.indexOf(Math.max(...values))
  const mark = markLast ? pts[pts.length - 1] : markMax && maxIndex >= 0 ? pts[maxIndex] : null
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={label}>
      <View onLayout={onLayout} style={{ height }}>
        {width > 0 && values.length > 0 && (
          <Svg width={width} height={height}>
            {axis.grid}
            {axis.labels}
            <Polyline
              points={pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}
              fill="none"
              stroke={color}
              strokeWidth={2.5}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {mark && <Circle cx={mark.x} cy={mark.y} r={4} fill={color} />}
          </Svg>
        )}
      </View>
      <XLabels labels={xLabels} gutter={axis.gutter} />
    </View>
  )
}

/** One bar per value on a 0-based count axis labelled on the left; a null value leaves its slot empty. */
export function MetricBarChart({ values, height, color, label, xLabels }: BarProps) {
  const [width, onLayout] = useWidth()
  const axis = useAxis(Math.max(0, ...values.map(v => v ?? 0)), width, height)
  const slot = values.length ? (width - axis.gutter) / values.length : 0
  const barW = Math.max(2, Math.min(14, slot * 0.7))
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={label}>
      <View onLayout={onLayout} style={{ height }}>
        {width > 0 && (
          <Svg width={width} height={height}>
            {axis.grid}
            {axis.labels}
            {values.map((v, i) => {
              if (v === null || v <= 0) return null
              const h = Math.max(2, axis.y(0) - axis.y(v))
              return <Rect key={i} x={axis.gutter + i * slot + (slot - barW) / 2} y={axis.y(0) - h} width={barW} height={h} rx={2} fill={color} />
            })}
          </Svg>
        )}
      </View>
      <XLabels labels={xLabels} gutter={axis.gutter} />
    </View>
  )
}

const styles = StyleSheet.create({
  xRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: theme.spacing.xs },
  xLabel: { fontFamily: theme.fonts.body, fontSize: theme.font.size.xs, color: theme.colors.subtext },
})
