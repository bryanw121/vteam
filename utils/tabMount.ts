import { TABS } from '../constants/navigation'

/** Prefetch the next tab once the active one has settled so the first swipe isn't empty. */
export function prefetchNeighbor(active: number, tabCount: number = TABS.length): number | null {
  if (active < tabCount - 1) return active + 1
  if (active > 0) return active - 1
  return null
}

/**
 * Mount each tab the first time it becomes active (and keep it mounted).
 * Only the tab the page opened on mounts at first (#224: /profile used to
 * mount Events too and load its whole feed for a hidden screen); the one
 * neighbor follows after `NEIGHBOR_PREFETCH_DELAY_MS`. The first switch to an
 * unvisited tab may briefly show an empty page until it mounts.
 */
export function nextMountedTabs(prev: Set<number>, active: number): Set<number> {
  if (prev.has(active)) return prev
  const out = new Set(prev)
  out.add(active)
  return out
}
