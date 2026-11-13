import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * The publishing half of the #34 fix: `/host` must announce an edit. Since
 * #188 part 4 the save is one `save_event` call through useSaveEvent, whose
 * `useMutation` invalidates after the whole transaction (rows, tags, waitlist)
 * has committed, and never after a failure, because nothing was written. The
 * consuming half (event/[id] refetching every piece of `event:<id>`) is a real
 * hook test in eventHooks.test.tsx.
 */

const root = join(__dirname, '..')
const host = readFileSync(join(root, 'app/(app)/host.tsx'), 'utf8')
const saveHook = readFileSync(join(root, 'hooks/host/useSaveEvent.ts'), 'utf8')

describe('host saves publish the invalidation signal', () => {
  it('the save hook invalidates every saved event, the feed and club pages', () => {
    expect(saveHook).toMatch(/invalidates: \(_input, ids\) => \[\.\.\.ids\.map\(id => queryKey\('event', id\)\), 'feed', 'club'\]/)
    expect(saveHook).not.toMatch(/dataVersion/)
  })

  it('the screen saves through the hook', () => {
    expect(host).toMatch(/const saveMutation = useSaveEvent\(\)/)
    expect(host).toMatch(/await saveMutation\.mutate\(/)
  })

  it('a saved template refreshes the templates list', () => {
    expect(host).toMatch(/invalidate\(queryKey\('templates'\)\)/)
  })
})
