import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
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

  // Unknown paths fall back to the app shell so room links like /r/ABC123 work.
  const file = (await resolveFile(pathname)) ?? path.join(STATIC_ROOT, 'index.html')
  const immutable = pathname.startsWith('/assets/')
  res.writeHead(200, {
    'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream',
    'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
  })
  if (req.method === 'HEAD') return res.end()
  createReadStream(file)
    .on('error', () => res.destroy())
    .pipe(res)
})

attachGameServer(server)

server.listen(PORT, HOST, () => {
  console.log(`[whot] serving ${STATIC_ROOT} on http://${HOST}:${PORT}`)
})

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => server.close(() => process.exit(0)))
}
