import { useState } from 'react'
import { Image, View } from 'react-native'
import Svg, { Ellipse, Line, Rect, Text as SvgText } from 'react-native-svg'
import { theme } from '../../constants'
import { SHEET_HEIGHT, SHEET_WIDTH } from '../../lib/scoresheet/officialLayout'
import { fitText, helveticaMeasure } from '../../lib/scoresheet/fitText'
import { focusBox } from '../../lib/scoresheet/sheetView'
import type { OfficialSheetViewProps, SheetOp } from '../../types'

const FORM = require('../../assets/scoresheet/usav-2-set-scoresheet.png')

function renderOp(op: SheetOp, i: number) {
  switch (op.kind) {
    case 'line':
      return <Line key={i} x1={op.x1} y1={op.y1} x2={op.x2} y2={op.y2} stroke={theme.colors.sheetInk} strokeWidth={op.width ?? 0.9} strokeLinecap="round" />
    case 'ellipse':
      return <Ellipse key={i} cx={op.cx} cy={op.cy} rx={op.rx} ry={op.ry} stroke={theme.colors.sheetInk} strokeWidth={op.width ?? 0.9} fill="none" />
    case 'cover':
      return <Rect key={i} x={op.x} y={op.y} width={op.w} height={op.h} fill={theme.colors.white} />
    case 'text': {
      const { text, size } = fitText(op.text, op.size, op.maxWidth, (t, s) => helveticaMeasure(t, s, op.bold))
      return (
        <SvgText
          key={i}
          x={op.x}
          y={op.y}
          fontSize={size}
          fontWeight={op.bold ? 'bold' : 'normal'}
          fontFamily="Helvetica, Arial, sans-serif"
          textAnchor={op.align === 'center' ? 'middle' : op.align === 'right' ? 'end' : 'start'}
          fill={theme.colors.sheetInk}
        >
          {text}
        </SvgText>
      )
    }
  }
}

/**
 * The official USA Volleyball form as it will print, drawn on screen: the blank form
 * (a bundled image of the same PDF officialPdf.ts fills) with the layout's marks on top,
 * whole or zoomed to a part (`focus`), with parts tinted (`highlight`).
 */
export function OfficialSheetView({ layout, page = 0, focus, highlight, accessibilityLabel, testID }: OfficialSheetViewProps) {
  const [width, setWidth] = useState(0)
  const box = focusBox(focus)
  const scale = width / box.w
  const isForm = layout.pages[page] !== 'plain'
  const ops = layout.ops.filter(op => op.page === page)

  return (
    <View
      onLayout={e => setWidth(e.nativeEvent.layout.width)}
      style={{ width: '100%', aspectRatio: box.w / box.h, backgroundColor: theme.colors.white, borderRadius: theme.radius.sm, overflow: 'hidden' }}
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel ?? 'Official USA Volleyball scoresheet'}
      testID={testID}
    >
      {width > 0 && isForm && (
        <Image
          source={FORM}
          resizeMode="stretch"
          style={{ position: 'absolute', left: -box.x * scale, top: -box.y * scale, width: SHEET_WIDTH * scale, height: SHEET_HEIGHT * scale }}
        />
      )}
      {width > 0 && (
        <Svg width="100%" height="100%" viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`} style={{ position: 'absolute', left: 0, top: 0 }}>
          {ops.map(renderOp)}
          {highlight?.map((r, i) => (
            <Rect
              key={`h${i}`}
              x={r.x}
              y={r.y}
              width={r.w}
              height={r.h}
              rx={2}
              fill={theme.colors.primary}
              fillOpacity={0.14}
              stroke={theme.colors.primary}
              strokeWidth={2 / Math.max(scale, 0.01)}
            />
          ))}
        </Svg>
      )}
    </View>
  )
}
