import type { ChunkErrorAction, UpdateReloadHow } from '../utils/staleBuild'

/**
 * Native: the app's JavaScript is bundled, so a deploy can't take a screen's
 * code away (#359). The web version is lib/staleBuild.web.ts.
 */
export function startStaleBuildWatch(): () => void {
  return () => {}
}

export async function handleChunkError(): Promise<ChunkErrorAction> {
  return 'crash'
}

export function takeUpdateNotice(): UpdateReloadHow | null {
  return null
}
