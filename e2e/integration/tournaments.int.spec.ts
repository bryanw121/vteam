/**
 * A whole tournament on the server, the way the organizer's screens drive it:
 * create (save_tournament), prizes, register two teams with a roster, invite a
 * player, comment, publish a pool schedule (replace_tournament_schedule), record
 * a result, finish with a podium (complete_tournament) and the trophy it writes,
 * and the public read guests get (get_public_tournament). Everything hangs off a
 * run-tagged club, so deleting the club removes it all.
 */
import { test, expect } from '@playwright/test'
import { BUDDY_ID, RUN, daysFromNow, ok, refused, signIn, sweep, type Me } from './helpers'

/** This file's rows (see sweep). */
const MINE = `${RUN} tournaments`

test.describe.configure({ mode: 'serial' })

let me: Me
let clubId = ''
let tid = ''
let teamA = ''
let teamB = ''
let matchId = ''
const TITLE = `${MINE} Cup`

test.beforeAll(async () => {
  me = await signIn()
  await sweep(me, 'clubs', 'name', 'created_by', MINE)
  const city = await ok('a city', () => me.db.from('major_cities').select('id').limit(1).single()) as { id: string }
  const club = await ok('club', () => me.db.from('clubs').insert({ name: `${MINE} Tournament Club`, created_by: me.id, major_city_id: city.id, membership_type: 'open' }).select('id').single()) as { id: string }
  clubId = club.id
})
test.afterAll(async () => {
  if (me) await sweep(me, 'clubs', 'name', 'created_by', MINE, false)
  await me?.db.auth.signOut({ scope: 'local' })
})

test('create: save_tournament writes the tournament and its rules together', async () => {
  tid = await ok('save_tournament', () => me.db.rpc('save_tournament', {
    p_tournament: { title: TITLE, club_id: clubId, start_date: daysFromNow(10, 15), status: 'published', format: 'pool_play', max_teams: 8, min_roster_size: 1, max_roster_size: 6 },
    p_rules: { winning_score: 21, sets_to_win: 1 },
  } as never)) as string
  const row = await ok('read back', () => me.db.from('tournaments').select('title, status, club_id, tournament_rules(winning_score, sets_to_win)').eq('id', tid).single()) as {
    title: string; status: string; club_id: string; tournament_rules: { winning_score: number; sets_to_win: number } | { winning_score: number; sets_to_win: number }[]
  }
  expect(row).toMatchObject({ title: TITLE, status: 'published', club_id: clubId })
  const rules = Array.isArray(row.tournament_rules) ? row.tournament_rules[0] : row.tournament_rules
  expect(rules).toMatchObject({ winning_score: 21, sets_to_win: 1 })
})

test('prizes: the organizer adds one', async () => {
  test.skip(!tid)
  await ok('prize', () => me.db.from('tournament_prizes').insert({ tournament_id: tid, place_label: '1st', description: 'Trophy', display_order: 1 }))
  const prizes = await ok('read prizes', () => me.db.from('tournament_prizes').select('place_label').eq('tournament_id', tid))
  expect((prizes as { place_label: string }[]).map(p => p.place_label)).toEqual(['1st'])
})

test('register: a team I captain (with me on the roster) and a second team', async () => {
  test.skip(!tid)
  const a = await ok('team A', () => me.db.from('tournament_teams').insert({ tournament_id: tid, name: `${MINE} Diggers`, captain_user_id: me.id, status: 'registered', is_approved: true }).select('id').single()) as { id: string }
  teamA = a.id
  await ok('me on team A', () => me.db.from('tournament_team_members').insert({ team_id: teamA, user_id: me.id, is_captain: true }))
  const b = await ok('team B', () => me.db.from('tournament_teams').insert({ tournament_id: tid, name: `${MINE} Rivals`, status: 'registered', is_approved: true }).select('id').single()) as { id: string }
  teamB = b.id
  const teams = await ok('teams', () => me.db.from('tournament_teams').select('id').eq('tournament_id', tid))
  expect(teams).toHaveLength(2)
})

test('invite buddy to my team, then withdraw the invite', async () => {
  test.skip(!teamA)
  const inv = await ok('invite', () => me.db.from('tournament_team_invitations').insert({ tournament_id: tid, team_id: teamA, inviter_id: me.id, invitee_id: BUDDY_ID }).select('id, status').single()) as { id: string; status: string }
  expect(inv.status).toBe('pending')
  await refused("accept someone else's invite", () => me.db.rpc('accept_tournament_invite', { p_invite_id: inv.id }))
  await ok('withdraw', () => me.db.from('tournament_team_invitations').delete().eq('id', inv.id))
})

