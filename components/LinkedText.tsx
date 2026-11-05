import { Platform, Pressable } from 'react-native'
import { Text } from './ui/Text'
import * as Linking from 'expo-linking'
import { theme } from '../constants/theme'

const URL_REGEX = /(https?:\/\/[^\s]+)/g

type Props = {
  text: string
  style?: object
}

export function LinkedText({ text, style }: Props) {
  const parts = text.split(URL_REGEX)

  return (
    <Text style={style}>
      {parts.map((part, i) => {
        if (URL_REGEX.test(part)) {
          // Reset lastIndex after test()
          URL_REGEX.lastIndex = 0
          return (
            <Text
              key={i}
              style={{ color: theme.colors.primary, textDecorationLine: 'underline' }}
              onPress={() => {
                if (Platform.OS === 'web') {
                  window.open(part, '_blank', 'noopener,noreferrer')
                } else {
                  void Linking.openURL(part)
                }
              }}
              accessibilityRole="link"
            >
              {part}
            </Text>
          )
        }
        URL_REGEX.lastIndex = 0
        return part
      })}
    </Text>
  )
}
