import { useCallback, useMemo, useRef, useState } from 'react'
import { STALE } from '../../constants/cache'
import { getQueryData, setQueryData, useFocusRefetch, useQuery } from '../../lib/query'
import { withOlderPage } from '../../utils/commentPages'
import type { MentionUser, TournamentCommentsPage, TournamentTeamWithRoster } from '../../types'
import {
  fetchComments, fetchCommentsPage, fetchMatches, fetchMyRegistration, fetchPools, fetchPublicTournament, fetchTeams,
  fetchTournamentCore, tournamentKeys,
} from './api'

/** @-mention candidates: everyone on a roster, once each. */
export function mentionableFromTeams(teams: readonly TournamentTeamWithRoster[]): MentionUser[] {
  const users: MentionUser[] = []
  const seen = new Set<string>()
  for (const team of teams) {
    for (const m of team.members) {
      const p = m.profiles
      if (p && !seen.has(p.id)) {
        seen.add(p.id)
        users.push({
          id: p.id,
          username: p.username,
          displayName: [p.first_name, p.last_name].filter(Boolean).join(' ') || p.username,
        })
      }
    }
  }
  return users
}

/**
 * Everything the tournament detail screen reads, as independent cached queries.
 * They all depend only on the route id (and the signed-in user, from the session
 * context — no network hop), so they start together in one request round:
 *   core (tournament + rules + prizes), teams, comments, the viewer's registration
 *   (+ invites + join requests + name), and — once the Schedule or Results tab
 *   has been opened — matches and pools.
 */
export function useTournamentData(id: string, userId: string | null, opts: { loadMatches: boolean }) {
  const core = useQuery(tournamentKeys.core(id), () => fetchTournamentCore(id), { staleMs: STALE.detail })
  // The tables answer members only. When they hold nothing for this viewer (a
  // guest, or a player outside the club), the public copy fills the page (#282).
  const hidden = !!core.data && !core.data.tournament
  const pub = useQuery(tournamentKeys.public(id), () => fetchPublicTournament(id), { staleMs: STALE.detail, enabled: hidden })
  const publicView = hidden ? pub.data ?? null : null
  const teams = useQuery(tournamentKeys.teams(id), () => fetchTeams(id), { staleMs: STALE.detail })
  const comments = useQuery(tournamentKeys.comments(id), () => fetchComments(id), { staleMs: STALE.detail })
  const mine = useQuery(
    tournamentKeys.mine(id, userId),
    () => fetchMyRegistration(id, userId as string),
    { staleMs: STALE.detail, enabled: !!userId },
  )
  const matches = useQuery(tournamentKeys.matches(id), () => fetchMatches(id), {
    staleMs: STALE.detail,
    enabled: opts.loadMatches,
  })

  // Pools load with the matches (the Schedule and Results tabs both need them).
  const pools = useQuery(tournamentKeys.pools(id), () => fetchPools(id), {
    staleMs: STALE.detail,
    enabled: opts.loadMatches,
  })

  useFocusRefetch(tournamentKeys.core(id))
  useFocusRefetch(hidden ? tournamentKeys.public(id) : null)
  useFocusRefetch(tournamentKeys.teams(id))
  useFocusRefetch(tournamentKeys.comments(id))
  useFocusRefetch(userId ? tournamentKeys.mine(id, userId) : null)
  useFocusRefetch(opts.loadMatches ? tournamentKeys.matches(id) : null)
  useFocusRefetch(opts.loadMatches ? tournamentKeys.pools(id) : null)

  const teamList = publicView ? publicView.teams : teams.data
  const mentionableUsers = useMemo(() => mentionableFromTeams(teamList ?? []), [teamList])

  // "Load earlier": the page before the oldest loaded comment, merged into
  // whatever is cached when it lands (a write's refetch may have replaced it).
  const [loadingEarlierComments, setLoadingEarlier] = useState(false)
  const loadingEarlierRef = useRef(false)
  const loadEarlierComments = useCallback(async () => {
    const page = getQueryData<TournamentCommentsPage>(tournamentKeys.comments(id))
    if (!page?.hasEarlier || !page.cursor || loadingEarlierRef.current) return
    loadingEarlierRef.current = true
    setLoadingEarlier(true)
    try {
      const older = await fetchCommentsPage(id, page.cursor)
      setQueryData<TournamentCommentsPage>(tournamentKeys.comments(id), prev => withOlderPage(prev ?? page, older))
    } catch (e) {
      console.warn('[useTournamentData] load earlier comments', (e as { message?: string })?.message)
    } finally {
      loadingEarlierRef.current = false
      setLoadingEarlier(false)
    }
  }, [id])

  const shown = useMemo(() => {
    if (!hidden) return null
    // Still asking for the public copy: keep the page on its spinner, not on "not found".
    const asking = pub.data === undefined && !pub.error
    const waiting = { isLoading: asking, error: pub.error, refetch: pub.refetch }
    return {
      core: { ...core, ...waiting, data: publicView ? { tournament: publicView.tournament, rules: core.data?.rules ?? null, prizes: core.data?.prizes ?? [] } : (pub.data === undefined ? undefined : core.data) },
      teams: { ...teams, ...waiting, data: publicView?.teams },
      matches: { ...matches, ...waiting, data: publicView?.matches },
      pools: { ...pools, ...waiting, data: publicView?.pools },
    }
  }, [hidden, publicView, pub.data, pub.error, pub.refetch, core, teams, matches, pools])

  return {
    core: shown?.core ?? core, teams: shown?.teams ?? teams, comments, mine,
    matches: shown?.matches ?? matches, pools: shown?.pools ?? pools,
    /** Set when the page is the public copy: read-only, with the club to join. */
    publicView,
    mentionableUsers, loadEarlierComments, loadingEarlierComments,
  }
}
