import { test } from 'node:test'
import assert from 'node:assert/strict'
import { byFolder, folderOf, renderReport } from './coverage-summary.mjs'

const m = (covered, total) => ({ covered, total, pct: total ? Math.round((covered / total) * 10000) / 100 : 100 })
const file = (covered, total) => ({ statements: m(covered, total), branches: m(covered, total), functions: m(covered, total), lines: m(covered, total) })
const summary = {
  total: { statements: m(30, 100), branches: m(20, 100), functions: m(30, 100), lines: m(30, 100) },
  '/r/hooks/useA.ts': file(9, 10),
  '/r/components/event/X.tsx': file(1, 50),
  '/r/components/event/Y.tsx': file(0, 10),
  '/r/utils/index.ts': file(20, 30),
}

test('folders are two levels deep', () => {
  assert.equal(folderOf('/r/components/event/X.tsx', '/r'), 'components/event')
  assert.equal(folderOf('/r/hooks/useA.ts', '/r'), 'hooks')
})

test('folders sum their files and sort least covered first', () => {
  const f = byFolder(summary, '/r')
  assert.deepEqual(f.map(x => x.folder), ['components/event', 'utils', 'hooks'])
  assert.deepEqual(f[0].lines, { total: 60, covered: 1, pct: 1.7 })
})

test('the report flags a metric below the floor', () => {
  const out = renderReport(summary, { statements: 25, branches: 25, functions: 25, lines: 25 }, '/r')
  assert.match(out, /\| statements \| 30\.00% \| 30 \/ 100 \| 25% \| ok \|/)
  assert.match(out, /\| branches \| 20\.00% \| 20 \/ 100 \| 25% \| \*\*below floor\*\* \|/)
  assert.match(out, /`components\/event` \| 1\.7%/)
})
