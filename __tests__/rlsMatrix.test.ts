import { readFileSync } from 'fs'
import { join } from 'path'
import { RLS_MATRIX } from '../e2e/rls/matrix'

/** Public table names in the generated types (the live schema). */
function tablesInTypes(): string[] {
  const src = readFileSync(join(__dirname, '..', 'types/database.ts'), 'utf8')
  const pub = src.indexOf('public: {')
  const start = src.indexOf('Tables: {', pub)
  const end = src.indexOf('Views: {', start)
  return [...src.slice(start, end).matchAll(/^ {6}([a-z0-9_]+): \{$/gm)].map(m => m[1]).sort()
}

describe('RLS matrix (#186)', () => {
  const inTypes = tablesInTypes()
  const inMatrix = Object.keys(RLS_MATRIX).sort()

  it('finds the tables', () => {
    expect(inTypes.length).toBeGreaterThan(40)
  })

  it('has an expectation for every public table', () => {
    const missing = inTypes.filter(t => !inMatrix.includes(t))
    // A new table needs a row in e2e/rls/matrix.ts.
    expect({ tablesWithoutExpectation: missing }).toEqual({ tablesWithoutExpectation: [] })
  })

  it('names no table that no longer exists', () => {
    const gone = inMatrix.filter(t => !inTypes.includes(t))
    expect({ matrixTablesNotInSchema: gone }).toEqual({ matrixTablesNotInSchema: [] })
  })

  it('explains every access that is not none', () => {
    const unexplained = Object.entries(RLS_MATRIX)
      .filter(([, spec]) => (spec.anonSelect !== 'none' || spec.anonInsert !== 'none') && !spec.why)
      .map(([table]) => table)
    expect({ unexplained }).toEqual({ unexplained: [] })
  })
})
