#!/usr/bin/env node
/**
 * Turns Jest's coverage/coverage-summary.json into a Markdown report: the
 * totals against the floor in package.json (jest.coverageThreshold), then the
 * least-covered folders, so thin areas are visible before a refactor.
 *
 *   node scripts/coverage-summary.mjs                    # print to stdout
 *   node scripts/coverage-summary.mjs >> "$GITHUB_STEP_SUMMARY"
 *
 * Jest itself fails the run when a total drops below the floor; this script
 * only reports.
 */
import { readFileSync } from 'node:fs'
import { relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const METRICS = ['statements', 'branches', 'functions', 'lines']

/** Folder of a file, two levels deep (`components/event`, `hooks`, `app/(app)`). */
export function folderOf(file, root) {
  const parts = relative(root, file).split(sep)
  return parts.length > 2 ? parts.slice(0, 2).join('/') : parts[0]
}

/** Sum per-file coverage into folders; returns [{ folder, lines: { total, covered, pct } }]. */
export function byFolder(summary, root) {
  const folders = new Map()
  for (const [file, data] of Object.entries(summary)) {
    if (file === 'total') continue
    const key = folderOf(file, root)
    const f = folders.get(key) ?? { total: 0, covered: 0 }
    f.total += data.lines.total
    f.covered += data.lines.covered
    folders.set(key, f)
  }
  return [...folders.entries()]
    .filter(([, f]) => f.total > 0)
    .map(([folder, f]) => ({ folder, lines: { ...f, pct: Math.round((f.covered / f.total) * 1000) / 10 } }))
    .sort((a, b) => a.lines.pct - b.lines.pct || b.lines.total - a.lines.total)
}

export function renderReport(summary, floor, root, worst = 10) {
  const total = summary.total
  const rows = METRICS.map(m => {
    const pct = total[m].pct
    const min = floor?.[m]
    const status = min === undefined ? '' : pct >= min ? 'ok' : '**below floor**'
    return `| ${m} | ${pct.toFixed(2)}% | ${total[m].covered} / ${total[m].total} | ${min === undefined ? '-' : `${min}%`} | ${status} |`
  })
  const folders = byFolder(summary, root).slice(0, worst).map(f =>
    `| \`${f.folder}\` | ${f.lines.pct}% | ${f.lines.covered} / ${f.lines.total} |`)
  return [
    '## Unit test coverage',
    '',
    '| Metric | Covered | Count | Floor | |',
    '|---|---|---|---|---|',
    ...rows,
    '',
    `<details><summary>Least-covered folders (lines)</summary>`,
    '',
    '| Folder | Lines | Count |',
    '|---|---|---|',
    ...folders,
    '',
    '</details>',
    '',
  ].join('\n')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = process.cwd()
  const summary = JSON.parse(readFileSync(resolve(root, 'coverage/coverage-summary.json'), 'utf8'))
  const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
  process.stdout.write(renderReport(summary, pkg.jest?.coverageThreshold?.global, root))
}
