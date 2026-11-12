import { TouchableOpacity, View } from 'react-native'
import { Text } from './ui/Text'
import Ionicons from '@expo/vector-icons/Ionicons'
import { CREATE_MENU, shared, theme } from '../constants'
import type { CreateMenuOption } from '../constants'

type Props = {
  /** `overlay`: pills over the blurred, dimmed screen (mobile). `panel`: one card over the page (wide web, no dim). */
  variant: 'overlay' | 'panel'
  onSelect: (option: CreateMenuOption) => void
}

/**
 * The create menu's choices, grouped: "Book at a venue" (browse court time,
 * book on the venue's site) above "Create on vteam" (needs an account). Both
 * the mobile tab bar and the wide-web FAB render this; they own the open /
 * close animation and what selecting does.
 */
export function CreateMenuList({ variant, onSelect }: Props) {
  const overlay = variant === 'overlay'
  return (
    <View style={overlay ? shared.createMenuOverlay : shared.createMenuPanel} testID="create-menu">
      {CREATE_MENU.map(section => (
        <View key={section.key} style={shared.createMenuSection}>
          <Text style={[shared.createMenuCaption, overlay && shared.createMenuCaptionOverlay]} accessibilityRole="header">
            {section.title}
          </Text>
          {section.options.map(opt => (
            <TouchableOpacity
              key={opt.label}
              onPress={() => onSelect(opt)}
              accessibilityRole="button"
              accessibilityLabel={opt.label}
              testID={`create-menu-${section.key}-${opt.label.toLowerCase().replace(/\s+/g, '-')}`}
              style={[shared.createMenuPill, overlay ? shared.createMenuPillOverlay : shared.createMenuPillPanel]}
            >
              <Ionicons name={opt.icon} size={17} color={section.key === 'venue' ? theme.colors.accent : theme.colors.text} />
              <Text style={shared.createMenuLabel}>{opt.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ))}
    </View>
  )
}
