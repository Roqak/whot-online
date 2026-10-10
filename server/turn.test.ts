import { describe, expect, it, vi } from 'vitest'
import { STUN_ONLY, cloudflareIceServers } from './turn'

const okResponse = (iceServers: unknown) => ({ ok: true, status: 201, json: async () => ({ iceServers }) }) as Response

describe('cloudflareIceServers', () => {
  it('uses STUN only when no keys are configured', async () => {
    const fetchImpl = vi.fn()
    const provider = cloudflareIceServers('', '', fetchImpl as unknown as typeof fetch)
    expect(await provider()).toEqual(STUN_ONLY)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('fetches credentials once, caches them, and keeps the token server-side', async () => {
    const servers = [
      { urls: ['stun:stun.cloudflare.com:3478'] },
      { urls: ['turn:turn.cloudflare.com:3478?transport=udp'], username: 'user', credential: 'pass' },
    ]
    const fetchImpl = vi.fn(async () => okResponse(servers))
    const provider = cloudflareIceServers('key-id', 'secret-token', fetchImpl as unknown as typeof fetch)

    const [a, b] = await Promise.all([provider(), provider()])
    expect(a).toEqual(servers)
    expect(b).toEqual(servers)
    expect(await provider()).toEqual(servers)
    expect(fetchImpl).toHaveBeenCalledTimes(1)

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://rtc.live.cloudflare.com/v1/turn/keys/key-id/credentials/generate-ice-servers')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer secret-token')
    expect(JSON.stringify(a)).not.toContain('secret-token')
  })

  it('falls back to STUN when Cloudflare fails, and backs off before retrying', async () => {
    let t = 0
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 500 }) as Response)
    const provider = cloudflareIceServers('key-id', 'token', fetchImpl as unknown as typeof fetch, () => t)
    vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(await provider()).toEqual(STUN_ONLY)
    t += 10_000
    expect(await provider()).toEqual(STUN_ONLY)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    t += 60_000
    await provider()
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })
})
