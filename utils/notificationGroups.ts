import type { Notification, NotificationItem } from '../types'

/**
 * Collapse cheers notifications written before #194 (one row per cheer) into
 * one row per game, the way the server now writes them: rows of type
 * `cheers_received` without `data.giver_count`, for the same event and with
 * the same read state, become the newest of them with `groupIds` listing all
 * of them (so opening it marks every one read). Everything else passes
 * through in order. Pure; rows arrive newest first.
 */
export function groupNotifications(rows: Notification[]): NotificationItem[] {
  const out: NotificationItem[] = []
  const legacy = new Map<string, { item: NotificationItem; names: string[]; types: Record<string, number> }>()
  for (const row of rows) {
    const eventId = row.data?.event_id
    const isLegacyCheer = row.notification_type === 'cheers_received' && eventId && row.data?.giver_count === undefined
    if (!isLegacyCheer) { out.push(row); continue }
    const key = `${eventId}:${row.read_at ? 'read' : 'unread'}`
    const parsed = parseLegacyCheerBody(row.body)
    const group = legacy.get(key)
    if (!group) {
      const item: NotificationItem = { ...row, groupIds: [row.id] }
      legacy.set(key, { item, names: parsed.name ? [parsed.name] : [], types: parsed.type ? { [parsed.type]: 1 } : {} })
      out.push(item)
      continue
    }
    group.item.groupIds!.push(row.id)
    if (parsed.name && !group.names.includes(parsed.name)) group.names.push(parsed.name)
    if (parsed.type) group.types[parsed.type] = (group.types[parsed.type] ?? 0) + 1
  }
  for (const { item, names, types } of legacy.values()) {
    const n = item.groupIds!.length
    if (n === 1) { delete item.groupIds; continue }
    const eventTitle = parseLegacyCheerBody(item.body).eventTitle
    item.title = eventTitle ? `${n} cheers from ${eventTitle}` : `${n} cheers`
    item.body = `${cheeredYou(names)}`
    item.data = { ...item.data, giver_names: names, giver_count: names.length, cheer_counts: types }
  }
  return out
}

/** "rileyk gave you dig pass cheers · Thursday Open Play" → its parts. */
export function parseLegacyCheerBody(body: string | null | undefined): { name?: string; type?: string; eventTitle?: string } {
  const m = /^(.*?) gave you (.+?) cheers(?: · (.+))?$/.exec(body ?? '')
  if (!m) return {}
  return { name: m[1], type: m[2].replace(/ /g, '_'), eventTitle: m[3] }
}

/** "a cheered you" / "a and b cheered you" / "a, b and c cheered you" / "a, b and 3 others cheered you". */
export function cheeredYou(names: string[], total: number = names.length): string {
  if (names.length === 0) return 'Someone cheered you'
  if (total <= 1) return `${names[0]} cheered you`
  if (total === 2) return `${names[0]} and ${names[1] ?? 'someone'} cheered you`
  if (total === 3 && names.length >= 3) return `${names[0]}, ${names[1]} and ${names[2]} cheered you`
  return `${names[0]}, ${names[1] ?? 'someone'} and ${total - 2} others cheered you`
}

/** Chips for a cheers row: "Pass ×2", "Spike", most first. */
export function cheerChips(counts: Record<string, number> | undefined): string[] {
  if (!counts) return []
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([type, n]) => {
      const label = type.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
      return n > 1 ? `${label} ×${n}` : label
    })
}

/**
 * The body as the inbox shows it: a grouped cheers row's cheer types are drawn
 * as chips (NotificationCheerChips), so the "· Pass ×2, Spike" tail the push
 * carries is left off here.
 */
export function inboxBody(item: { body: string | null; data?: { cheer_counts?: Record<string, number> } | null }): string {
  const body = item.body ?? ''
  if (!item.data?.cheer_counts) return body
  const cut = body.indexOf(' · ')
  return cut >= 0 ? body.slice(0, cut) : body
}
