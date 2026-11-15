import { TouchableOpacity, View } from 'react-native'
import { Text, TextInput } from '../ui/Text'
import { Spinner } from '../ui/Spinner'
import { MajorCityAutocomplete } from '../MajorCityAutocomplete'
import { ClubLocationField } from '../ClubLocationField'
import { shared, theme } from '../../constants'
import type { ClubEditFormProps } from '../../types'

/** The owner's edit card: name, description, home court and metro, with errors under the fields. */
export function ClubEditForm({ form, errors, saving, userId, nameRef, onChange, onSave }: ClubEditFormProps) {
  return (
    <View style={[shared.card, { gap: theme.spacing.md, marginBottom: theme.spacing.md }]}>
      <Text style={shared.subheading}>Edit Club</Text>
      <View>
        <Text style={shared.label}>Name</Text>
        <TextInput
          ref={nameRef}
          value={form.name}
          onChangeText={name => onChange({ name })}
          style={[shared.input, errors.name ? { borderColor: theme.colors.error } : null]}
          placeholder="Club name"
          placeholderTextColor={theme.colors.subtext}
          accessibilityLabel="Club name"
          testID="club-edit-name"
        />
        {errors.name ? <Text style={[shared.errorText, shared.mt_sm]}>{errors.name}</Text> : null}
      </View>
      <View>
        <Text style={shared.label}>Description</Text>
        <TextInput
          value={form.description}
          onChangeText={description => onChange({ description })}
          style={[shared.input, shared.inputMultiline]}
          placeholder="What is this club about?"
          placeholderTextColor={theme.colors.subtext}
          multiline
          numberOfLines={4}
        />
      </View>
      <ClubLocationField value={form.location} onChange={location => onChange({ location })} userId={userId} />
      <View>
        <MajorCityAutocomplete label="Metro area" value={form.majorCity} onChange={majorCity => onChange({ majorCity })} />
        {errors.metro ? <Text style={shared.errorText}>{errors.metro}</Text> : null}
      </View>
      <TouchableOpacity onPress={onSave} disabled={saving} style={[shared.buttonBase, shared.buttonPrimary, saving && shared.buttonDisabled]} accessibilityRole="button" testID="club-edit-save">
        {saving ? <Spinner color={theme.colors.white} /> : <Text style={shared.buttonLabelPrimary}>Save changes</Text>}
      </TouchableOpacity>
    </View>
  )
}
