import type { TabKey } from '../constants/navigation'

/**
 * The view each tab last showed, as URL params (`{ type: 'tournament' }`), so
 * switching back to a tab on the web puts its filters back in the address.
 * Module-level and in memory only; tab screens write it through `useUrlParam`
 * and the tabs layout reads it when it changes the address for a tab switch.
 */
const views: Partial<Record<TabKey, Record<string, string | undefined>>> = {}

export function rememberTabParam(tab: TabKey, name: string, value: string | undefined) {
  views[tab] = { ...views[tab], [name]: value }
}

export function tabParams(tab: TabKey): Record<string, string | undefined> {
  return views[tab] ?? {}
}

/** For tests and sign-out. */
export function clearTabViews() {
  for (const k of Object.keys(views) as TabKey[]) delete views[k]
}
