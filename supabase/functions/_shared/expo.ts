/**
 * Expo push endpoints and limits, shared by the push functions. No imports
 * from URLs and no Deno globals, so handlers (and their tests) can import it
 * without pulling in supabase-js.
 */

export const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'
export const EXPO_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts'
/** Expo accepts at most 100 messages per send request. */
export const EXPO_BATCH_SIZE = 100
/** Expo accepts at most 1000 ticket ids per getReceipts request. */
export const RECEIPT_BATCH = 1000

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}
