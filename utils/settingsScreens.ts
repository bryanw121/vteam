/**
 * The route under `settings/` for the current segments (`['(app)', '(tabs)', 'settings', 'metrics', '[id]']`
 * → `'metrics/[id]'`), the key of `SETTINGS_SCREENS`. A folder's index is `<folder>/index`.
 */
export function settingsScreenKey(segments: readonly string[]): string {
  const at = segments.indexOf('settings')
  if (at < 0) return ''
  const rest = segments.slice(at + 1)
  if (!rest.length) return 'index'
  return rest.length === 1 && rest[0] === 'metrics' ? 'metrics/index' : rest.join('/')
}
