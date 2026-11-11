import type { CheersReceived } from '../types'

/** Received cheer rows → how many in all and how many of each type. */
export function countCheers(rows: { cheer_type: string }[]): CheersReceived {
  const byType: Record<string, number> = {}
  for (const row of rows) byType[row.cheer_type] = (byType[row.cheer_type] ?? 0) + 1
  return { total: rows.length, byType }
}
