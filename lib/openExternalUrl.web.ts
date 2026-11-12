/**
 * Web: open an outside page in a new tab. Resolves to false when the browser
 * blocked it (e.g. Safari after an awaited check outlived the tap's user
 * activation), so the caller can offer a button that opens it on a fresh tap.
 * `noopener` is applied by clearing `opener` rather than as a feature string:
 * with the feature, `window.open` always returns null and a block is undetectable.
 */
export async function openExternalUrl(url: string): Promise<boolean> {
  if (typeof window === 'undefined') return false
  const tab = window.open(url, '_blank')
  if (!tab) return false
  try { tab.opener = null } catch { /* cross-origin already: nothing to clear */ }
  return true
}
