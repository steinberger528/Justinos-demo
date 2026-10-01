// Serves the static export in ./out the way GitHub Pages does, with no dependencies.
//
//   npm run build && npm run preview
//
// Set PAGES_BASE_PATH for both commands to preview the site under a sub-path,
// exactly as it is deployed:
//
//   PAGES_BASE_PATH=/Justinos-demo npm run build
//   PAGES_BASE_PATH=/Justinos-demo npm run preview

import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize, sep } from 'node:path'

const root = join(process.cwd(), 'out')
const base = (process.env.PAGES_BASE_PATH ?? '').replace(/\/+$/, '')
const port = Number(process.env.PORT ?? 4173)

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
}

async function isFile(path) {
  try {
    return (await stat(path)).isFile()
  } catch {
    return false
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${port}`)
  let pathname = decodeURIComponent(url.pathname)

  if (base) {
    if (pathname === base) {
      res.writeHead(301, { Location: `${base}/` }).end()
      return
    }
    if (!pathname.startsWith(`${base}/`)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end(`Not found. The site is served under ${base}/`)
      return
    }
    pathname = pathname.slice(base.length)
  }

  // Never serve anything outside ./out.
  const target = normalize(join(root, pathname))
  if (target !== root && !target.startsWith(root + sep)) {
    res.writeHead(403).end()
    return
  }

  let file = null
  if (await isFile(target)) file = target
  else if (await isFile(join(target, 'index.html'))) {
    if (!pathname.endsWith('/')) {
      res.writeHead(301, { Location: `${base}${pathname}/${url.search}` }).end()
      return
    }
    file = join(target, 'index.html')
  } else if (await isFile(`${target}.html`)) file = `${target}.html`

  // Anything unknown gets the exported 404 page, as it would on GitHub Pages.
  const served = file ?? join(root, '404.html')
  const body = await readFile(served)
  res.writeHead(file ? 200 : 404, { 'Content-Type': TYPES[extname(served)] ?? 'application/octet-stream' }).end(body)
})

server.listen(port, () => {
  console.log(`Serving ./out at http://localhost:${port}${base}/`)
})
