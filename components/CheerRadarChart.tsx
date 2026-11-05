import React from 'react'
import { View } from 'react-native'
import { Text, useScaledFontSize } from './ui/Text'
import Svg, { Circle, Line, Polygon, Text as SvgText } from 'react-native-svg'
import Ionicons from '@expo/vector-icons/Ionicons'
import { theme, CHEER_TYPES } from '../constants'
import { TIGHT_TEXT_SCALE } from '../constants/textSize'
import type { CheerCounts, CheerType, IoniconName } from '../types'

const CHART_SIZE = 280
const CX = CHART_SIZE / 2
const CY = CHART_SIZE / 2
const R = 88
const LABEL_R = 116
const N = CHEER_TYPES.length

const CHART_LABEL_OVERRIDES: Partial<Record<string, string>> = { Communication: 'Comm.' }

function angleAt(i: number) { return (2 * Math.PI * i / N) - Math.PI / 2 }

function polarXY(radius: number, i: number) {
  const a = angleAt(i)
  return { x: CX + radius * Math.cos(a), y: CY + radius * Math.sin(a) }
}

function buildPolygonPoints(values: number[]) {
  return values.map((v, i) => { const { x, y } = polarXY(v * R, i); return `${x},${y}` }).join(' ')
}

function buildRingPoints(level: number) {
  return Array.from({ length: N }, (_, i) => { const { x, y } = polarXY(level * R, i); return `${x},${y}` }).join(' ')
}

type Props = { counts: CheerCounts }

export function CheerRadarChart({ counts }: Props) {
  const values = CHEER_TYPES.map(kt => counts[kt.type] ?? 0)
  // Labels sit at fixed points around a fixed-size chart, so they grow only a little.
  const svgLabelSize = useScaledFontSize(theme.font.size.xs, TIGHT_TEXT_SCALE)
  const maxCount = Math.max(...values, 1)
  const normalized = values.map(v => v / maxCount)

  const legend = CHEER_TYPES
    .map(kt => ({ ...kt, count: counts[kt.type] ?? 0 }))
    .filter(kt => kt.count > 0)
    .sort((a, b) => b.count - a.count)

  return (
    <View style={{ alignItems: 'center' }}>
      <Svg width={CHART_SIZE} height={CHART_SIZE}>
        {/* Grid rings */}
        {[0.25, 0.5, 0.75, 1].map(level => (
          <Polygon key={level} points={buildRingPoints(level)} fill="none"
            stroke={theme.colors.border} strokeWidth={level === 1 ? 1.5 : 1} />
        ))}

        {/* Axis spokes */}
        {CHEER_TYPES.map((kt, i) => {
          const { x, y } = polarXY(R, i)
          return <Line key={kt.type} x1={CX} y1={CY} x2={x} y2={y} stroke={theme.colors.border} strokeWidth={1} />
        })}

        {/* Filled polygon */}
        <Polygon points={buildPolygonPoints(normalized)}
          fill={theme.colors.primary + '28'} stroke={theme.colors.primary}
          strokeWidth={2} strokeLinejoin="round" />

        {/* Dots */}
        {normalized.map((v, i) => {
          const { x, y } = polarXY(v * R, i)
          return <Circle key={i} cx={x} cy={y} r={3.5} fill={theme.colors.primary} />
        })}

        {/* Labels */}
        {CHEER_TYPES.map((kt, i) => {
          const angle = angleAt(i)
          const { x, y } = polarXY(LABEL_R, i)
          const cos = Math.cos(angle)
          const anchor = cos > 0.15 ? 'start' : cos < -0.15 ? 'end' : 'middle'
          return (
            <SvgText key={kt.type} x={x} y={y} textAnchor={anchor} alignmentBaseline="middle"
              fontSize={svgLabelSize} fontWeight="600" fill={theme.colors.subtext}>
              {CHART_LABEL_OVERRIDES[kt.label] ?? kt.label}
            </SvgText>
          )
        })}
      </Svg>

      {/* Legend */}
      {legend.length > 0 && (
        <View style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          justifyContent: 'center',
          gap: theme.spacing.sm,
          marginTop: theme.spacing.sm,
        }}>
          {legend.map(kt => (
            <View key={kt.type} style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 5,
              paddingHorizontal: theme.spacing.sm,
              paddingVertical: 4,
              borderRadius: theme.radius.full,
              backgroundColor: theme.colors.primary + '0E',
              borderWidth: 1,
              borderColor: theme.colors.primary + '40',
            }}>
              <Ionicons name={kt.icon as IoniconName} size={12} color={theme.colors.primary} />
              <Text style={{ fontSize: theme.font.size.xs, color: theme.colors.subtext }}>
                {kt.label}
              </Text>
              <Text style={{ fontSize: theme.font.size.xs, fontWeight: theme.font.weight.bold, color: theme.colors.primary }}>
                {kt.count}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  )
}
