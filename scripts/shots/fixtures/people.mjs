/** Players. `ME` is the signed-in viewer in signed-in captures. */

const uid = n => `a0000000-0000-4000-8000-${String(n).padStart(12, '0')}`

export const ME = uid(1)

export const PEOPLE = [
  // id, username, first, last, position[], skill, border, bio
  [ME, 'mayachen', 'Maya', 'Chen', ['setter'], 'bb', 'gold', 'Setter. Sand on weekends, indoor on Tuesdays. Always down for a 6s pickup game.'],
  [uid(2), 'jordanr', 'Jordan', 'Reyes', ['outside_hitter'], 'a', null, 'Outside hitter, ex-club at UT.'],
  [uid(3), 'priyap', 'Priya', 'Patel', ['libero', 'defensive_specialist'], 'bb', 'bronze', 'Will dig anything.'],
  [uid(4), 'marcusw', 'Marcus', 'Webb', ['middle_blocker'], 'b', null, null],
  [uid(5), 'sofiag', 'Sofia', 'Garza', ['opposite_hitter'], 'a', null, 'Lefty oppo. Coffee first.'],
  [uid(6), 'liamo', 'Liam', "O'Connor", ['outside_hitter'], 'b', null, null],
  [uid(7), 'aishak', 'Aisha', 'Khan', ['setter'], 'aa_plus', 'gradient', 'Coaching juniors at Austin Juniors VBC.'],
  [uid(8), 'danielk', 'Daniel', 'Kim', ['defensive_specialist'], 'c', null, null],
  [uid(9), 'emmat', 'Emma', 'Thompson', ['middle_blocker'], 'bb', null, null],
  [uid(10), 'noahb', 'Noah', 'Brooks', ['opposite_hitter', 'outside_hitter'], 'b', null, null],
  [uid(11), 'zoeyl', 'Zoey', 'Lin', ['libero'], 'a', null, null],
  [uid(12), 'carlosm', 'Carlos', 'Mendoza', ['setter'], 'b', null, null],
  [uid(13), 'hannahs', 'Hannah', 'Scott', ['outside_hitter'], 'c', null, null],
  [uid(14), 'ethanp', 'Ethan', 'Park', ['middle_blocker'], 'bb', null, null],
  [uid(15), 'oliviad', 'Olivia', 'Davis', ['defensive_specialist'], 'b', null, null],
  [uid(16), 'samn', 'Sam', 'Nguyen', ['opposite_hitter'], 'a', null, null],
].map(([id, username, first_name, last_name, position, skill_level, selected_border, bio], i) => ({ id, username, first_name, last_name, position, skill_level, selected_border, bio, i }))

export const P = Object.fromEntries(PEOPLE.map(p => [p.username, p.id]))

export function profiles(t) {
  return PEOPLE.map(p => ({
    id: p.id,
    username: p.username,
    first_name: p.first_name,
    last_name: p.last_name,
    avatar_url: null,
    bio: p.bio,
    position: p.position,
    skill_level: p.skill_level,
    selected_border: p.selected_border,
    selected_card_bg: null,
    is_admin: false,
    notification_prefs: {},
    created_at: t.iso(-200 + p.i * 7, 12),
  }))
}
