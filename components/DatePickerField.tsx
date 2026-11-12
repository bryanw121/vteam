import { View } from 'react-native'
import { Text } from './ui/Text'
import DateTimePicker from '@react-native-community/datetimepicker'
import { shared } from '../constants'

type Props = {
  value: Date | null
  onChange: (date: Date) => void
  placeholder?: string
}

export function DatePickerField({ value, onChange }: Props) {
  const effective = value ?? new Date()
  return (
    <View style={shared.inputContainer}>
      <Text style={shared.label}>Date & Time</Text>
      <View style={shared.pickerBox}>
        <View style={shared.pickerItem}>
          <Text style={shared.pickerLabel}>Date</Text>
          <DateTimePicker
            value={effective}
            mode="date"
            display="compact"
            minimumDate={new Date()}
            themeVariant="light"
            onChange={(_, d) => { if (d) onChange(d) }}
          />
        </View>
        <View style={shared.pickerDivider} />
        <View style={shared.pickerItem}>
          <Text style={shared.pickerLabel}>Time</Text>
          <DateTimePicker
            value={effective}
            mode="time"
            display="compact"
            minuteInterval={5}
            themeVariant="light"
            onChange={(_, d) => { if (d) onChange(d) }}
          />
        </View>
      </View>
    </View>
  )
}
