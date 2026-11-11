import { useState } from 'react'
import { View } from 'react-native'
import type { LayoutChangeEvent } from 'react-native'
import Svg, { Circle, Line, Polyline, Rect } from 'react-native-svg'
import { theme } from '../../constants'

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
}

type BarProps = {
  values: readonly (number | null)[]
  height: number
  color: string
  label: string
}

/** Width of the parent, measured once laid out (charts draw nothing until then). */
function useWidth(): [number, (e: LayoutChangeEvent) => void] {
  const [width, setWidth] = useState(0)
  return [width, e => setWidth(Math.round(e.nativeEvent.layout.width))]
}

const PAD = 6

/** A line over evenly spaced values, scaled to the largest (at least 1). */
export function MetricLineChart({ values, height, color, label, markMax, markLast }: LineProps) {
  const [width, onLayout] = useWidth()
  const max = Math.max(1, ...values)
  const step = values.length > 1 ? (width - PAD * 2) / (values.length - 1) : 0
  const pts = values.map((v, i) => ({ x: PAD + i * step, y: PAD + (height - PAD * 2) * (1 - v / max) }))
  const maxIndex = values.indexOf(Math.max(...values))
  const mark = markLast ? pts[pts.length - 1] : markMax && maxIndex >= 0 ? pts[maxIndex] : null
  return (
    <View onLayout={onLayout} style={{ height }} accessible accessibilityRole="image" accessibilityLabel={label}>
      {width > 0 && values.length > 0 && (
        <Svg width={width} height={height}>
          <Line x1={0} y1={height - 1} x2={width} y2={height - 1} stroke={theme.colors.border} strokeWidth={1} />
          <Line x1={0} y1={height / 2} x2={width} y2={height / 2} stroke={theme.colors.borderSoft} strokeWidth={1} strokeDasharray="3 4" />
          <Line x1={0} y1={PAD} x2={width} y2={PAD} stroke={theme.colors.borderSoft} strokeWidth={1} strokeDasharray="3 4" />
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
  )
}

/** One bar per value; a null value leaves its slot empty. */
export function MetricBarChart({ values, height, color, label }: BarProps) {
  const [width, onLayout] = useWidth()
  const max = Math.max(1, ...values.map(v => v ?? 0))
  const slot = values.length ? width / values.length : 0
  const barW = Math.max(2, Math.min(14, slot * 0.7))
  return (
    <View onLayout={onLayout} style={{ height }} accessible accessibilityRole="image" accessibilityLabel={label}>
      {width > 0 && (
        <Svg width={width} height={height}>
          {values.map((v, i) => {
            if (v === null || v <= 0) return null
            const h = Math.max(2, (height - 2) * (v / max))
            return <Rect key={i} x={i * slot + (slot - barW) / 2} y={height - h} width={barW} height={h} rx={2} fill={color} />
          })}
        </Svg>
      )}
    </View>
  )
}
