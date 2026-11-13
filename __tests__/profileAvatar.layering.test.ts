import fs from 'node:fs'
import path from 'node:path'

const avatarSource = fs.readFileSync(path.join(__dirname, '..', 'components', 'ProfileAvatar.tsx'), 'utf8')
const frameSource = fs.readFileSync(path.join(__dirname, '..', 'components', 'profile', 'ElementalBorderFrame.tsx'), 'utf8')

function bodyOf(component: string, endMarker: string) {
  const start = avatarSource.indexOf(`function ${component}`)
  const end = avatarSource.indexOf(endMarker, start)
  return avatarSource.slice(start, end)
}

describe('elemental avatar border layering', () => {
  it.each([
    ['StormBorder', 'function AetherBorder'],
    ['AetherBorder', '/**\n * Avatar circle'],
  ])('%s uses the shared photo-safe elemental frame', (component, nextComponent) => {
    const body = bodyOf(component, nextComponent)
    expect(body).toContain('<ElementalBorderFrame')
  })

  it('draws decoration before the opaque photo centre', () => {
    expect(frameSource.indexOf('<Svg pointerEvents="none"')).toBeLessThan(frameSource.indexOf('backgroundColor: centreColor'))
  })
})
