#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DOC_PATH = join(ROOT, 'docs/request-response-and-data-model.md')
const BEGIN = '<!-- BEGIN GENERATED: code-inventory -->'
const END = '<!-- END GENERATED: code-inventory -->'

const CALL_DIRS = [
  'app',
  'api',
  'components',
  'contexts',
  'hooks',
  'lib',
  'utils',
  'supabase/functions',
]

const CONTRACT_DIRS = [...CALL_DIRS, 'constants', 'types', 'supabase/migrations']
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.sql'])

function walk(relativeDir) {
  const absoluteDir = join(ROOT, relativeDir)
  if (!existsSync(absoluteDir)) return []
  const files = []
  for (const entry of readdirSync(absoluteDir).sort()) {
    const absolute = join(absoluteDir, entry)
    const relativePath = relative(ROOT, absolute).replaceAll('\\', '/')
    if (statSync(absolute).isDirectory()) files.push(...walk(relativePath))
    else if (SOURCE_EXTENSIONS.has(relativePath.slice(relativePath.lastIndexOf('.')))) files.push(relativePath)
  }
  return files
}

function sourceLink(path, line, label = `${path}:${line}`) {
  const encoded = path
    .split('/')
    .map(part => encodeURIComponent(part).replaceAll('(', '%28').replaceAll(')', '%29'))
    .join('/')
  return `[\`${label}\`](../${encoded}#L${line})`
}

function lineAt(text, index) {
  return text.slice(0, index).split('\n').length
}

function addCall(map, name, path, text, index) {
  if (!map.has(name)) map.set(name, [])
  map.get(name).push({ path, line: lineAt(text, index) })
}

function collect(pattern, files, nameAt = 2) {
  const found = new Map()
  for (const path of files) {
    const text = readFileSync(join(ROOT, path), 'utf8')
    for (const match of text.matchAll(pattern)) addCall(found, match[nameAt], path, text, match.index)
  }
  return found
}

function displaySites(sites) {
  const firstByFile = new Map()
  for (const site of sites) if (!firstByFile.has(site.path)) firstByFile.set(site.path, site)
  const unique = [...firstByFile.values()].sort((a, b) => a.path.localeCompare(b.path) || a.line - b.line)
  const shown = unique.slice(0, 6).map(site => sourceLink(site.path, site.line))
  if (unique.length > shown.length) shown.push(`+${unique.length - shown.length} more files`)
  return shown.join('<br>')
}

function tableRows(map, extraColumns = () => []) {
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, sites]) => {
      const extra = extraColumns(name)
      return `| \`${name}\` | ${displaySites(sites)}${extra.length ? ` | ${extra.join(' | ')}` : ''} |`
    })
    .join('\n')
}

function sqlFunctionDefinitions(sqlFiles) {
  const found = new Map()
  const pattern = /create\s+or\s+replace\s+function\s+(?:public\.)?([a-zA-Z0-9_]+)/gi
  for (const path of sqlFiles) {
    const text = readFileSync(join(ROOT, path), 'utf8')
    for (const match of text.matchAll(pattern)) addCall(found, match[1], path, text, match.index)
  }
  return found
}

