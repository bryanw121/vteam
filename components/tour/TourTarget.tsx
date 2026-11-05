import type { ReactNode } from 'react'
import { View, type StyleProp, type ViewStyle } from 'react-native'
import { useTourTarget } from '../../contexts/tour'

type Props = {
  /** Step target id (constants/tours.ts `TOUR_TARGETS`). Several surfaces may register the same id; the visible one wins. */
  id: string
  children: ReactNode
  /** Layout of the wrapper, e.g. `{ flex: 1 }` inside a row. */
  style?: StyleProp<ViewStyle>
}

/** Marks its children as something a tour step can point at. Renders a plain View. */
export function TourTarget({ id, children, style }: Props) {
  const ref = useTourTarget(id)
  return (
    <View ref={ref} collapsable={false} style={style}>
      {children}
    </View>
  )
}
