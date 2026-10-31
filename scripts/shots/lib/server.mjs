/**
 * Static server for a web export (`dist/`): clean URLs (`/clubs` → clubs.html),
 * directory index, and the dynamic-route rewrites from `serve.json` (copied from
 * public/serve.json on export), the same as `npx serve dist` in CI.
 */
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import { join, extname, normalize } from 'node:path'

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.map': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.otf': 'font/otf', '.woff': 'font/woff', '.woff2': 'font/woff2', '.webp': 'image/webp',
}

function loadRewrites(dist) {
  const file = join(dist, 'serve.json')
  if (!existsSync(file)) return []
  try {
    return (JSON.parse(readFileSync(file, 'utf8')).rewrites ?? []).map(r => {
      const re = new RegExp('^' + r.source.replace(/:[a-zA-Z]+/g, '[^/]+') + '/?$')
      return { re, destination: r.destination }
    })
  } catch { return [] }
}

async function isFile(p) { try { return (await stat(p)).isFile() } catch { return false } }

/** Start serving `dist` on a free port. Resolves to `{ url, close() }`. */
export function serveDist(dist) {
  const rewrites = loadRewrites(dist)
  const server = createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname)
      const safe = normalize(pathname).replace(/^(\.\.[/\\])+/, '')
      const candidates = [join(dist, safe), join(dist, `${safe}.html`), join(dist, safe, 'index.html')]
      for (const r of rewrites) if (r.re.test(pathname)) candidates.push(join(dist, r.destination))
      for (const file of candidates) {
        if (await isFile(file)) {
          res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' })
          return res.end(await readFile(file))
        }
      }
      const notFound = join(dist, '+not-found.html')
      res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' })
      res.end(existsSync(notFound) ? await readFile(notFound) : 'not found')
    } catch (e) {
      res.writeHead(500)
      res.end(String(e))
    }
  })
  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      resolve({ url: `http://127.0.0.1:${port}`, close: () => new Promise(r => server.close(() => r())) })
    })
  })
}
