/**
 * Teams and match details remembered on the device, so the next match's setup is a tap: a team
 * comes back with its starting six (in order) and its bench, and the competition / hall / court /
 * officials carry over to the next match the same day. AsyncStorage (localStorage on web).
 * Best effort: a failed read or write never blocks scoring.
 */
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { MatchInfo, RosterPlayer, SavedMatchInfo, SavedTeam } from '../../types/scoresheet'

const TEAMS_KEY = 'vteam.scoresheet.teams'
const INFO_KEY = 'vteam.scoresheet.lastInfo'
export const MAX_SAVED_TEAMS = 24

const keyOf = (name: string) => name.trim().toLowerCase()

function parseTeams(raw: string | null): SavedTeam[] {
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : []
    if (!Array.isArray(parsed)) return []
    return parsed.filter((t): t is SavedTeam => !!t && typeof t.name === 'string' && Array.isArray(t.court) && Array.isArray(t.bench))
  } catch {
    return []
  }
}

/** Adds or refreshes teams (matched by name), newest first, keeping the most recent. */
export function mergeTeams(existing: SavedTeam[], incoming: SavedTeam[]): SavedTeam[] {
  const names = new Set(incoming.map(t => keyOf(t.name)))
  return [...incoming, ...existing.filter(t => !names.has(keyOf(t.name)))]
    .filter(t => t.name.trim() && !/^Team [AB]$/.test(t.name.trim()))
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_SAVED_TEAMS)
}

export async function loadSavedTeams(): Promise<SavedTeam[]> {
  try {
    return parseTeams(await AsyncStorage.getItem(TEAMS_KEY))
  } catch {
    return []
  }
}

export async function rememberTeams(teams: { name: string; court: RosterPlayer[]; bench: RosterPlayer[] }[], now = Date.now()): Promise<void> {
  try {
    const existing = await loadSavedTeams()
    await AsyncStorage.setItem(TEAMS_KEY, JSON.stringify(mergeTeams(existing, teams.map(t => ({ ...t, updatedAt: now })))))
  } catch {
    // Remembering is a convenience.
  }
}

export async function forgetTeam(name: string): Promise<SavedTeam[]> {
  const next = (await loadSavedTeams()).filter(t => keyOf(t.name) !== keyOf(name))
  try {
    await AsyncStorage.setItem(TEAMS_KEY, JSON.stringify(next))
  } catch {
    // Ignore.
  }
  return next
}

/** Details worth carrying to the next match (not the date, match number or gender of this one). */
export function carryOver(info: MatchInfo): MatchInfo {
  const { competition, division, city, hall, court, firstReferee, secondReferee, scorer } = info
  return Object.fromEntries(Object.entries({ competition, division, city, hall, court, firstReferee, secondReferee, scorer }).filter(([, v]) => v && String(v).trim())) as MatchInfo
}

export async function rememberInfo(info: MatchInfo, now = Date.now()): Promise<void> {
  const kept = carryOver(info)
  if (!Object.keys(kept).length) return
  try {
    await AsyncStorage.setItem(INFO_KEY, JSON.stringify({ info: kept, savedAt: now } satisfies SavedMatchInfo))
  } catch {
    // Ignore.
  }
}

/** Last match's details, if they were saved on the same calendar day. */
export async function loadTodaysInfo(now = Date.now()): Promise<MatchInfo | null> {
  try {
    const raw = await AsyncStorage.getItem(INFO_KEY)
    const saved = raw ? (JSON.parse(raw) as SavedMatchInfo) : null
    if (!saved?.info || typeof saved.savedAt !== 'number') return null
    return new Date(saved.savedAt).toDateString() === new Date(now).toDateString() ? saved.info : null
  } catch {
    return null
  }
}