test('discussion: post and read a comment', async () => {
  test.skip(!tid)
  await ok('comment', () => me.db.from('tournament_comments').insert({ tournament_id: tid, user_id: me.id, body: `${MINE} check-in at 8:30` }))
  const list = await ok('read', () => me.db.from('tournament_comments').select('body').eq('tournament_id', tid))
  expect((list as { body: string }[]).map(c => c.body)).toContain(`${MINE} check-in at 8:30`)
})

test('schedule: one pool with both teams and their game', async () => {
  test.skip(!teamB)
  const count = await ok('replace_tournament_schedule', () => me.db.rpc('replace_tournament_schedule', {
    p_tournament_id: tid,
    p_pools: [{ key: 'A', name: 'Pool A', display_order: 0, team_ids: [teamA, teamB] }],
    p_matches: [{ pool_key: 'A', stage: 'pool_play', round: 1, match_number: 1, team_a_id: teamA, team_b_id: teamB, court: '1', scheduled_at: daysFromNow(10, 15) }],
  }))
  expect(count).toBe(1)
  const m = await ok('the match', () => me.db.from('tournament_matches').select('id, pool_id, status').eq('tournament_id', tid).single()) as { id: string; pool_id: string | null; status: string }
  expect(m.pool_id).not.toBeNull()
  expect(m.status).toBe('scheduled')
  matchId = m.id
  // Running it again starts over rather than doubling up.
  await ok('again', () => me.db.rpc('replace_tournament_schedule', {
    p_tournament_id: tid,
    p_pools: [{ key: 'A', name: 'Pool A', display_order: 0, team_ids: [teamA, teamB] }],
    p_matches: [{ pool_key: 'A', stage: 'pool_play', round: 1, match_number: 1, team_a_id: teamA, team_b_id: teamB, court: '1', scheduled_at: daysFromNow(10, 15) }],
  }))
  const after = await ok('matches', () => me.db.from('tournament_matches').select('id').eq('tournament_id', tid)) as { id: string }[]
  expect(after).toHaveLength(1)
  matchId = after[0].id
})

test('record a result: the set score and the winner, as the result sheet saves them', async () => {
  test.skip(!matchId)
  await ok('set', () => me.db.from('tournament_sets').insert({ match_id: matchId, set_number: 1, team_a_score: 21, team_b_score: 17, completed_at: new Date().toISOString() }))
  await ok('winner', () => me.db.from('tournament_matches').update({ winner_id: teamA, status: 'completed' }).eq('id', matchId))
  const m = await ok('read', () => me.db.from('tournament_matches').select('winner_id, status, tournament_sets(team_a_score, team_b_score)').eq('id', matchId).single()) as {
    winner_id: string; status: string; tournament_sets: { team_a_score: number; team_b_score: number }[]
  }
  expect(m).toMatchObject({ winner_id: teamA, status: 'completed' })
  expect(m.tournament_sets).toEqual([{ team_a_score: 21, team_b_score: 17 }])
})

test('finish: complete_tournament sets the podium, and my team wins me a trophy', async () => {
  test.skip(!matchId)
  await ok('complete_tournament', () => me.db.rpc('complete_tournament', { p_tournament_id: tid, p_podium: [{ team_id: teamA, place: 1 }, { team_id: teamB, place: 2 }] }))
  const t = await ok('status', () => me.db.from('tournaments').select('status').eq('id', tid).single())
  expect((t as { status: string }).status).toBe('completed')
  const trophies = await ok('trophies', () => me.db.from('tournament_trophies').select('place, tournament_title').eq('tournament_id', tid).eq('user_id', me.id))
  expect(trophies).toEqual([{ place: 1, tournament_title: TITLE }])
})

test('guests read it through get_public_tournament, with teams and the result', async () => {
  test.skip(!tid)
  // The public copy is a saved snapshot rebuilt at most every 15 s, so wait for one taken after the teams.
  await expect.poll(async () => {
    const pub = await ok('get_public_tournament', () => me.db.rpc('get_public_tournament', { p_id: tid } as never)) as { title?: string; teams?: { name: string }[] } | null
    return { title: pub?.title, teams: (pub?.teams ?? []).map(t => t.name).sort() }
  }, { timeout: 25_000, intervals: [2_000, 5_000] }).toEqual({ title: TITLE, teams: [`${MINE} Diggers`, `${MINE} Rivals`] })
})
