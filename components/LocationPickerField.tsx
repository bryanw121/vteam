import React, { useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Modal,
  Platform,
  ScrollView,
  TouchableOpacity,
  View,
} from 'react-native'
import type { StyleProp, ViewStyle } from 'react-native'
import { Text, TextInput } from './ui/Text'
import Ionicons from '@expo/vector-icons/Ionicons'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from '../lib/supabase'
import { theme } from '../constants'
import { LOCATIONS } from '../constants/events'
import { formatVenueDisplay } from '../utils'
import { placeAddress } from '../utils/clubLocation'
import type { GooglePlacePrediction, LocationValue } from '../types'

// ─── Types ────────────────────────────────────────────────────────────────────

type GooglePrediction = GooglePlacePrediction

type Props = {
  value: LocationValue | null
  onChange: (loc: LocationValue) => void
  userId: string | null
  recentVenues?: LocationValue[]
  /** Trigger text when nothing is chosen. */
  placeholder?: string
  /** Hide the curated "Other" pseudo-venue (it has no address; meaningless outside the event form). */
  hideOtherVenue?: boolean
  /** Extra style for the trigger row, e.g. to make it look and tap like a form input. */
  triggerStyle?: StyleProp<ViewStyle>
}

// ─── Config ───────────────────────────────────────────────────────────────────

const CACHE_V     = 'v3'
const CACHE_TTL   = 24 * 60 * 60 * 1000 // 24 hours
const MIN_LEN     = 3
const DEBOUNCE_MS = 600

// Module-level session cache — survives re-mounts, cleared on app restart
const sessionCache = new Map<string, GooglePrediction[]>()

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getCached(key: string): Promise<GooglePrediction[] | null> {
  if (sessionCache.has(key)) return sessionCache.get(key)!
  try {
    const raw = await AsyncStorage.getItem(`gmaps:${CACHE_V}:${key}`)
    if (!raw) return null
    const { data, ts } = JSON.parse(raw) as { data: GooglePrediction[]; ts: number }
    if (Date.now() - ts > CACHE_TTL) return null
    sessionCache.set(key, data)
    return data
  } catch {
    return null
  }
}

async function setCache(key: string, data: GooglePrediction[]) {
  sessionCache.set(key, data)
  try {
    await AsyncStorage.setItem(`gmaps:${CACHE_V}:${key}`, JSON.stringify({ data, ts: Date.now() }))
  } catch {}
}

function newSessionToken() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

async function callProxy(body: Record<string, string>): Promise<unknown> {
  const { data, error } = await supabase.functions.invoke('places-proxy', { body })
  if (error) throw error
  return data
}

async function autocomplete(q: string, sessionToken: string): Promise<GooglePrediction[]> {
  const cacheKey = q.toLowerCase().trim()
  const cached = await getCached(cacheKey)
  if (cached) return cached // cached — no API call, session token not consumed

  const json = await callProxy({ action: 'autocomplete', input: q, sessiontoken: sessionToken }) as { predictions?: GooglePrediction[] }
  const data = json.predictions ?? []
  await setCache(cacheKey, data)
  return data
}

