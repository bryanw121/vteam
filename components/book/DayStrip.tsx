import { ScrollView, TouchableOpacity, View } from 'react-native'
import { Text } from '../ui/Text'
import { shared } from '../../constants'
import { dayParts } from '../../utils/courts'
import type { DayOption } from '../../types'

type Props = {
  days: DayOption[]
  selected: string
  /** Days with at least one free window somewhere (a dot under the date). */
  freeDays: Set<string>
  onSelect: (iso: string) => void
}

/** The next seven days (Austin), as 44pt+ tappable pills. Scrolls sideways on narrow screens. */
export function DayStrip({ days, selected, freeDays, onSelect }: Props) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={shared.bookDayStrip}
      accessibilityRole="tablist"
    >
      {days.map(day => {
        const active = day.iso === selected
        const { dow, day: date, long } = dayParts(day.iso)
        const hasFree = freeDays.has(day.iso)
        return (
          <TouchableOpacity
            key={day.iso}
            onPress={() => onSelect(day.iso)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={`${day.isToday ? 'Today, ' : ''}${long}${hasFree ? ', courts free' : ', no free courts'}`}
            testID={`book-day-${day.iso}`}
            style={[shared.bookDay, active && shared.bookDayActive]}
          >
            <Text style={[shared.bookDayDow, active && shared.bookDayTextActive]}>{day.isToday ? 'Today' : dow}</Text>
            <Text style={[shared.bookDayDate, active && shared.bookDayTextActive]}>{date}</Text>
            <View style={[shared.bookDayDot, hasFree && (active ? shared.bookDayDotOnActive : shared.bookDayDotFree)]} />
          </TouchableOpacity>
        )
      })}
    </ScrollView>
  )
}
