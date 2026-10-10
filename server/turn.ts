import type { IceServer } from '../src/net/protocol'

/** Always available, free, and enough whenever two players can reach each other directly. */
export const STUN_ONLY: IceServer[] = [{ urls: 'stun:stun.cloudflare.com:3478' }]

/** How long Cloudflare's relay credentials stay valid. Longer than any sensible game. */
const TTL_SECONDS = 12 * 60 * 60
/** Hand out cached credentials while they have at least this long left. */
const REFRESH_MARGIN_MS = 2 * 60 * 60 * 1000
/** After a failed fetch, don't hammer the API on every voice join. */
const RETRY_AFTER_MS = 60 * 1000

export type IceServerProvider = () => Promise<IceServer[]>

/**
 * Many mobile networks (carrier-grade NAT) can't connect two phones directly,
 * so voice needs a relay. Cloudflare Realtime TURN mints short-lived
 * credentials from a key that stays on this server.
 *
 * Without CF_TURN_KEY_ID / CF_TURN_API_TOKEN (local dev, or before the keys
 * are set) voice still works over STUN for players who can connect directly.
 */
export function cloudflareIceServers(
  keyId = process.env.CF_TURN_KEY_ID,
  apiToken = process.env.CF_TURN_API_TOKEN,
  fetchImpl: typeof fetch = fetch,
  now: () => number = Date.now,
): IceServerProvider {
  if (!keyId || !apiToken) {
    console.log('[whot] voice: no Cloudflare TURN keys set, using STUN only')
    return async () => STUN_ONLY
  }

  let cached: { servers: IceServer[]; expiresAt: number } | null = null
  let failedAt: number | null = null
  let pending: Promise<IceServer[]> | null = null

  const refresh = async (): Promise<IceServer[]> => {
    try {
      const res = await fetchImpl(
        `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(keyId)}/credentials/generate-ice-servers`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ ttl: TTL_SECONDS }),
          signal: AbortSignal.timeout(5000),
        },
      )
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const body = (await res.json()) as { iceServers?: unknown }
      const servers = normalize(body.iceServers)
      if (!servers.length) throw new Error('no iceServers in response')
      cached = { servers, expiresAt: now() + TTL_SECONDS * 1000 }
      return servers
    } catch (err) {
      failedAt = now()
      console.error('[whot] voice: could not get TURN credentials, falling back to STUN', err)
      return cached?.servers ?? STUN_ONLY
    } finally {
      pending = null
    }
  }

  return async () => {
    if (cached && cached.expiresAt - now() > REFRESH_MARGIN_MS) return cached.servers
    if (failedAt !== null && now() - failedAt < RETRY_AFTER_MS) return cached?.servers ?? STUN_ONLY
    pending ??= refresh()
    return pending
  }
}

/** Cloudflare returns one entry or a list; keep only well-formed ones. */
function normalize(raw: unknown): IceServer[] {
  const list = Array.isArray(raw) ? raw : raw ? [raw] : []
  return list.flatMap((entry): IceServer[] => {
    if (!entry || typeof entry !== 'object') return []
    const { urls, username, credential } = entry as Record<string, unknown>
    const valid = typeof urls === 'string' || (Array.isArray(urls) && urls.every((u) => typeof u === 'string'))
    if (!valid) return []
    return [
      {
        urls: urls as string | string[],
        ...(typeof username === 'string' ? { username } : {}),
        ...(typeof credential === 'string' ? { credential } : {}),
      },
    ]
  })
}
