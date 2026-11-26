import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { Image } from 'expo-image'
import { Text } from '../ui/Text'
import { Spinner } from '../ui/Spinner'
import { theme } from '../../constants'
import { CLUB_TILE_COLORS } from '../../constants/theme'
import { resolveClubAvatarUri } from '../../utils'
import { useRequireSignIn } from '../../hooks/useRequireSignIn'
import { useClubMembership } from '../../hooks/club/useClubMembership'
import type { ClubListItem, MajorCity } from '../../types'

/** PostgREST usually returns one embedded row as an object; normalize if it ever comes back as a single-element array. */
export function resolvedMajorCity(c: ClubListItem): MajorCity | null {
  const raw = c.major_cities as unknown
  if (raw == null) return null
  if (Array.isArray(raw)) return (raw[0] as MajorCity | undefined) ?? null
  return raw as MajorCity
}

export function memberCount(club: ClubListItem): number {
  return Number(club.club_members?.[0]?.count ?? 0)
}

/** "SS" for Sand Sharks ATX, "E" for Eastside: up to two initials. */
export function clubInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(w => /^[A-Za-z0-9]/.test(w))
  return words.slice(0, 2).map(w => w[0]!.toUpperCase()).join('') || '?'
}

/** The same fill for a club (or a person without a photo) everywhere, from its name. */
export function nameColor(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff
  return CLUB_TILE_COLORS[Math.abs(h) % CLUB_TILE_COLORS.length]
}

/** A picture, or the name's initials on the name's colour: rounded square (clubs) or, with radius size / 2, a circle (people). */
export function InitialsTile({ name, uri, size, radius }: { name: string; uri: string | null; size: number; radius: number }) {
  const initialsSize = size > TILE / 2 ? theme.font.heading.hero : theme.font.heading.sm
  return (
    <View style={{ width: size, height: size, borderRadius: radius, overflow: 'hidden', flexShrink: 0, backgroundColor: nameColor(name), alignItems: 'center', justifyContent: 'center' }}>
      {uri ? (
        <Image source={{ uri }} style={{ width: size, height: size }} contentFit="cover" transition={150} />
      ) : (
        <Text style={{ fontFamily: theme.fonts.display, fontSize: initialsSize, color: theme.colors.white }} maxFontSizeMultiplier={1}>
          {clubInitials(name)}
        </Text>
      )}
    </View>
  )
}

/** The club's picture (resolved from storage), or its initials on its colour, as a rounded square. */
export function ClubAvatarTile({ club, size, radius }: { club: Pick<ClubListItem, 'name' | 'avatar_url'>; size: number; radius: number }) {
  const [uri, setUri] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    resolveClubAvatarUri(club.avatar_url).then(u => { if (!cancelled) setUri(u) })
    return () => { cancelled = true }
  }, [club.avatar_url])
  return <InitialsTile name={club.name} uri={uri} size={size} radius={radius} />
}

/** One of your clubs: a big tile, its name, and your role or its size. */
export function ClubTile({ club, owner, onPress }: { club: ClubListItem; owner: boolean; onPress: () => void }) {
  const count = memberCount(club)
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel={club.name}
      testID={`club-tile-${club.id}`}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [styles.tile, (pressed || hovered) && { opacity: 0.85 }]}
    >
      <ClubAvatarTile club={club} size={TILE} radius={28} />
      <Text style={styles.tileName} numberOfLines={2}>{club.name}</Text>
      <Text style={styles.tileMeta} numberOfLines={1}>{owner ? 'You run it' : `${count} ${count === 1 ? 'member' : 'members'}`}</Text>
    </Pressable>
  )
}

const TILE = 104

type RowProps = {
  club: ClubListItem
  userId: string | null
  /** Cache key of the list this row is in (the join updates it optimistically). */
  listKey: string
  isMember: boolean
  isOwner: boolean
  onPress: () => void
}

/** A club to find or join: tile, name, size and city, and Join (or Joined). */
export function ClubRow({ club, userId, listKey, isMember, isOwner, onPress }: RowProps) {
  const requireSignIn = useRequireSignIn()
  // One mutation per row, so joining two clubs in a row never drops the second tap (#305).
  const join = useClubMembership(club.id, { listKey, listClub: club })
  const count = memberCount(club)
  const city = resolvedMajorCity(club)?.display_name

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel={club.name}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [styles.row, (pressed || hovered) && { opacity: 0.9 }]}
    >
      <ClubAvatarTile club={club} size={52} radius={16} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.rowName} numberOfLines={1}>{club.name}</Text>
        <Text style={styles.rowMeta} numberOfLines={1}>
          {[`${count} ${count === 1 ? 'member' : 'members'}`, city, isOwner ? 'Owner' : null].filter(Boolean).join(' · ')}
        </Text>
      </View>
      {isMember ? (
        <View style={styles.joined}>
          <Text style={styles.joinedText}>Joined</Text>
        </View>
      ) : (
        <Pressable
          onPress={e => {
            e.stopPropagation?.()
            if (!userId) { requireSignIn(); return }
            void join.mutate('join')
          }}
          disabled={join.isPending}
          accessibilityRole="button"
          accessibilityLabel={`Join ${club.name}`}
          hitSlop={4}
          style={({ hovered }: { pressed: boolean; hovered?: boolean }) => [styles.join, hovered && styles.joinHover, join.isPending && { opacity: 0.6 }]}
        >
          {join.isPending ? <Spinner size="small" color={theme.colors.primaryText} /> : <Text style={styles.joinText}>Join</Text>}
        </Pressable>
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  tile: { width: TILE, gap: 6 },
  tileName: { fontFamily: theme.fonts.bodySemiBold, fontSize: theme.font.size.smd, color: theme.colors.text, lineHeight: 17 },
  tileMeta: { fontFamily: theme.fonts.bodyMedium, fontSize: theme.font.size.xs, color: theme.colors.primaryText },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    marginBottom: 10,
    borderRadius: 22,
    backgroundColor: theme.colors.card,
    ...theme.shadow.card,
  },
  rowName: { fontFamily: theme.fonts.display, fontSize: theme.font.size.base, letterSpacing: -0.3, color: theme.colors.text },
  rowMeta: { fontFamily: theme.fonts.body, fontSize: theme.font.size.sm, color: theme.colors.subtext },
  join: { minHeight: 40, minWidth: 64, paddingHorizontal: 16, borderRadius: theme.radius.full, backgroundColor: theme.colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  joinHover: { backgroundColor: theme.colors.primary + '33' },
  joinText: { fontFamily: theme.fonts.bodyBold, fontSize: theme.font.size.smd, color: theme.colors.primaryText },
  joined: { minHeight: 32, paddingHorizontal: 12, borderRadius: theme.radius.full, backgroundColor: theme.colors.cool + '1F', alignItems: 'center', justifyContent: 'center' },
  joinedText: { fontFamily: theme.fonts.bodySemiBold, fontSize: theme.font.size.sm, color: theme.colors.cool },
})