function bucketConstants(files) {
  const constants = new Map()
  const pattern = /(?:export\s+)?const\s+([A-Z0-9_]*BUCKET[A-Z0-9_]*)\s*=\s*(['"])([^'"]+)\2/g
  for (const path of files) {
    const text = readFileSync(join(ROOT, path), 'utf8')
    for (const match of text.matchAll(pattern)) constants.set(match[1], match[3])
  }
  return constants
}

function storageCalls(files, constants) {
  const found = new Map()
  const pattern = /\.storage\s*\.from\(\s*([A-Z0-9_]+|['"][^'"]+['"])\s*\)/g
  for (const path of files) {
    const text = readFileSync(join(ROOT, path), 'utf8')
    for (const match of text.matchAll(pattern)) {
      const raw = match[1]
      const name = raw.startsWith("'") || raw.startsWith('"')
        ? raw.slice(1, -1)
        : (constants.get(raw) ?? raw)
      addCall(found, name, path, text, match.index)
    }
  }
  return found
}

function modelGroups() {
  const path = 'types/index.ts'
  const lines = readFileSync(join(ROOT, path), 'utf8').split('\n')
  const groups = new Map()
  let section = 'Other shared types'
  lines.forEach((line, index) => {
    const heading = line.match(/^\/\/\s*─+\s*(.*?)\s*─+\s*$/)
    if (heading) section = heading[1]
    const declaration = line.match(/^export type\s+([A-Za-z0-9_]+)/)
    if (!declaration) return
    if (!groups.has(section)) groups.set(section, [])
    groups.get(section).push(sourceLink(path, index + 1, declaration[1]))
  })
  return [...groups.entries()]
    .map(([sectionName, types]) => `| ${sectionName} | ${types.join(', ')} |`)
    .join('\n')
}

function constrainedValues() {
  const paths = ['types/index.ts', 'constants/events.ts', 'constants/badges.ts']
  const rows = []

  for (const path of paths) {
    const text = readFileSync(join(ROOT, path), 'utf8')
    const aliasPattern = /export\s+type\s+([A-Za-z0-9_]+)\s*=\s*([\s\S]*?)(?=\n(?:export\s+(?:type|const|function|interface)|\/\*\*|\/\/\s*─)|$)/g
    for (const match of text.matchAll(aliasPattern)) {
      const body = match[2]
      if (/[{\[]|typeof|Record<|Pick<|import\(/.test(body)) continue
      const values = [...body.matchAll(/'([^']+)'/g)].map(value => value[1])
      if (values.length < 2) continue
      rows.push({ name: match[1], values, path, line: lineAt(text, match.index) })
    }

    const lines = text.split('\n')
    let owner = null
    let depth = 0
    lines.forEach((line, index) => {
      const typeStart = line.match(/^export type\s+([A-Za-z0-9_]+)\s*=\s*\{/)
      if (typeStart) {
        owner = typeStart[1]
        depth = 0
      }
      if (!owner) return
      depth += (line.match(/\{/g) ?? []).length
      depth -= (line.match(/\}/g) ?? []).length
      const property = line.match(/^\s*([A-Za-z0-9_]+)\??:\s*('[^']+'(?:\s*\|\s*'[^']+')+)/)
      if (property) {
        const values = [...property[2].matchAll(/'([^']+)'/g)].map(value => value[1])
        if (values.length > 1) rows.push({ name: `${owner}.${property[1]}`, values, path, line: index + 1 })
      }
      if (depth === 0) owner = null
    })

    const constArrayPattern = /export const (NOTIFICATION_TYPES)\s*=\s*\[([\s\S]*?)\]\s*as const/g
    for (const match of text.matchAll(constArrayPattern)) {
      const values = [...match[2].matchAll(/'([^']+)'/g)].map(value => value[1])
      rows.push({ name: `${match[1]} / NotificationType`, values, path, line: lineAt(text, match.index) })
    }
  }

  return rows
    .filter((row, index) => rows.findIndex(candidate => candidate.name === row.name) === index)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(row => `| \`${row.name}\` | ${row.values.map(value => `\`${value}\``).join(', ')} | ${sourceLink(row.path, row.line)} |`)
    .join('\n')
}

/**
 * Line numbers in source links shift on almost every edit and say nothing about
 * the contract, so they are ignored when fingerprinting and when checking.
 */
function withoutLineNumbers(text) {
  return text.replace(/#L\d+/g, '#L').replace(/(\.(?:tsx?|sql)):\d+`/g, '$1`')
}

const FINGERPRINT_LINE = /^> Inventory fingerprint: `[0-9a-f]*`$/m

/** Hash of the rendered inventory (tables, RPCs, buckets, enums, ...), not of the source files behind it. */
function fingerprint(renderedBody) {
  return createHash('sha256').update(withoutLineNumbers(renderedBody)).digest('hex').slice(0, 12)
}

function buildGeneratedSection() {
  // Tests and their fakes (edge function handler tests, _shared/testing.ts) script
  // tables and payloads; they are not call sites.
  const callFiles = [...new Set(CALL_DIRS.flatMap(walk))]
    .filter(path => /\.(?:ts|tsx)$/.test(path) && !/\.test\.tsx?$/.test(path) && !path.endsWith('/_shared/testing.ts'))
    .sort()
  const sqlFiles = walk('supabase/migrations')
  const tables = collect(/\.from\(\s*(['"])([^'"]+)\1\s*\)/g, callFiles)
  const rpcs = collect(/\.rpc\(\s*(['"])([^'"]+)\1/g, callFiles)
  const edgeFunctions = collect(/\.functions\.invoke\(\s*(['"])([^'"]+)\1/g, callFiles)
  const auth = collect(/supabase\.auth\.([A-Za-z0-9_]+)\s*\(/g, callFiles, 1)
  const realtime = collect(/table:\s*(['"])([^'"]+)\1/g, callFiles)
  const definitions = sqlFunctionDefinitions(sqlFiles)
  const storage = storageCalls(callFiles, bucketConstants([...callFiles, ...walk('constants')]))

  const rpcDefinitions = name => [
    definitions.has(name) ? displaySites(definitions.get(name)) : 'Not checked in',
  ]

  const body = `
## Generated code inventory

> Do not edit this section by hand. Run \`npm run docs:update\` and commit the
> result. CI runs \`npm run docs:check\` and blocks a merge if it is stale.
>
> Inventory fingerprint: \`\`

This inventory is generated from the repository's TypeScript and SQL. It is the
fast lookup layer; the surrounding prose explains intent and relationships.

### Direct table and view calls

<details>
<summary>${tables.size} tables/views referenced by code</summary>

| Table or view | Frontend/server call sites |
|---|---|
${tableRows(tables)}

</details>

### Database RPC calls

| RPC | Call sites | SQL definition |
|---|---|---|
${tableRows(rpcs, rpcDefinitions)}

### Other Supabase surfaces

<details>
<summary>Auth, Realtime, Storage, and Edge Function call sites</summary>

| Surface | Name | Call sites |
|---|---|---|
${[...auth.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([name, sites]) => `| Auth | \`${name}\` | ${displaySites(sites)} |`).join('\n')}
${[...realtime.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([name, sites]) => `| Realtime table | \`${name}\` | ${displaySites(sites)} |`).join('\n')}
${[...storage.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([name, sites]) => `| Storage bucket | \`${name}\` | ${displaySites(sites)} |`).join('\n')}
${[...edgeFunctions.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([name, sites]) => `| Edge Function | \`${name}\` | ${displaySites(sites)} |`).join('\n')}

</details>

### Shared model index

| Section in \`types/index.ts\` | Exported types |
|---|---|
${modelGroups()}

### Constrained string values

The codebase uses string-literal unions and \`as const\` arrays instead of the
TypeScript \`enum\` keyword.

| Type or field | Values | Source |
|---|---|---|
${constrainedValues()}
`

  return `${BEGIN}${body.replace(FINGERPRINT_LINE, `> Inventory fingerprint: \`${fingerprint(body)}\``)}${END}`
}

const current = readFileSync(DOC_PATH, 'utf8')
const start = current.indexOf(BEGIN)
const finish = current.indexOf(END)
if (start === -1 || finish === -1 || finish < start) {
  console.error(`Missing generated-section markers in ${relative(ROOT, DOC_PATH)}`)
  process.exit(1)
}

const generated = buildGeneratedSection()
const expected = `${current.slice(0, start)}${generated}${current.slice(finish + END.length)}`

if (process.argv.includes('--check')) {
  // Compare the rendered inventory, ignoring source line numbers, so unrelated edits do not fail CI.
  if (withoutLineNumbers(expected) !== withoutLineNumbers(current)) {
    console.error('Architecture documentation is stale. Run: npm run docs:update')
    process.exit(1)
  }
  console.log('Architecture documentation is current.')
} else {
  writeFileSync(DOC_PATH, expected)
  console.log(`Updated ${relative(ROOT, DOC_PATH)}`)
}
