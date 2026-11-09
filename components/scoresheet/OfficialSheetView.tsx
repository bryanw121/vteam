import { memo, useMemo, useState } from 'react'
import { Image, View } from 'react-native'
import Svg, { Ellipse, Line, Rect, Text as SvgText } from 'react-native-svg'
import { theme } from '../../constants'
import { SHEET_HEIGHT, SHEET_WIDTH } from '../../lib/scoresheet/officialLayout'
import { fitText, helveticaMeasure } from '../../lib/scoresheet/fitText'
import { focusBox } from '../../lib/scoresheet/sheetView'
import { opKeys } from '../../lib/scoresheet/liveSheet'
import type { OfficialSheetViewProps, SheetOp } from '../../types'

const FORM = require('../../assets/scoresheet/usav-2-set-scoresheet.png')

/**
 * One mark. Memoized and keyed by what it is (opKeys), so when the match changes by a point
 * only the new marks are drawn; on the live sheet that's a few elements per tap, not hundreds.
 */
const SheetMark = memo(function SheetMark({ op }: { op: SheetOp; id: string }) {
  switch (op.kind) {
    case 'line':
      return <Line x1={op.x1} y1={op.y1} x2={op.x2} y2={op.y2} stroke={theme.colors.sheetInk} strokeWidth={op.width ?? 0.9} strokeLinecap="round" />
    case 'ellipse':
      return <Ellipse cx={op.cx} cy={op.cy} rx={op.rx} ry={op.ry} stroke={theme.colors.sheetInk} strokeWidth={op.width ?? 0.9} fill="none" />
    case 'cover':
      return <Rect x={op.x} y={op.y} width={op.w} height={op.h} fill={theme.colors.white} />
    case 'text': {
      const { text, size } = fitText(op.text, op.size, op.maxWidth, (t, s) => helveticaMeasure(t, s, op.bold))
      return (
        <SvgText
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
// Every layout is built afresh, so compare by the mark's key (which encodes all it draws), not identity.
}, (a, b) => a.id === b.id)

/**
 * The official USA Volleyball form as it will print, drawn on screen: the blank form
 * (a bundled image of the same PDF officialPdf.ts fills) with the layout's marks on top,
 * whole or zoomed to a part (`focus`), with parts tinted (`highlight`).
 */
export function OfficialSheetView({ layout, page = 0, focus, highlight, erased, accessibilityLabel, testID }: OfficialSheetViewProps) {
  const [width, setWidth] = useState(0)
  const box = focusBox(focus)
  const scale = width / box.w
  const isForm = layout.pages[page] !== 'plain'
  const marks = useMemo(() => {
    const keys = opKeys(layout.ops)
    return layout.ops.map((op, i) => ({ op, key: keys[i] })).filter(m => m.op.page === page)
  }, [layout, page])

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
          {marks.map(m => <SheetMark key={m.key} id={m.key} op={m.op} />)}
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
          {erased?.map((r, i) => (
            <Rect
              key={`e${i}`}
              x={r.x}
              y={r.y}
              width={r.w}
              height={r.h}
              rx={2}
              fill="none"
              stroke={theme.colors.warning}
              strokeWidth={1.5 / Math.max(scale, 0.01)}
              strokeDasharray={`${4 / Math.max(scale, 0.01)} ${3 / Math.max(scale, 0.01)}`}
            />
          ))}
        </Svg>
      )}
    </View>
  )
}
