/**
 * The fake world the screenshots render: an Austin volleyball scene seen by
 * Maya Chen (@mayachen). Rows follow `types/database.ts`; embeds are resolved
 * by the fake PostgREST from foreign keys, so fixtures stay flat tables.
 *
 * Ids are fixed (screens.mjs routes to them); every date is relative to `now`.
 */
import { clock } from './time.mjs'
import { ME, P, PEOPLE, profiles } from './people.mjs'

export { ME, P }

const id = (prefix, n) => `${prefix}-0000-4000-8000-${String(n).padStart(12, '0')}`

export const IDS = {
  club: { eastside: id('c1000000', 1), indoor: id('c1000000', 2), zilker: id('c1000000', 3), juniors: id('c1000000', 4) },
  event: {
    sundaySand: id('e1000000', 1), tuesdayIndoor: id('e1000000', 2), queensOfCourt: id('e1000000', 3), lunchPepper: id('e1000000', 4),
    fridayNight: id('e1000000', 5), beginnerClinic: id('e1000000', 6), grassTriples: id('e1000000', 7), coedSixes: id('e1000000', 8),
    morningDrills: id('e1000000', 9), pastSand: id('e1000000', 10), pastIndoor: id('e1000000', 11), pastHosted: id('e1000000', 12),
    nextWeekSand: id('e1000000', 13), nextWeekIndoor: id('e1000000', 14),
  },
  tournament: { upcoming: id('d1000000', 1), past: id('d1000000', 2), open: id('d1000000', 3) },
  conversation: { jordan: id('f1000000', 1), clubChat: id('f1000000', 2), priya: id('f1000000', 3), aisha: id('f1000000', 4) },
  tag: { openPlay: id('b1000000', 1), tournament: id('b1000000', 2), clinic: id('b1000000', 3), league: id('b1000000', 4) },
  city: { austin: id('a2000000', 1), houston: id('a2000000', 2), dallas: id('a2000000', 3), sanAntonio: id('a2000000', 4) },
}

const ALL = PEOPLE.map(p => p.id)

