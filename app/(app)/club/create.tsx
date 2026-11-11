import React, { useRef, useState } from 'react'
import { View, ScrollView, TouchableOpacity } from 'react-native'
import { Text, TextInput } from '../../../components/ui/Text'
import { toast } from '../../../lib/toast'
import { useRequireSignIn } from '../../../hooks/useRequireSignIn'
import { useRouter } from 'expo-router'
import { supabase } from '../../../lib/supabase'
import { invalidate } from '../../../lib/query'
import { routes } from '../../../utils/routes'
import { Input } from '../../../components/Input'
import { Button } from '../../../components/Button'
import { MajorCityAutocomplete } from '../../../components/MajorCityAutocomplete'
import { ClubLocationField } from '../../../components/ClubLocationField'
import { useMajorCities } from '../../../hooks/useMajorCities'
import { useSession } from '../../../contexts/session'
import { shared, theme } from '../../../constants'
import { clubLocationFromPicker, matchMajorCity } from '../../../utils/clubLocation'
import type { LocationValue, MajorCity, MembershipType } from '../../../types'

export default function CreateClubScreen() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [majorCity, setMajorCity] = useState<MajorCity | null>(null)
  const [location, setLocation] = useState<LocationValue | null>(null)
  // The metro was filled in from the location (not picked by hand), so a new location may replace it.
  const [metroFromLocation, setMetroFromLocation] = useState(false)
  const cities = useMajorCities()
  const { userId } = useSession()
  const [membershipType, setMembershipType] = useState<MembershipType>('open')
  const [submitting, setSubmitting] = useState(false)
  // Shown under each field (#228: alerts here did nothing on the web).
  const [errors, setErrors] = useState<{ name?: string; metro?: string }>({})
  const nameRef = useRef<TextInput>(null)
  const requireSignIn = useRequireSignIn()

  /** Picking a place pre-fills the metro when it's a curated city, unless the host already chose one. */
  function onLocationChange(next: LocationValue | null) {
    setLocation(next?.display ? next : null)
    if (majorCity && !metroFromLocation) return
    const match = next?.display ? matchMajorCity(next.address, cities.data ?? []) : null
    if (match) {
      setMajorCity(match)
      setMetroFromLocation(true)
    } else if (metroFromLocation) {
      setMajorCity(null)
      setMetroFromLocation(false)
    }
  }

  async function handleCreate() {
    const trimmedName = name.trim()
    const found = {
      name: trimmedName ? undefined : 'Enter a club name.',
      metro: majorCity ? undefined : 'Choose a city from the list so players can find your club.',
    }
    setErrors(found)
    if (found.name) { nameRef.current?.focus(); return }
    if (found.metro || !majorCity) return

    if (!userId) { requireSignIn(); return }
    setSubmitting(true)

    const { data, error } = await supabase
      .from('clubs')
      .insert({
        name: trimmedName,
        description: description.trim() || null,
        membership_type: membershipType,
        created_by: userId,
        major_city_id: majorCity.id,
        ...clubLocationFromPicker(location),
      })
      .select('id')
      .single()

    setSubmitting(false)

    if (error) {
      toast.error("Couldn't create the club", error)
      return
    }

    if (data?.id) {
      // The Clubs tab caches its list; the new club (and your ownership) must show up there.
      invalidate('clubs')
      router.replace(routes.club(data.id))
    }
  }

  return (
    <View style={[shared.screen, { backgroundColor: theme.colors.background }]}>
      <ScrollView
        style={shared.screen}
        contentContainerStyle={{ padding: theme.spacing.lg, paddingBottom: theme.spacing.xl * 2 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[shared.body, { color: theme.colors.subtext, marginBottom: theme.spacing.md }]}>
          Anyone can browse clubs. Open clubs let players join with one tap; invite-only clubs are visible but joining is by invitation from an owner.
        </Text>

        <Input
          ref={nameRef}
          label="Club name"
          value={name}
          onChangeText={v => { setName(v); setErrors(e => ({ ...e, name: undefined })) }}
          placeholder="e.g. Eastside Volleyball"
          autoCapitalize="words"
          error={errors.name}
          testID="club-name"
        />

        <ClubLocationField value={location} onChange={onLocationChange} userId={userId} />

        <MajorCityAutocomplete
          label="Metro area"
          value={majorCity}
          onChange={c => { setMajorCity(c); setMetroFromLocation(false); setErrors(e => ({ ...e, metro: undefined })) }}
        />
        {errors.metro ? <Text style={[shared.errorText, { marginTop: -theme.spacing.sm, marginBottom: theme.spacing.md }]} testID="club-metro-error">{errors.metro}</Text> : null}

        <Input
          label="Description (optional)"
          value={description}
          onChangeText={setDescription}
          placeholder="What makes this club different?"
          multiline
          numberOfLines={4}
        />

        <Text style={[shared.label, { marginBottom: theme.spacing.xs }]}>Who can join?</Text>
        <View style={{ flexDirection: 'row', gap: theme.spacing.sm, marginBottom: theme.spacing.lg }}>
          {([
            { value: 'open' as const, title: 'Open', subtitle: 'Anyone can join' },
            { value: 'invite' as const, title: 'Invite only', subtitle: 'Owner adds members' },
          ]).map(opt => {
            const active = membershipType === opt.value
            return (
              <TouchableOpacity
                key={opt.value}
                onPress={() => setMembershipType(opt.value)}
                style={{
                  flex: 1,
                  padding: theme.spacing.md,
                  borderRadius: theme.radius.md,
                  borderWidth: 1,
                  borderColor: active ? theme.colors.primary : theme.colors.border,
                  backgroundColor: active ? theme.colors.primary + '14' : theme.colors.card,
                }}
                activeOpacity={0.85}
              >
                <Text style={{ fontFamily: theme.fonts.bodySemiBold, fontSize: theme.font.size.md, color: theme.colors.text }}>
                  {opt.title}
                </Text>
                <Text style={{ fontSize: theme.font.size.xs, color: theme.colors.subtext, marginTop: 4 }}>{opt.subtitle}</Text>
              </TouchableOpacity>
            )
          })}
        </View>

        <Button label="Create club" onPress={() => void handleCreate()} loading={submitting} />
      </ScrollView>
    </View>
  )
}
