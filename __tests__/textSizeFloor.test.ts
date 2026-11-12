import { readFileSync, readdirSync, statSync } from 'fs'
import { join, resolve } from 'path'
import { theme } from '../constants/theme'

// Issue #43: the smallest text was 7px. 11 is iOS Caption 2 / Material Label
// Small, the smallest size either platform recommends. Every size is a token in
// constants/theme.ts, and every Text goes through components/ui/Text so the
// text size setting reaches it.
const FLOOR = 11
const ROOT = resolve(__dirname, '..')

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sources(path)
    return /\.tsx?$/.test(name) ? [path] : []
  })
}

const rel = (file: string) => file.slice(ROOT.length + 1)

/** `fontSize: 12` / `fontSize={12}` / `fontSize: x ? 12 : 13`: any number literal as a font size. */
export function hardcodedFontSizes(src: string): number[] {
  const lines: number[] = []
  src.split('\n').forEach((line, i) => {
    if (/fontSize(?::|=\{)[^,}\n]*?(?<![\w.])\d+(?:\.\d+)?(?![\w.])/.test(line)) lines.push(i + 1)
  })
  return lines
}

/** Names imported from 'react-native' that must come from components/ui/Text instead. */
export function rawTextImports(src: string): string[] {
  const found: string[] = []
  for (const m of src.matchAll(/import\s+\{([^}]*)\}\s+from\s+['"]react-native['"]/g)) {
    for (const name of m[1].split(',').map(n => n.trim())) {
      if (/^(Text|TextInput)(\s+as\s+\w+)?$/.test(name)) found.push(name)
    }
  }
  return found
}

describe('text size', () => {
  it('every font token is at least the floor', () => {
    const groups = [theme.font.size, theme.font.heading, theme.font.emoji, theme.font.watermark]
    for (const group of groups) for (const size of Object.values(group)) expect(size).toBeGreaterThanOrEqual(FLOOR)
  })

  it('the literal check catches a violating fixture', () => {
    const fixture = [
      'const a = { fontSize: 9 }',
      '<SvgText fontSize={10} />',
      'const b = { fontSize: done ? 17 : 13 }',
      'const c = { fontSize: theme.font.size.md }',
      'const d = { fontSize: theme.font.size.md * scale }',
    ].join('\n')
    expect(hardcodedFontSizes(fixture)).toEqual([1, 2, 3])
    expect(rawTextImports("import { View, Text, TextInput as TI } from 'react-native'")).toEqual(['Text', 'TextInput as TI'])
    expect(rawTextImports("import { View, TextStyle } from 'react-native'")).toEqual([])
  })

  it('no hardcoded fontSize in app/, components/ or constants/: sizes come from theme.font', () => {
    const offenders: string[] = []
    for (const file of ['app', 'components', 'constants'].flatMap(d => sources(join(ROOT, d)))) {
      if (rel(file) === 'constants/theme.ts') continue
      for (const line of hardcodedFontSizes(readFileSync(file, 'utf8'))) offenders.push(`${rel(file)}:${line}`)
    }
    expect(offenders).toEqual([])
  })

  it("Text and TextInput come from components/ui/Text, never straight from 'react-native'", () => {
    const offenders: string[] = []
    for (const file of ['app', 'components', 'contexts', 'hooks', 'lib'].flatMap(d => sources(join(ROOT, d)))) {
      if (rel(file) === 'components/ui/Text.tsx') continue
      for (const name of rawTextImports(readFileSync(file, 'utf8'))) offenders.push(`${rel(file)}: ${name}`)
    }
    expect(offenders).toEqual([])
  })
})