export function buildFixtures(now) {
  const t = clock(now)
  const E = IDS.event
  const C = IDS.club
  const T = IDS.tag

  // ─── Reference data ────────────────────────────────────────────────────────
  const tags = [
    { id: T.openPlay, name: 'Open Play', category: 'type', display_order: 1, created_at: t.iso(-300) },
    { id: T.tournament, name: 'Tournament', category: 'type', display_order: 2, created_at: t.iso(-300) },
    { id: T.clinic, name: 'Clinic', category: 'type', display_order: 3, created_at: t.iso(-300) },
    { id: T.league, name: 'League', category: 'type', display_order: 4, created_at: t.iso(-300) },
  ]
  const major_cities = [
    { id: IDS.city.austin, city_name: 'Austin', admin_region: 'Texas', country_code: 'US', display_name: 'Austin, TX' },
    { id: IDS.city.dallas, city_name: 'Dallas', admin_region: 'Texas', country_code: 'US', display_name: 'Dallas, TX' },
    { id: IDS.city.houston, city_name: 'Houston', admin_region: 'Texas', country_code: 'US', display_name: 'Houston, TX' },
    { id: IDS.city.sanAntonio, city_name: 'San Antonio', admin_region: 'Texas', country_code: 'US', display_name: 'San Antonio, TX' },
  ]

  // ─── Clubs ─────────────────────────────────────────────────────────────────
  const clubs = [
    { id: C.eastside, name: 'Eastside Sand Social', description: 'Casual-competitive sand doubles and 4s on the east side. All levels welcome, bring water.', membership_type: 'open', created_by: ME, avatar_url: null, cover_url: null, created_at: t.iso(-180), major_city_id: IDS.city.austin },
    { id: C.indoor, name: 'Austin Indoor League', description: 'Weeknight 6s at the rec centers. B through AA divisions, rotating teams each season.', membership_type: 'open', created_by: P.jordanr, avatar_url: null, cover_url: null, created_at: t.iso(-240), major_city_id: IDS.city.austin },
    { id: C.zilker, name: 'Zilker Grass Crew', description: 'Grass triples at Zilker Park every weekend the weather cooperates.', membership_type: 'invite', created_by: P.sofiag, avatar_url: null, cover_url: null, created_at: t.iso(-90), major_city_id: IDS.city.austin },
    { id: C.juniors, name: 'Round Rock Rally', description: 'North Austin pickup. Mostly indoor, some sand in summer.', membership_type: 'open', created_by: P.aishak, avatar_url: null, cover_url: null, created_at: t.iso(-30), major_city_id: IDS.city.austin },
  ]
  const club_members = []
  const member = (club_id, user_id, role, days) => club_members.push({ club_id, user_id, role, joined_at: t.iso(-days) })
  member(C.eastside, ME, 'owner', 180)
  ;[P.jordanr, P.priyap, P.marcusw, P.sofiag, P.liamo, P.emmat, P.zoeyl, P.carlosm, P.ethanp].forEach((u, i) => member(C.eastside, u, 'member', 170 - i * 9))
  member(C.indoor, P.jordanr, 'owner', 240)
  ;[ME, P.aishak, P.danielk, P.noahb, P.hannahs, P.oliviad, P.samn, P.ethanp, P.priyap, P.marcusw, P.zoeyl].forEach((u, i) => member(C.indoor, u, 'member', 230 - i * 11))
  member(C.zilker, P.sofiag, 'owner', 90)
  ;[P.liamo, P.noahb, P.samn, P.zoeyl].forEach((u, i) => member(C.zilker, u, 'member', 80 - i * 5))
  member(C.juniors, P.aishak, 'owner', 30)
  ;[P.carlosm, P.hannahs].forEach((u, i) => member(C.juniors, u, 'member', 25 - i * 4))

  const club_posts = [
    { id: id('c2000000', 1), club_id: C.eastside, created_by: ME, body: 'Nets are going up at 4 tomorrow. If you can bring an extra ball, please do! We lost two to the creek last week.', created_at: t.ago(60 * 5) },
    { id: id('c2000000', 2), club_id: C.eastside, created_by: P.priyap, body: 'Anyone want to partner for the Halloween Sand Classic? Looking for a blocker.', created_at: t.ago(60 * 26) },
    { id: id('c2000000', 3), club_id: C.eastside, created_by: P.jordanr, body: 'Great turnout yesterday, 18 people! Photos in the group chat.', created_at: t.ago(60 * 24 * 3) },
    { id: id('c2000000', 4), club_id: C.indoor, created_by: P.jordanr, body: 'Spring season registration opens next week. Same divisions as fall.', created_at: t.ago(60 * 30) },
  ]
  const club_post_likes = [
    [1, P.jordanr], [1, P.priyap], [1, P.sofiag], [2, ME], [3, ME], [3, P.marcusw], [3, P.zoeyl], [3, P.emmat], [4, ME],
  ].map(([n, user_id]) => ({ club_post_id: id('c2000000', n), user_id, created_at: t.ago(60) }))
  const club_post_comments = [
    { id: id('c3000000', 1), club_post_id: id('c2000000', 1), user_id: P.marcusw, body: "I'll bring two.", created_at: t.ago(60 * 4) },
    { id: id('c3000000', 2), club_post_id: id('c2000000', 2), user_id: P.emmat, body: 'I can block! DM me.', created_at: t.ago(60 * 20) },
  ]

  // ─── Events ────────────────────────────────────────────────────────────────
  const ev = (key, f) => ({
    id: E[key], created_by: ME, club_id: null, description: null, location: null, latitude: null, longitude: null,
    duration_minutes: 120, max_attendees: 12, created_at: t.iso(-7), price: 0, venmo_handle: null, requires_approval: false,
    skill_levels: [], surface: 'indoor', cancelled_at: null, ...f,
  })
  const events = [
    ev('lunchPepper', { title: 'Lunchtime Pepper & Passing', created_by: P.priyap, location: 'Pease Park', latitude: 30.2836, longitude: -97.7543, event_date: t.naive(0, 12, 0), duration_minutes: 60, max_attendees: 8, surface: 'grass' }),
    ev('fridayNight', { title: 'Rec Center 6s Night', created_by: P.jordanr, club_id: C.indoor, location: 'Austin Sports Center', latitude: 30.4176, longitude: -97.6723, event_date: t.naive(0, 19, 0), max_attendees: 18, price: 10, venmo_handle: 'jordan-reyes', skill_levels: ['b', 'bb', 'a'], description: 'Rotating teams of 6, games to 25. Two courts reserved until 10.' }),
    ev('sundaySand', { title: 'Sand Doubles at Butler', club_id: C.eastside, location: 'Butler Park Sand Courts', latitude: 30.2620, longitude: -97.7520, event_date: t.naive(1, 16, 0), duration_minutes: 180, max_attendees: 16, surface: 'sand', skill_levels: ['bb', 'a'], description: 'King of the court style. Winners stay, losers rotate out. Bring sunscreen and water; nets are up by 4.\n\nWe split into two courts once we hit 10 people.' }),
    ev('beginnerClinic', { title: 'Beginner Passing Clinic', created_by: P.aishak, club_id: C.juniors, location: 'Round Rock Sports Center', latitude: 30.5083, longitude: -97.6789, event_date: t.naive(1, 10, 0), duration_minutes: 90, max_attendees: 10, price: 15, venmo_handle: 'aisha-khan', requires_approval: true, skill_levels: ['d', 'c'], description: 'Fundamentals of forearm passing and serve receive. No experience needed.' }),
    ev('tuesdayIndoor', { title: 'Indoor Open Gym', created_by: P.jordanr, club_id: C.indoor, location: 'Dittmar Recreation Center', latitude: 30.1880, longitude: -97.7951, event_date: t.naive(2, 19, 30), max_attendees: 12, price: 5, venmo_handle: 'jordan-reyes', skill_levels: ['b', 'bb'] }),
    ev('queensOfCourt', { title: 'Queens of the Court', created_by: P.sofiag, location: 'Volleyball Austin', latitude: 30.3780, longitude: -97.7330, event_date: t.naive(3, 18, 0), max_attendees: 12, surface: 'sand', skill_levels: ['a', 'aa_plus'] }),
    ev('grassTriples', { title: 'Grass Triples at Zilker', created_by: P.sofiag, club_id: C.zilker, location: 'Zilker Park Great Lawn', latitude: 30.2669, longitude: -97.7729, event_date: t.naive(4, 9, 30), duration_minutes: 150, max_attendees: 12, surface: 'grass' }),
    ev('coedSixes', { title: 'Co-ed 6s Scrimmage', created_by: P.marcusw, location: 'Gustavo "Gus" Garcia Rec Center', event_date: t.naive(5, 18, 30), max_attendees: 14, price: 5 }),
    ev('morningDrills', { title: 'Setter Footwork Drills', club_id: C.eastside, location: 'Butler Park Sand Courts', event_date: t.naive(6, 8, 0), duration_minutes: 60, max_attendees: 6, surface: 'sand' }),
    ev('nextWeekSand', { title: 'Sand Doubles at Butler', club_id: C.eastside, location: 'Butler Park Sand Courts', event_date: t.naive(8, 16, 0), duration_minutes: 180, max_attendees: 16, surface: 'sand' }),
    ev('nextWeekIndoor', { title: 'Indoor Open Gym', created_by: P.jordanr, club_id: C.indoor, location: 'Dittmar Recreation Center', event_date: t.naive(9, 19, 30), max_attendees: 12, price: 5 }),
    ev('pastSand', { title: 'Sand Doubles at Butler', club_id: C.eastside, location: 'Butler Park Sand Courts', event_date: t.naive(-6, 16, 0), duration_minutes: 180, max_attendees: 16, surface: 'sand' }),
    ev('pastIndoor', { title: 'Indoor Open Gym', created_by: P.jordanr, club_id: C.indoor, location: 'Dittmar Recreation Center', event_date: t.naive(-5, 19, 30), max_attendees: 12, price: 5 }),
    ev('pastHosted', { title: 'Halloween Warm-up Scrimmage', club_id: C.eastside, location: 'Butler Park Sand Courts', event_date: t.naive(-2, 17, 0), max_attendees: 12, surface: 'sand' }),
  ]

  const event_tags = [
    ['lunchPepper', 'openPlay'], ['fridayNight', 'openPlay'], ['fridayNight', 'league'], ['sundaySand', 'openPlay'], ['beginnerClinic', 'clinic'],
    ['tuesdayIndoor', 'openPlay'], ['queensOfCourt', 'tournament'], ['grassTriples', 'openPlay'], ['coedSixes', 'openPlay'], ['morningDrills', 'clinic'],
    ['nextWeekSand', 'openPlay'], ['nextWeekIndoor', 'openPlay'], ['pastSand', 'openPlay'], ['pastIndoor', 'openPlay'], ['pastHosted', 'openPlay'],
  ].map(([e, tag]) => ({ event_id: E[e], tag_id: T[tag] }))

  // Attendance: who's in, in join order. `n` attending from ALL (skipping the host), then waitlist.
  const event_attendees = []
  const roster = (key, users, { waitlist = [], teams = false, pending = [] } = {}) => {
    users.forEach((u, i) => event_attendees.push({ event_id: E[key], user_id: u, status: 'attending', joined_at: t.ago(60 * 24 * 3 - i * 37), team_number: teams ? (i % 2) + 1 : null, team_pinned: false, denial_reason: null }))
    waitlist.forEach((u, i) => event_attendees.push({ event_id: E[key], user_id: u, status: 'waitlisted', joined_at: t.ago(60 * 5 - i * 11), team_number: null, team_pinned: false, denial_reason: null }))
    pending.forEach((u, i) => event_attendees.push({ event_id: E[key], user_id: u, status: 'pending', joined_at: t.ago(60 * 2 - i * 7), team_number: null, team_pinned: false, denial_reason: null }))
  }
  const others = exclude => ALL.filter(u => !exclude.includes(u))
  roster('sundaySand', [ME, ...others([ME]).slice(0, 10)], { teams: true })
  roster('lunchPepper', [P.priyap, P.marcusw, P.zoeyl])
  roster('fridayNight', [P.jordanr, ...others([P.jordanr]).slice(0, 17)], { waitlist: [P.ethanp, P.oliviad] })
  roster('beginnerClinic', [P.aishak, P.hannahs, P.danielk, P.carlosm], { pending: [P.oliviad] })
  roster('tuesdayIndoor', [P.jordanr, ME, P.priyap, P.danielk, P.noahb, P.samn, P.ethanp])
  roster('queensOfCourt', [P.sofiag, P.aishak, P.zoeyl, P.priyap, P.emmat, P.samn, P.jordanr, P.hannahs, P.oliviad, P.liamo, P.noahb, P.carlosm])
  roster('grassTriples', [P.sofiag, P.liamo, P.noahb, P.samn, P.zoeyl])
  roster('coedSixes', [P.marcusw, P.emmat, P.ethanp])
  roster('morningDrills', [ME, P.carlosm])
  roster('nextWeekSand', [ME, P.jordanr, P.priyap])
  roster('nextWeekIndoor', [P.jordanr])
  roster('pastSand', [ME, P.jordanr, P.priyap, P.marcusw, P.sofiag, P.liamo, P.emmat, P.zoeyl], { teams: true })
  roster('pastIndoor', [P.jordanr, ME, P.aishak, P.danielk, P.noahb, P.hannahs])
  roster('pastHosted', [ME, P.priyap, P.marcusw, P.emmat, P.ethanp, P.zoeyl])

  const event_guests = [
    { id: id('e2000000', 1), event_id: E.sundaySand, added_by: P.jordanr, first_name: 'Chris', last_name: 'Reyes', status: 'attending', joined_at: t.ago(60 * 20), team_number: 2, team_pinned: false },
  ]
  const event_cohosts = [
    { event_id: E.sundaySand, user_id: P.priyap, added_by: ME, added_at: t.iso(-5) },
  ]
  const comment = (n, key, user_id, body, minutesAgo, extra = {}) => ({
    id: id('e3000000', n), event_id: E[key], user_id, body, created_at: t.ago(minutesAgo), is_announcement: false, mentions: [], parent_id: null, edited_at: null, deleted_at: null, ...extra,
  })
  const event_comments = [
    comment(1, 'sundaySand', ME, 'Heads up: parking at Butler fills up fast after 3. The garage on Barton Springs is free on Sundays.', 60 * 26, { is_announcement: true }),
    comment(2, 'sundaySand', P.jordanr, 'Bringing my brother Chris as a +1, he plays BB.', 60 * 20),
    comment(3, 'sundaySand', P.priyap, 'Can we do 4s if we get more than 12?', 60 * 9),
    comment(4, 'sundaySand', ME, 'Yes! Two courts of 4s if we hit 16.', 60 * 8, { parent_id: id('e3000000', 3) }),
    comment(5, 'sundaySand', P.marcusw, 'Running 10 minutes late, save me a spot', 45),
    comment(6, 'fridayNight', P.jordanr, 'Court 3 tonight, enter through the side door.', 60 * 3, { is_announcement: true }),
  ]
  const cheers = []
  const cheer = (n, event, giver, receiver, type, daysAgo) => cheers.push({ id: id('e4000000', n), event_id: E[event], giver_id: giver, receiver_id: receiver, cheer_type: type, created_at: t.iso(-daysAgo, 20) })
  cheer(1, 'pastSand', P.jordanr, ME, 'set', 6); cheer(2, 'pastSand', P.priyap, ME, 'set', 6); cheer(3, 'pastSand', P.sofiag, ME, 'communication', 6)
  cheer(4, 'pastSand', P.marcusw, ME, 'serve', 6); cheer(5, 'pastIndoor', P.jordanr, ME, 'set', 5); cheer(6, 'pastIndoor', P.aishak, ME, 'pass', 5)
  cheer(7, 'pastHosted', P.emmat, ME, 'dig', 2); cheer(8, 'pastSand', ME, P.jordanr, 'spike', 6); cheer(9, 'pastSand', ME, P.priyap, 'dig', 6)
  cheer(10, 'pastHosted', ME, P.zoeyl, 'pass', 2); cheer(11, 'pastSand', P.liamo, P.jordanr, 'spike', 6); cheer(12, 'pastSand', P.zoeyl, P.priyap, 'pass', 6)

  const user_event_templates = [
    { id: id('e5000000', 1), user_id: ME, name: 'Butler sand', title: 'Sand Doubles at Butler', description: 'King of the court style.', location: 'Butler Park Sand Courts', max_attendees: 16, created_at: t.iso(-60) },
  ]

  // Other venues' sessions (Schelagg feed).
  const ext = (n, f) => ({ id: id('e6000000', n), source_id: `shots-${n}`, region: 'austin', city: 'Austin', canceled: false, updated_at: t.ago(20), verified_at: t.ago(60 * 3), signup_label: 'Sign up', note: null, level: null, ...f })
  const external_sessions = [
    ext(1, { title: 'Open Gym', venue: 'Volleyworld Austin', surface: 'indoor', session_type: 'open play', price: '$12', starts_at: t.iso(0, 18, 0), ends_at: t.iso(0, 21, 0), signup_url: 'https://example.com/volleyworld', level: 'All levels' }),
    ext(2, { title: 'Sand Open Play', venue: 'ATX Beach Volleyball', surface: 'sand', session_type: 'open play', price: '$8', starts_at: t.iso(2, 18, 30), ends_at: t.iso(2, 21, 0), signup_url: 'https://example.com/atxbeach' }),
    ext(3, { title: 'Intermediate Clinic', venue: 'ACES Volleyball', surface: 'indoor', session_type: 'clinic', price: '$25', starts_at: t.iso(3, 19, 0), ends_at: t.iso(3, 20, 30), signup_url: 'https://example.com/aces', level: 'B / BB' }),
    ext(4, { title: 'Reverse Co-ed 4s', venue: 'Volleyworld Austin', surface: 'indoor', session_type: 'open play', price: '$12', starts_at: t.iso(5, 19, 0), ends_at: t.iso(5, 22, 0), signup_url: 'https://example.com/volleyworld' }),
  ]

  // ─── Tournaments ───────────────────────────────────────────────────────────
  const TU = IDS.tournament
  const tournament = (tid, f) => ({
    id: tid, club_id: C.eastside, created_by: ME, description: null, location: 'Butler Park Sand Courts', skill_levels: ['bb', 'a'], registration_deadline: null,
    status: 'published', format: 'pool_bracket', bracket_type: 'single', max_teams: 8, min_roster_size: 2, max_roster_size: 3, teams_advance_per_pool: 2, has_refs: false,
    price: 40, venmo_handle: 'maya-chen', schedule_published: false, match_duration_minutes: 45, break_duration_minutes: 5, num_courts: 2, cancelled_at: null,
    published_at: t.iso(-14), schedule_generated_at: null, created_at: t.iso(-20), ...f,
  })
  const tournaments = [
    tournament(TU.upcoming, { title: 'Halloween Sand Classic', start_date: t.iso(3, 9, 0), registration_deadline: t.iso(2, 23, 59), description: 'Reverse co-ed doubles. Pool play in the morning, single-elimination bracket after lunch. Costumes encouraged, trophies for the top three.', schedule_published: true, schedule_generated_at: t.iso(-1), status: 'published' }),
    tournament(TU.past, { title: 'Fall Doubles Cup', start_date: t.iso(-13, 9, 0), status: 'completed', schedule_published: true, schedule_generated_at: t.iso(-15), published_at: t.iso(-30), created_at: t.iso(-35), description: 'Our fall doubles championship.' }),
    tournament(TU.open, { title: 'Indoor 6s Shootout', club_id: C.indoor, created_by: P.jordanr, location: 'Austin Sports Center', start_date: t.iso(17, 10, 0), format: 'round_robin', bracket_type: null, max_teams: 6, min_roster_size: 6, max_roster_size: 9, price: 120, venmo_handle: 'jordan-reyes', num_courts: 2, match_duration_minutes: 60, skill_levels: ['b', 'bb'] }),
  ]
  const tournament_rules = [TU.upcoming, TU.past, TU.open].map(tid => ({ tournament_id: tid, sets_to_win: tid === TU.open ? 2 : 1, winning_score: tid === TU.open ? 25 : 21, deciding_set_score: 15, win_by_margin: 2, point_cap: null, starting_score: 0 }))
  const tournament_prizes = [
    { id: id('d2000000', 1), tournament_id: TU.upcoming, place_label: '1st', description: 'Trophy + $160', amount: '$160', display_order: 1, created_at: t.iso(-14) },
    { id: id('d2000000', 2), tournament_id: TU.upcoming, place_label: '2nd', description: 'Trophy + $80', amount: '$80', display_order: 2, created_at: t.iso(-14) },
    { id: id('d2000000', 3), tournament_id: TU.upcoming, place_label: '3rd', description: 'Trophy', amount: null, display_order: 3, created_at: t.iso(-14) },
  ]
  const tournament_teams = []
  const tournament_team_members = []
  let memberN = 0
  const team = (tid, n, name, players, seed = null) => {
    const teamId = id(tid === TU.upcoming ? 'd3000000' : tid === TU.past ? 'd3100000' : 'd3200000', n)
    tournament_teams.push({ id: teamId, tournament_id: tid, name, captain_user_id: players[0], seed, status: 'registered', is_approved: true, is_locked: false, is_paid: n % 3 !== 0, created_at: t.iso(-12 + n / 10) })
    players.forEach((u, i) => tournament_team_members.push({ id: id('d4000000', ++memberN), team_id: teamId, user_id: u, is_captain: i === 0, joined_at: t.iso(-12 + n / 10) }))
    return teamId
  }
  // Upcoming: 8 teams, 2 pools of 4, schedule published.
  const up = [
    team(TU.upcoming, 1, 'Sets on the Beach', [ME, P.emmat], 1), team(TU.upcoming, 2, 'Block Party', [P.jordanr, P.priyap], 2),
    team(TU.upcoming, 3, 'Dig Deep', [P.sofiag, P.liamo], 3), team(TU.upcoming, 4, 'Sandy Cheeks', [P.marcusw, P.zoeyl], 4),
    team(TU.upcoming, 5, 'Ace Ventura', [P.aishak, P.noahb], 5), team(TU.upcoming, 6, 'Net Gains', [P.carlosm, P.hannahs], 6),
    team(TU.upcoming, 7, 'Pass Masters', [P.ethanp, P.oliviad], 7), team(TU.upcoming, 8, 'Kill Shot', [P.samn, P.danielk], 8),
  ]
  // Past: 4 teams, one pool, then a 4-team bracket, all played.
  const past = [
    team(TU.past, 1, 'Sets on the Beach', [ME, P.priyap], 1), team(TU.past, 2, 'Block Party', [P.jordanr, P.emmat], 2),
    team(TU.past, 3, 'Dig Deep', [P.sofiag, P.zoeyl], 3), team(TU.past, 4, 'Sandy Cheeks', [P.marcusw, P.liamo], 4),
  ]
  // Open: 3 teams registered so far, no schedule.
  team(TU.open, 1, 'Spike Lee', [P.jordanr, P.danielk, P.noahb, P.hannahs, P.oliviad, P.samn])
  team(TU.open, 2, 'Bump Set Psych', [P.aishak, P.carlosm, P.ethanp, P.zoeyl, P.priyap, P.emmat])
  team(TU.open, 3, 'The Dig Lebowskis', [ME, P.marcusw, P.sofiag, P.liamo, P.emmat, P.zoeyl])

  const tournament_pools = [
    { id: id('d5000000', 1), tournament_id: TU.upcoming, name: 'Pool A', display_order: 1 },
    { id: id('d5000000', 2), tournament_id: TU.upcoming, name: 'Pool B', display_order: 2 },
    { id: id('d5000000', 3), tournament_id: TU.past, name: 'Pool A', display_order: 1 },
  ]
  const tournament_pool_teams = [
    ...[0, 3, 4, 7].map(i => ({ pool_id: tournament_pools[0].id, team_id: up[i] })),
    ...[1, 2, 5, 6].map(i => ({ pool_id: tournament_pools[1].id, team_id: up[i] })),
    ...past.map(team_id => ({ pool_id: tournament_pools[2].id, team_id })),
  ]
  const tournament_matches = []
  const tournament_sets = []
  let matchN = 0, setN = 0
  const match = (tid, f, sets = []) => {
    const mid = id('d6000000', ++matchN)
    const row = { id: mid, tournament_id: tid, pool_id: null, stage: 'pool_play', round: 1, match_number: 1, team_a_id: null, team_b_id: null, court: 'Court 1', scheduled_at: null, status: 'scheduled', winner_id: null, bracket_round_name: null, is_losers_bracket: false, ref_team_id: null, created_at: t.iso(-1), ...f }
    if (sets.length) {
      const aWins = sets.filter(([a, b]) => a > b).length
      row.status = 'completed'
      row.winner_id = aWins > sets.length / 2 ? row.team_a_id : row.team_b_id
      sets.forEach(([a, b], i) => tournament_sets.push({ id: id('d7000000', ++setN), match_id: mid, set_number: i + 1, team_a_score: a, team_b_score: b, completed_at: row.scheduled_at }))
    }
    tournament_matches.push(row)
  }
  // Round-robin pairings for 4 teams: (0v3, 1v2), (0v2, 3v1), (0v1, 2v3)
  const rr = [[[0, 3], [1, 2]], [[0, 2], [3, 1]], [[0, 1], [2, 3]]]
  const poolsUp = [[0, 3, 4, 7].map(i => up[i]), [1, 2, 5, 6].map(i => up[i])]
  let mnum = 0
  rr.forEach((pairs, r) => poolsUp.forEach((teams, p) => pairs.forEach(([a, b], k) => match(TU.upcoming, {
    pool_id: tournament_pools[p].id, round: r + 1, match_number: ++mnum, team_a_id: teams[a], team_b_id: teams[b],
    court: `Court ${p + 1}`, scheduled_at: new Date(t.at(3, 9).getTime() + (r * 2 + k) * 50 * 60000).toISOString(),
  }))))
  const pastScores = [[[21, 15]], [[21, 18]], [[19, 21]], [[21, 12]], [[21, 17]], [[16, 21]]]
  mnum = 0
  rr.forEach((pairs, r) => pairs.forEach(([a, b], k) => match(TU.past, {
    pool_id: tournament_pools[2].id, round: r + 1, match_number: ++mnum, team_a_id: past[a], team_b_id: past[b],
    court: `Court ${k + 1}`, scheduled_at: t.iso(-13, 9 + r, 0),
  }, pastScores[mnum - 1])))
  // Bracket: semis 1v4, 2v3; final.
  match(TU.past, { stage: 'bracket', round: 1, match_number: 1, bracket_round_name: 'Semifinals', team_a_id: past[0], team_b_id: past[3], court: 'Court 1', scheduled_at: t.iso(-13, 13, 0) }, [[21, 16]])
  match(TU.past, { stage: 'bracket', round: 1, match_number: 2, bracket_round_name: 'Semifinals', team_a_id: past[1], team_b_id: past[2], court: 'Court 2', scheduled_at: t.iso(-13, 13, 0) }, [[23, 21]])
  match(TU.past, { stage: 'bracket', round: 2, match_number: 1, bracket_round_name: 'Final', team_a_id: past[0], team_b_id: past[1], court: 'Court 1', scheduled_at: t.iso(-13, 14, 0) }, [[21, 19]])

  const tournament_comments = [
    { id: id('d8000000', 1), tournament_id: TU.upcoming, user_id: ME, body: 'Schedule is up! Check-in opens at 8:30, first serve at 9 sharp.', is_announcement: true, mentions: [], parent_id: null, edited_at: null, deleted_at: null, created_at: t.ago(60 * 20) },
    { id: id('d8000000', 2), tournament_id: TU.upcoming, user_id: P.jordanr, body: 'Is there shade near court 2?', is_announcement: false, mentions: [], parent_id: null, edited_at: null, deleted_at: null, created_at: t.ago(60 * 6) },
    { id: id('d8000000', 3), tournament_id: TU.upcoming, user_id: P.priyap, body: "There's a tree line on the east side, bring a pop-up just in case.", is_announcement: false, mentions: [], parent_id: id('d8000000', 2), edited_at: null, deleted_at: null, created_at: t.ago(60 * 5) },
  ]

  // ─── Chat ──────────────────────────────────────────────────────────────────
  const CV = IDS.conversation
  const conversations = [
    { id: CV.jordan, type: 'dm', club_id: null, created_at: t.iso(-40) },
    { id: CV.clubChat, type: 'club', club_id: C.eastside, created_at: t.iso(-180) },
    { id: CV.priya, type: 'dm', club_id: null, created_at: t.iso(-20) },
    { id: CV.aisha, type: 'dm', club_id: null, created_at: t.iso(-10) },
  ]
  const conversation_members = [
    { conversation_id: CV.jordan, user_id: ME, joined_at: t.iso(-40), last_read_at: t.ago(60 * 3) },
    { conversation_id: CV.jordan, user_id: P.jordanr, joined_at: t.iso(-40), last_read_at: t.ago(5) },
    { conversation_id: CV.priya, user_id: ME, joined_at: t.iso(-20), last_read_at: t.ago(60 * 30) },
    { conversation_id: CV.priya, user_id: P.priyap, joined_at: t.iso(-20), last_read_at: t.ago(60 * 30) },
    { conversation_id: CV.aisha, user_id: ME, joined_at: t.iso(-10), last_read_at: t.ago(60 * 24 * 4) },
    { conversation_id: CV.aisha, user_id: P.aishak, joined_at: t.iso(-10), last_read_at: t.ago(60 * 24 * 4) },
    ...club_members.filter(m => m.club_id === C.eastside).map(m => ({ conversation_id: CV.clubChat, user_id: m.user_id, joined_at: m.joined_at, last_read_at: t.ago(60) })),
  ]
  let msgN = 0
  const messages = []
  const msg = (conv, sender, content, minutesAgo, extra = {}) => {
    const mid = id('f2000000', ++msgN)
    messages.push({ id: mid, conversation_id: conv, sender_id: sender, content, image_url: null, reply_to_id: null, mentions: [], created_at: t.ago(minutesAgo), deleted_at: null, edited_at: null, ...extra })
    return mid
  }
  msg(CV.jordan, P.jordanr, 'Hey! You playing sand tomorrow?', 60 * 26)
  msg(CV.jordan, ME, "Yep, I'm hosting. Want to partner up for the first few games?", 60 * 25)
  msg(CV.jordan, P.jordanr, "For sure. I've been working on my jump serve", 60 * 25 - 3)
  const q = msg(CV.jordan, ME, 'Ha, we will see. Last time you served three into the creek', 60 * 24)
  msg(CV.jordan, P.jordanr, 'That was ONE time', 60 * 24 - 2, { reply_to_id: q })
  msg(CV.jordan, P.jordanr, 'Also are you doing the Halloween Sand Classic? Priya and I signed up as Block Party', 60 * 4)
  msg(CV.jordan, ME, "Emma and I are in! We're Sets on the Beach", 60 * 3 + 50)
  msg(CV.jordan, P.jordanr, 'See you in the bracket', 60 * 2)
  msg(CV.jordan, P.jordanr, 'Bringing the good ball tomorrow 🏐', 12)
  msg(CV.clubChat, P.marcusw, 'Who has the net bag?', 60 * 30)
  msg(CV.clubChat, ME, 'I do, bringing it tomorrow', 60 * 29)
  msg(CV.clubChat, P.zoeyl, 'Photos from last week are in the shared album!', 60 * 3)
  msg(CV.clubChat, P.priyap, 'These are great, thanks Zoey', 60 * 2 + 30)
  msg(CV.priya, P.priyap, 'Thanks for the cheers last weekend!', 60 * 24 * 2)
  msg(CV.priya, ME, 'You were digging everything. See you Tuesday', 60 * 24 * 2 - 10)
  msg(CV.aisha, P.aishak, 'Could you help run the beginner clinic next month?', 60 * 24 * 4)
  const message_reactions = [
    { message_id: id('f2000000', 5), user_id: ME, emoji: '😂', created_at: t.ago(60 * 23) },
    { message_id: id('f2000000', 9), user_id: ME, emoji: '🔥', created_at: t.ago(10) },
  ]

  // ─── Viewer's own stuff ────────────────────────────────────────────────────
  const notifications = [
    { id: id('f3000000', 1), user_id: ME, notification_type: 'kudos_received', title: 'You received a cheer', body: 'Emma cheered your digging at Halloween Warm-up Scrimmage', data: { event_id: E.pastHosted }, read_at: null, created_at: t.ago(60 * 2) },
    { id: id('f3000000', 2), user_id: ME, notification_type: 'event_announcement', title: 'Announcement: Rec Center 6s Night', body: 'Court 3 tonight, enter through the side door.', data: { event_id: E.fridayNight }, read_at: null, created_at: t.ago(60 * 3) },
    { id: id('f3000000', 3), user_id: ME, notification_type: 'event_comment', title: 'New comment on Sand Doubles at Butler', body: 'Marcus: Running 10 minutes late, save me a spot', data: { event_id: E.sundaySand }, read_at: null, created_at: t.ago(45) },
    { id: id('f3000000', 4), user_id: ME, notification_type: 'badge_earned', title: 'Badge earned: Host', body: 'You hosted 10 events. Thanks for running games!', data: { badge_type: 'event_host', tier: 2 }, read_at: t.ago(60 * 20), created_at: t.ago(60 * 24) },
    { id: id('f3000000', 6), user_id: ME, notification_type: 'event_reminder', title: 'Indoor Open Gym at 7:30 PM', body: 'Tomorrow at 7:30 PM · Dittmar Recreation Center', data: { event_id: E.tuesdayIndoor, deep_link: `/event/${E.tuesdayIndoor}` }, read_at: null, created_at: t.ago(30) },
    { id: id('f3000000', 7), user_id: ME, notification_type: 'late_dropout', title: 'Olivia Davis dropped out of Setter Footwork Drills', body: 'Starts at 8:00 AM. A spot is open.', data: { event_id: E.morningDrills, deep_link: `/event/${E.morningDrills}?tab=1` }, read_at: t.ago(60 * 5), created_at: t.ago(60 * 6) },
    { id: id('f3000000', 5), user_id: ME, notification_type: 'cohost_added', title: 'You are a co-host', body: 'Jordan added you as a co-host of Indoor Open Gym', data: { event_id: E.tuesdayIndoor }, read_at: t.ago(60 * 40), created_at: t.ago(60 * 48) },
  ]
  const user_badges = [
    { id: id('f4000000', 1), user_id: ME, badge_type: 'event_attendee', tier: 3, awarded_at: t.iso(-20), display_order: 1, display_tier: null },
    { id: id('f4000000', 2), user_id: ME, badge_type: 'event_host', tier: 2, awarded_at: t.iso(-1), display_order: 2, display_tier: null },
    { id: id('f4000000', 3), user_id: ME, badge_type: 'set_cheer', tier: 1, awarded_at: t.iso(-5), display_order: 3, display_tier: null },
    { id: id('f4000000', 4), user_id: ME, badge_type: 'cheers_received', tier: 1, awarded_at: t.iso(-6), display_order: null, display_tier: null },
    { id: id('f4000000', 5), user_id: P.jordanr, badge_type: 'spike_cheer', tier: 2, awarded_at: t.iso(-6), display_order: 1, display_tier: null },
    { id: id('f4000000', 6), user_id: P.jordanr, badge_type: 'event_host', tier: 3, awarded_at: t.iso(-60), display_order: 2, display_tier: null },
  ]
  const user_settings = [{ user_id: ME, home_city_id: IDS.city.austin, seen_banners: [], reminder_lead_minutes: 120, updated_at: t.iso(-3) }]
  const chat_silences = [{ user_id: ME, silenced_user_id: P.hannahs, created_at: t.iso(-8) }]

  return {
    profiles: profiles(t),
    tags, major_cities, clubs, club_members, club_posts, club_post_likes, club_post_comments,
    events, event_tags, event_attendees, event_guests, event_cohosts, event_comments, cheers, user_event_templates, external_sessions,
    tournaments, tournament_rules, tournament_prizes, tournament_teams, tournament_team_members, tournament_pools, tournament_pool_teams,
    tournament_matches, tournament_sets, tournament_comments, tournament_team_invitations: [], tournament_team_join_requests: [],
    conversations, conversation_members, messages, message_reactions,
    notifications, user_badges, user_settings, chat_silences,
    app_config: [], push_tokens: [], feedback_submissions: [], app_events: [],
  }
}

/** Views, computed from the base tables on every read. */
export const VIEWS = {
  event_attendees_attending: rowsOf => rowsOf('event_attendees').filter(r => r.status === 'attending'),
  event_attendees_waitlisted: rowsOf => rowsOf('event_attendees').filter(r => r.status === 'waitlisted'),
  event_guests_attending: rowsOf => rowsOf('event_guests').filter(r => r.status === 'attending'),
}
