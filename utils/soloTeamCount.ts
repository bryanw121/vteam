/**
 * How many teams `players` solo sign-ups make at `size` a team (#282): rounded,
 * at least 2 once there are 2 players. Its own file because the tournament page
 * and Make teams both need it: anything those two lazy routes share moves into
 * the web first load (`__common`), so the shared part stays this small.
 */
export function soloTeamCount(players: number, size: number): number {
  if (players < 2) return 0
  return Math.max(2, Math.round(players / Math.max(1, size)))
}