async function getPlaceCoords(placeId: string, sessionToken: string): Promise<{ lat: number; lng: number } | null> {
  // Passing the same sessionToken closes the session — autocomplete + details billed as one
  const json = await callProxy({ action: 'details', place_id: placeId, sessiontoken: sessionToken }) as { result?: { geometry?: { location?: { lat: number; lng: number } } } }
  return json.result?.geometry?.location ?? null
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({ label }: { label: string }) {
  return (
    <Text style={{
      fontFamily: theme.fonts.bodySemiBold,
      fontSize: theme.font.size.xs,
      color: theme.colors.subtext,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
      paddingHorizontal: 16,
      marginTop: 20,
      marginBottom: 4,
    }}>
      {label}
    </Text>
  )
}

function ResultRow({
  icon, title, subtitle, onPress, testID,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name']
  title: string
  subtitle?: string
  onPress: () => void
  testID?: string
}) {
  return (
    <TouchableOpacity
      testID={testID}
      onPress={onPress}
      activeOpacity={0.7}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 12,
        paddingHorizontal: 16, paddingVertical: 12,
        borderBottomWidth: 1, borderBottomColor: theme.colors.border + '50',
      }}
    >
      <View style={{
        width: 36, height: 36, borderRadius: 10,
        backgroundColor: theme.colors.primarySoft,
        alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <Ionicons name={icon} size={18} color={theme.colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text
          style={{ fontFamily: theme.fonts.bodySemiBold, fontSize: theme.font.size.md, color: theme.colors.text }}
          numberOfLines={1}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text
            style={{ fontFamily: theme.fonts.body, fontSize: theme.font.size.sm, color: theme.colors.subtext, marginTop: 1 }}
            numberOfLines={1}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
    </TouchableOpacity>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function LocationPickerField({ value, onChange, recentVenues = [], placeholder = 'Search for a venue…', hideOtherVenue = false, triggerStyle }: Props) {
  const [open, setOpen]           = useState(false)
  const [query, setQuery]         = useState('')
  const [results, setResults]     = useState<GooglePrediction[]>([])
  const [loading, setLoading]     = useState(false)
  const [selecting, setSelecting] = useState(false)
  const debounceRef               = useRef<ReturnType<typeof setTimeout> | null>(null)
  // One session token per modal open — groups all autocomplete + final details into one billing session
  const sessionTokenRef           = useRef<string>(newSessionToken())
  // Monotonic id of the most recently *issued* search. A slower earlier request
  // must not overwrite a newer one's results — the picker fires on a 600ms
  // debounce over a live network, so responses can land out of order and leave
  // the list showing predictions for a query the user already moved past.
  const searchSeqRef              = useRef(0)

  // Debounced autocomplete
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (query.length < MIN_LEN) {
      searchSeqRef.current += 1 // invalidate anything in flight
      setResults([])
      return
    }

    debounceRef.current = setTimeout(async () => {
      const seq = ++searchSeqRef.current
      setLoading(true)
      try {
        const data = await autocomplete(query, sessionTokenRef.current)
        if (seq !== searchSeqRef.current) return // superseded — drop the stale response
        setResults(data)
      } catch {
        if (seq !== searchSeqRef.current) return
        setResults([])
      } finally {
        if (seq === searchSeqRef.current) setLoading(false)
      }
    }, DEBOUNCE_MS)

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query])

  function close() {
    setOpen(false)
    setQuery('')
    setResults([])
  }

  function openSheet() {
    sessionTokenRef.current = newSessionToken() // fresh session each time modal opens
    setOpen(true)
  }

  async function selectPrediction(prediction: GooglePrediction) {
    setSelecting(true)
    const token = sessionTokenRef.current
    try {
      const coords = await getPlaceCoords(prediction.place_id, token)
      onChange({
        display: formatVenueDisplay(prediction),
        latitude: coords?.lat ?? null,
        longitude: coords?.lng ?? null,
        name: prediction.structured_formatting.main_text?.trim() || prediction.description,
        address: placeAddress(prediction),
        placeId: prediction.place_id,
      })
    } finally {
      setSelecting(false)
      close()
    }
  }

  function selectDirect(loc: LocationValue) {
    onChange(loc)
    close()
  }

  function clear() {
    onChange({ display: '', latitude: null, longitude: null })
  }

  const filteredCommon = LOCATIONS.filter(loc =>
    (!hideOtherVenue || loc.address) &&
    (!query || loc.label.toLowerCase().includes(query.toLowerCase())),
  )

  const hasContent = recentVenues.length > 0 || filteredCommon.length > 0 || results.length > 0

  return (
    <>
      {/* ── Trigger ── */}
      <TouchableOpacity testID="location-picker-trigger" onPress={openSheet} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={value?.display || placeholder} style={[{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 }, triggerStyle]}>
        <Ionicons
          name="location-outline"
          size={16}
          color={value?.display ? theme.colors.text : theme.colors.subtext}
        />
        <Text style={{
          flex: 1,
          fontFamily: theme.fonts.body,
          fontSize: theme.font.size.lgs,
          color: value?.display ? theme.colors.text : theme.colors.subtext,
          fontWeight: '500',
        }}>
          {value?.display || placeholder}
        </Text>
        {value?.display ? (
          <TouchableOpacity hitSlop={8} onPress={clear}>
            <Ionicons name="close-circle" size={18} color={theme.colors.subtext} />
          </TouchableOpacity>
        ) : (
          <Ionicons name="chevron-forward" size={14} color={theme.colors.subtext} />
        )}
      </TouchableOpacity>

      {/* ── Sheet ── */}
      <Modal
        visible={open}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={close}
      >
        <View style={{ flex: 1, backgroundColor: theme.colors.background }}>

          {/* Search bar */}
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 12,
            padding: 16, paddingTop: 20,
            borderBottomWidth: 1, borderBottomColor: theme.colors.border,
          }}>
            <View style={{
              flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
              backgroundColor: theme.colors.card,
              borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10,
              borderWidth: 1, borderColor: theme.colors.border,
            }}>
              <Ionicons name="search-outline" size={16} color={theme.colors.subtext} />
              <TextInput
                testID="location-picker-input"
                autoFocus
                value={query}
                onChangeText={setQuery}
                placeholder="Search venues…"
                placeholderTextColor={theme.colors.subtext}
                autoCapitalize="none"
                autoCorrect={false}
                style={{
                  flex: 1,
                  fontFamily: theme.fonts.body,
                  fontSize: theme.font.size.lgs,
                  color: theme.colors.text,
                  ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}),
                }}
              />
              {loading || selecting
                ? <ActivityIndicator size="small" color={theme.colors.primary} />
                : query.length > 0
                  ? <TouchableOpacity hitSlop={8} onPress={() => setQuery('')}>
                      <Ionicons name="close-circle" size={16} color={theme.colors.subtext} />
                    </TouchableOpacity>
                  : null}
            </View>
            <TouchableOpacity onPress={close} hitSlop={8}>
              <Text style={{ fontFamily: theme.fonts.bodySemiBold, fontSize: theme.font.size.md, color: theme.colors.primary }}>
                Cancel
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" style={{ flex: 1 }}>

            {/* Recent venues */}
            {recentVenues.length > 0 && (
              <>
                <SectionHeader label="Recent" />
                {recentVenues.map((v, i) => (
                  <ResultRow
                    key={i}
                    testID={`location-result-recent-${v.display}`}
                    icon="time-outline"
                    title={v.display}
                    onPress={() => selectDirect(v)}
                  />
                ))}
              </>
            )}

            {/* Common venues (LOCATIONS constant) */}
            {filteredCommon.length > 0 && (
              <>
                <SectionHeader label="Common Venues" />
                {filteredCommon.map(loc => (
                  <ResultRow
                    key={loc.id}
                    testID={`location-result-common-${loc.id}`}
                    icon="business-outline"
                    title={loc.label}
                    subtitle={loc.address}
                    onPress={() => selectDirect({ display: loc.label, latitude: null, longitude: null, name: loc.label, address: loc.address ?? null, placeId: null })}
                  />
                ))}
              </>
            )}

            {/* Google Places results */}
            {results.length > 0 && (
              <>
                <SectionHeader label="Search Results" />
                {results.map(p => (
                  <ResultRow
                    key={p.place_id}
                    testID={`location-result-google-${p.place_id}`}
                    icon="location-outline"
                    title={p.structured_formatting.main_text}
                    subtitle={p.structured_formatting.secondary_text}
                    onPress={() => void selectPrediction(p)}
                  />
                ))}
              </>
            )}

            {/* Empty state */}
            {query.length >= MIN_LEN && !loading && !hasContent && (
              <Text style={{ textAlign: 'center', color: theme.colors.subtext, fontSize: theme.font.size.smd, padding: 32 }}>
                No venues found
              </Text>
            )}

            {/* Prompt when nothing typed yet */}
            {query.length === 0 && !hasContent && (
              <Text style={{ textAlign: 'center', color: theme.colors.subtext, fontSize: theme.font.size.smd, padding: 32 }}>
                Type to search for a venue
              </Text>
            )}

          </ScrollView>
        </View>
      </Modal>
    </>
  )
}
