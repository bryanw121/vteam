import { readFileSync, readdirSync, statSync } from 'fs'
import { join, resolve } from 'path'

// #228: react-native-web's Alert.alert does nothing, and most players are on
// the web. Messages go through lib/toast (toast.show / toast.error); a choice
// goes through utils/confirm or ConfirmDialog. This fails when a file not
// listed below imports Alert, and when a listed file no longer does (so the
// list only shrinks: delete its line once a file is converted).
const ROOT = resolve(__dirname, '..')

/** confirmDestructive's native dialog: a real choice, which a toast can't ask. */
const ALLOWED = new Set(['utils/confirm.ts'])

/** Not converted yet: register.tsx waits for #229, which changes the same lines. */
const NOT_YET_CONVERTED = new Set<string>([
])

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sources(path)
    return /\.tsx?$/.test(name) ? [path] : []
  })
}

/** `import { Alert } from 'react-native'`, on one line or several. */
export function importsAlert(src: string): boolean {
  return /import\s*\{[^}]*\bAlert\b[^}]*\}\s*from\s*['"]react-native['"]/.test(src)
}

const files = ['app', 'components', 'hooks', 'utils', 'lib', 'contexts']
  .flatMap(dir => sources(join(ROOT, dir)))
  .filter(file => importsAlert(readFileSync(file, 'utf8')))
  .map(file => file.slice(ROOT.length + 1))

describe('no silent alerts (#228)', () => {
  it('spots the import however it is written', () => {
    expect(importsAlert("import { Alert } from 'react-native'")).toBe(true)
    expect(importsAlert("import {\n  View,\n  Alert,\n} from 'react-native'")).toBe(true)
    expect(importsAlert("import { AlertTriangle } from 'lucide'")).toBe(false)
    expect(importsAlert("import { View } from 'react-native'")).toBe(false)
  })

  it('no new file imports Alert: use toast.show / toast.error (lib/toast), or confirmDestructive for a choice', () => {
    expect(files.filter(f => !ALLOWED.has(f) && !NOT_YET_CONVERTED.has(f))).toEqual([])
  })

  it('the not-yet-converted list only shrinks', () => {
    expect([...NOT_YET_CONVERTED].filter(f => !files.includes(f))).toEqual([])
  })
})
