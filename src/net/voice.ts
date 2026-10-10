import type { IceServer, RtcDescription } from './protocol'

/**
 * Table voice chat: every player in voice holds one direct audio connection to
 * every other (a mesh). Tables are at most six people and voice is ~24 kbps,
 * so this needs no media server; the game socket only introduces the peers.
 *
 * Call setup is non-trickle: each side gathers its ICE candidates (including
 * TURN relays) before sending one description. That's one offer and one
 * answer per pair, which stays well inside the socket's rate limit.
 */

/** Opus at 24 kbps is clear for speech and kind to mobile data (~11 MB/hour per voice). */
const MAX_AUDIO_BITRATE = 24_000
/** Give up waiting for more candidates after this; relays usually arrive well within it. */
const ICE_GATHER_TIMEOUT_MS = 3000
const SPEAKING_POLL_MS = 120
/** RMS level above which someone counts as talking. */
const SPEAKING_THRESHOLD = 0.035
/** Keep the "speaking" ring on through the gaps between words. */
const SPEAKING_HOLD_MS = 350
const MAX_RECONNECTS = 3

export type VoiceSignal = (to: string, description: RtcDescription) => void

export interface VoiceListener {
  /** Ids currently talking, including your own id while you speak unmuted. */
  speaking(ids: string[]): void
  /** A peer's connection gave up for good. */
  peerFailed?(id: string): void
}

interface Peer {
  pc: RTCPeerConnection
  audio: HTMLAudioElement
  /** The side with the smaller id calls; the other answers. Avoids both calling at once. */
  caller: boolean
  reconnects: number
  retryTimer: ReturnType<typeof setTimeout> | null
}

interface Meter {
  analyser: AnalyserNode
  source: MediaStreamAudioSourceNode
  buffer: Float32Array
  lastLoud: number
}

export function voiceSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.RTCPeerConnection === 'function' &&
    !!navigator.mediaDevices?.getUserMedia
  )
}

export class VoiceChat {
  private myId = ''
  private iceServers: IceServer[] | null = null
  private wanted: string[] = []
  private peers = new Map<string, Peer>()
  private local: MediaStream | null = null
  private ctx: AudioContext | null = null
  private meters = new Map<string, Meter>()
  private poll: ReturnType<typeof setInterval> | null = null
  private lastSpeaking = ''
  private mutedPeers = new Set<string>()
  private stopped = false

  constructor(
    private signal: VoiceSignal,
    private listener: VoiceListener,
  ) {}

