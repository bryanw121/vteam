import { View } from 'react-native'
import { Text } from '../ui/Text'
import { shared, theme } from '../../constants'
import type { SheetMapProps, SheetRegion } from '../../types'

const W = 792
const H = 612
/** The form's main areas, drawn faintly so the highlight has something to sit in. */
const OUTLINE: SheetRegion[] = [
  { x: 27.8, y: 18, w: 570.7, h: 86.5 },
  { x: 27.8, y: 104.5, w: 570.7, h: 244.9 },
  { x: 27.8, y: 350.9, w: 570.7, h: 243 },
  { x: 271.5, y: 104.5, w: 83.4, h: 244.9 },
  { x: 271.5, y: 350.9, w: 83.4, h: 243 },
  { x: 603, y: 18, w: 170.7, h: 151.3 },
  { x: 603, y: 172.8, w: 170.7, h: 119.5 },
  { x: 603, y: 295, w: 170.7, h: 146.4 },
  { x: 603, y: 448, w: 170.7, h: 150 },
]
const pct = (r: SheetRegion) => ({ left: `${(r.x / W) * 100}%`, top: `${(r.y / H) * 100}%`, width: `${(r.w / W) * 100}%`, height: `${(r.h / H) * 100}%` }) as const

/** A small picture of the paper form (landscape) with the part to fill in highlighted. */
export function SheetMap({ regions, sheet }: SheetMapProps) {
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ gap: theme.spacing.xs }}>
      <View style={{ width: '100%', aspectRatio: W / H, backgroundColor: theme.colors.white, borderRadius: theme.radius.sm, overflow: 'hidden' }}>
        {OUTLINE.map((r, i) => (
          <View key={i} style={{ position: 'absolute', ...pct(r), borderWidth: 1, borderColor: theme.colors.subtextStrong }} />
        ))}
        {regions.map((r, i) => (
          <View key={`h${i}`} style={{ position: 'absolute', ...pct(r), borderWidth: 2.5, borderColor: theme.colors.primary, borderRadius: 3 }}>
            <View style={{ flex: 1, backgroundColor: theme.colors.primary, opacity: 0.25 }} />
          </View>
        ))}
      </View>
      {sheet > 1 && <Text style={shared.caption}>On sheet {sheet} (a second copy of the form)</Text>}
    </View>
  )
}
