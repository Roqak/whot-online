import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createGzip } from 'node:zlib'
import { attachGameServer } from './attach'

const PORT = Number(process.env.PORT ?? 3000)
const HOST = process.env.HOST ?? '0.0.0.0'
const STATIC_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), process.env.STATIC_DIR ?? '../dist')

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
}

const COMPRESSIBLE = new Set(['.html', '.js', '.css', '.svg', '.json', '.webmanifest'])

async function resolveFile(urlPath: string): Promise<string | null> {
  let decoded: string
  try {
    decoded = decodeURIComponent(urlPath)
  } catch {
    return null
  }
  const filePath = path.join(STATIC_ROOT, path.normalize(decoded))
  if (!filePath.startsWith(STATIC_ROOT)) return null
  try {
    const info = await stat(filePath)
    return info.isFile() ? filePath : null
  } catch {
    return null
  }
}

const server = http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url ?? '/', 'http://localhost')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')

  if (pathname === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    return res.end('ok')
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405)
    return res.end()
  }

  const isAsset = pathname.startsWith('/assets/')
  const found = await resolveFile(pathname)

  // A missing hashed asset is a real 404. Falling back to index.html here would cache
  // HTML under a script's URL for a year, and break old tabs after every deploy.
  if (!found && isAsset) {
    res.writeHead(404, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' })
    return res.end('Not found')
  }

  // Unknown app paths fall back to the shell so room links like /r/ABC123 work.
  const file = found ?? path.join(STATIC_ROOT, 'index.html')
  const ext = path.extname(file)
  const gzip = COMPRESSIBLE.has(ext) && /\bgzip\b/.test(String(req.headers['accept-encoding'] ?? ''))

  res.writeHead(200, {
    'Content-Type': MIME[ext] ?? 'application/octet-stream',
    'Cache-Control': isAsset && found ? 'public, max-age=31536000, immutable' : 'no-cache',
    Vary: 'Accept-Encoding',
    ...(gzip ? { 'Content-Encoding': 'gzip' } : {}),
  })
  if (req.method === 'HEAD') return res.end()

  const source = createReadStream(file).on('error', () => res.destroy())
  if (gzip) {
    source
      .pipe(createGzip())
      .on('error', () => res.destroy())
      .pipe(res)
  } else {
    source.pipe(res)
  }
})

attachGameServer(server)

server.listen(PORT, HOST, () => {
  console.log(`[whot] serving ${STATIC_ROOT} on http://${HOST}:${PORT}`)
})

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => server.close(() => process.exit(0)))
}