  /**
   * Asks for the microphone. Must run inside the tap that joined voice: that
   * same gesture also unlocks audio playback and the AudioContext.
   */
  async start(): Promise<void> {
    this.local = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: false,
    })
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      this.ctx = new Ctx()
      void this.ctx.resume()
    } catch {
      // No Web Audio: voice still works, just without speaking rings.
      this.ctx = null
    }
    this.poll = setInterval(() => this.measure(), SPEAKING_POLL_MS)
  }

  setMyId(id: string) {
    if (this.myId === id) return
    this.myId = id
    if (this.local) this.meter(id, this.local)
  }

  /** The servers arrive just before the table sees us in voice; calls can start from here. */
  setIceServers(servers: IceServer[]) {
    this.iceServers = servers
    this.sync(this.wanted)
  }

  /** Who should we be talking to: everyone else at the table who is in voice and connected. */
  sync(peerIds: string[]) {
    this.wanted = peerIds
    if (this.stopped || !this.iceServers || !this.myId) return
    for (const [id] of this.peers) {
      if (!peerIds.includes(id)) this.drop(id)
    }
    for (const id of peerIds) {
      if (!this.peers.has(id) && this.myId < id) void this.call(id)
    }
  }

  async handleDescription(from: string, description: RtcDescription) {
    if (this.stopped || !this.iceServers) return
    if (description.type === 'offer') {
      // A fresh offer replaces whatever we had with them (they reconnected, or retried).
      this.drop(from)
      const peer = this.connect(from, false)
      try {
        await peer.pc.setRemoteDescription(description)
        await peer.pc.setLocalDescription(await peer.pc.createAnswer())
        await this.limitBitrate(peer.pc)
        const answer = await this.gathered(peer.pc)
        if (this.peers.get(from) === peer && answer) this.signal(from, answer)
      } catch (err) {
        console.warn('[voice] could not answer', err)
        this.drop(from)
      }
      return
    }
    const peer = this.peers.get(from)
    if (!peer || peer.pc.signalingState !== 'have-local-offer') return
    try {
      await peer.pc.setRemoteDescription(description)
    } catch (err) {
      console.warn('[voice] bad answer', err)
    }
  }

  setMuted(muted: boolean) {
    for (const track of this.local?.getAudioTracks() ?? []) track.enabled = !muted
  }

  /** Mutes one player for you only; they can still hear you. */
  setPeerMuted(id: string, muted: boolean) {
    if (muted) this.mutedPeers.add(id)
    else this.mutedPeers.delete(id)
    const peer = this.peers.get(id)
    if (peer) peer.audio.muted = muted
  }

  stop() {
    this.stopped = true
    for (const id of [...this.peers.keys()]) this.drop(id)
    for (const track of this.local?.getTracks() ?? []) track.stop()
    this.local = null
    for (const meter of this.meters.values()) meter.source.disconnect()
    this.meters.clear()
    if (this.poll) clearInterval(this.poll)
    void this.ctx?.close().catch(() => {})
    this.ctx = null
    this.listener.speaking([])
  }

  // Connections

  private async call(id: string, reconnects = 0) {
    const peer = this.connect(id, true, reconnects)
    try {
      await peer.pc.setLocalDescription(await peer.pc.createOffer())
      await this.limitBitrate(peer.pc)
      const offer = await this.gathered(peer.pc)
      if (this.peers.get(id) === peer && offer) this.signal(id, offer)
    } catch (err) {
      console.warn('[voice] could not call', err)
      this.drop(id)
    }
  }

  private connect(id: string, caller: boolean, reconnects = 0): Peer {
    const pc = new RTCPeerConnection({ iceServers: this.iceServers ?? [] })
    for (const track of this.local?.getAudioTracks() ?? []) pc.addTrack(track, this.local!)

    // Playing through an element (not only Web Audio) is what makes remote
    // WebRTC audio audible in Chrome; it lives in the DOM for Safari.
    const audio = document.createElement('audio')
    audio.autoplay = true
    audio.setAttribute('playsinline', '')
    audio.muted = this.mutedPeers.has(id)
    audio.style.display = 'none'
    document.body.appendChild(audio)

    const peer: Peer = { pc, audio, caller, reconnects, retryTimer: null }
    this.peers.set(id, peer)

    pc.ontrack = (event) => {
      const stream = event.streams[0] ?? new MediaStream([event.track])
      audio.srcObject = stream
      void audio.play().catch(() => {})
      this.meter(id, stream)
    }
    pc.onconnectionstatechange = () => {
      if (this.peers.get(id) !== peer) return
      if (pc.connectionState === 'connected') peer.reconnects = 0
      if (pc.connectionState === 'failed') this.retry(id, peer)
    }
    return peer
  }

  /** Only the caller redials, with backoff, so the two sides don't race each other. */
  private retry(id: string, peer: Peer) {
    if (!peer.caller || peer.retryTimer) return
    if (peer.reconnects >= MAX_RECONNECTS) {
      this.listener.peerFailed?.(id)
      return
    }
    peer.retryTimer = setTimeout(() => {
      if (this.peers.get(id) !== peer || !this.wanted.includes(id)) return
      this.drop(id)
      void this.call(id, peer.reconnects + 1)
    }, 1000 * 2 ** peer.reconnects)
  }

  private drop(id: string) {
    const peer = this.peers.get(id)
    if (!peer) return
    this.peers.delete(id)
    if (peer.retryTimer) clearTimeout(peer.retryTimer)
    peer.pc.ontrack = null
    peer.pc.onconnectionstatechange = null
    peer.pc.close()
    peer.audio.srcObject = null
    peer.audio.remove()
    const meter = this.meters.get(id)
    meter?.source.disconnect()
    this.meters.delete(id)
  }

  /** Resolves with the local description once ICE gathering finishes (or times out). */
  private gathered(pc: RTCPeerConnection): Promise<RtcDescription | null> {
    const done = () => {
      const d = pc.localDescription
      return d && (d.type === 'offer' || d.type === 'answer') ? { type: d.type, sdp: d.sdp } : null
    }
    if (pc.iceGatheringState === 'complete') return Promise.resolve(done())
    return new Promise((resolve) => {
      const finish = () => {
        clearTimeout(timer)
        pc.removeEventListener('icegatheringstatechange', onChange)
        resolve(done())
      }
      const onChange = () => pc.iceGatheringState === 'complete' && finish()
      const timer = setTimeout(finish, ICE_GATHER_TIMEOUT_MS)
      pc.addEventListener('icegatheringstatechange', onChange)
    })
  }

  private async limitBitrate(pc: RTCPeerConnection) {
    for (const sender of pc.getSenders()) {
      if (sender.track?.kind !== 'audio') continue
      try {
        const params = sender.getParameters()
        params.encodings = params.encodings?.length ? params.encodings : [{}]
        params.encodings[0].maxBitrate = MAX_AUDIO_BITRATE
        await sender.setParameters(params)
      } catch {
        // Older WebViews can't cap it; Opus's default (~32 kbps) is fine too.
      }
    }
  }

  // Speaking rings

  private meter(id: string, stream: MediaStream) {
    if (!this.ctx || !id) return
    this.meters.get(id)?.source.disconnect()
    try {
      const source = this.ctx.createMediaStreamSource(stream)
      const analyser = this.ctx.createAnalyser()
      analyser.fftSize = 512
      source.connect(analyser)
      this.meters.set(id, { analyser, source, buffer: new Float32Array(analyser.fftSize), lastLoud: 0 })
    } catch {
      // Not fatal: that player just won't light up.
    }
  }

  private measure() {
    const now = performance.now()
    const speaking: string[] = []
    const localOn = this.local?.getAudioTracks().some((t) => t.enabled) ?? false
    for (const [id, meter] of this.meters) {
      if (id === this.myId ? !localOn : this.mutedPeers.has(id)) continue
      meter.analyser.getFloatTimeDomainData(meter.buffer as Float32Array<ArrayBuffer>)
      let sum = 0
      for (const v of meter.buffer) sum += v * v
      if (Math.sqrt(sum / meter.buffer.length) > SPEAKING_THRESHOLD) meter.lastLoud = now
      if (now - meter.lastLoud < SPEAKING_HOLD_MS) speaking.push(id)
    }
    const key = speaking.sort().join(',')
    if (key === this.lastSpeaking) return
    this.lastSpeaking = key
    this.listener.speaking(speaking)
  }
}
