#!/usr/bin/env node
/**
 * Turns the integration suite's Playwright JSON report into a Markdown job summary:
 * a pass/fail count per area (file), then each failing test with the first lines
 * of its error (the server's own message, as helpers.ok() words it).
 *   node scripts/integration-summary.mjs integration.json >> "$GITHUB_STEP_SUMMARY"
 */
import { readFileSync } from 'node:fs'

const report = JSON.parse(readFileSync(process.argv[2] ?? 'integration.json', 'utf8'))
const rows = []
const failures = []

function walk(suite, file) {
  const f = suite.file ?? file
  for (const spec of suite.specs ?? []) {
    for (const t of spec.tests ?? []) {
      const last = t.results?.[t.results.length - 1]
      const status = t.status === 'skipped' ? 'skipped' : last?.status === 'passed' || t.status === 'expected' || t.status === 'flaky' ? 'passed' : 'failed'
      rows.push({ file: f, title: spec.title, status })
      if (status === 'failed') failures.push({ file: f, title: spec.title, error: (last?.error?.message ?? '').replace(/\u001b\[[0-9;]*m/g, '').split('\n').slice(0, 4).join(' ') })
    }
  }
  for (const s of suite.suites ?? []) walk(s, f)
}
for (const s of report.suites ?? []) walk(s, s.file)

const byFile = new Map()
for (const r of rows) {
  const k = r.file.replace(/^.*integration\//, '').replace('.int.spec.ts', '')
  const c = byFile.get(k) ?? { passed: 0, failed: 0, skipped: 0 }
  c[r.status]++
  byFile.set(k, c)
}

const total = rows.length
const failed = failures.length
console.log(`## Integration (beta): ${failed === 0 ? 'all passing' : `${failed} failing`} · ${total} tests\n`)
console.log('| Area | Passed | Failed | Skipped |\n| --- | --- | --- | --- |')
for (const [k, c] of [...byFile].sort()) console.log(`| ${k} | ${c.passed} | ${c.failed} | ${c.skipped} |`)
if (failed) {
  console.log('\n### Failing\n')
  for (const f of failures) console.log(`- **${f.file.replace(/^.*integration\//, '')}** · ${f.title}\n  \`${f.error.slice(0, 400)}\``)
}
