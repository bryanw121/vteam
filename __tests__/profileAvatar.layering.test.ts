import fs from 'node:fs'
import path from 'node:path'

const source = fs.readFileSync(path.join(__dirname, '..', 'components', 'ProfileAvatar.tsx'), 'utf8')

function bodyOf(component: string, endMarker: string) {
  const start = source.indexOf(`function ${component}`)
  const end = source.indexOf(endMarker, start)
  return source.slice(start, end)
}

describe('elemental avatar border layering', () => {
  it.each([
    ['StormBorder', 'function AetherBorder'],
    ['AetherBorder', '/**\n * Avatar circle'],
  ])('%s leaves the photo interactive and draws its artwork above it', (component, nextComponent) => {
    const body = bodyOf(component, nextComponent)
    const photo = body.indexOf('<RingHole')
    const artwork = body.indexOf('<Svg pointerEvents="none"')

    expect(photo).toBeGreaterThan(-1)
    expect(artwork).toBeGreaterThan(photo)
  })
})
