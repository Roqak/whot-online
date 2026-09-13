/** Synthesized sound effects. No audio files to download. */

export type SoundName =
  | 'play'
  | 'draw'
  | 'turn'
  | 'special'
  | 'pick'
  | 'lastCard'
  | 'caught'
  | 'win'
  | 'lose'
  | 'error'
  | 'shuffle'
  | 'tap'

let ctx: AudioContext | null = null
let master: GainNode | null = null
let enabled = true

export function setSoundEnabled(on: boolean) {
  enabled = on
}

export function isSoundEnabled(): boolean {
  return enabled
}

function audio(): AudioContext | null {
  if (!enabled || typeof window === 'undefined') return null
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return null
    ctx = new AC()
    master = ctx.createGain()
    master.gain.value = 0.55
    master.connect(ctx.destination)
  }
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

/** Browsers only allow audio after a user gesture; call from the first tap. */
export function unlockAudio() {
  audio()
}

interface ToneOpts {
  freq: number
  at?: number
  dur?: number
  gain?: number
  type?: OscillatorType
  slideTo?: number
}

function tone(ac: AudioContext, { freq, at = 0, dur = 0.12, gain = 0.2, type = 'sine', slideTo }: ToneOpts) {
  const t = ac.currentTime + at
  const osc = ac.createOscillator()
  const amp = ac.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t)
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur)
  amp.gain.setValueAtTime(0.0001, t)
  amp.gain.exponentialRampToValueAtTime(gain, t + 0.008)
  amp.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  osc.connect(amp).connect(master!)
  osc.start(t)
  osc.stop(t + dur + 0.02)
}

let noiseBuffer: AudioBuffer | null = null

function noise(ac: AudioContext, { at = 0, dur = 0.06, gain = 0.3, freq = 2000, q = 1.2, type = 'bandpass' as BiquadFilterType }) {
  if (!noiseBuffer) {
    noiseBuffer = ac.createBuffer(1, ac.sampleRate * 0.5, ac.sampleRate)
    const data = noiseBuffer.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  }
  const t = ac.currentTime + at
  const src = ac.createBufferSource()
  src.buffer = noiseBuffer
  const filter = ac.createBiquadFilter()
  filter.type = type
  filter.frequency.value = freq
  filter.Q.value = q
  const amp = ac.createGain()
  amp.gain.setValueAtTime(gain, t)
  amp.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  src.connect(filter).connect(amp).connect(master!)
  src.start(t)
  src.stop(t + dur + 0.02)
}

export function playSound(name: SoundName) {
  const ac = audio()
  if (!ac) return
  switch (name) {
    case 'play':
      noise(ac, { dur: 0.07, gain: 0.35, freq: 2400 })
      tone(ac, { freq: 150, dur: 0.08, gain: 0.18, slideTo: 90 })
      break
    case 'draw':
      noise(ac, { dur: 0.12, gain: 0.22, freq: 1400, q: 0.7 })
      break
    case 'tap':
      noise(ac, { dur: 0.03, gain: 0.15, freq: 3200 })
      break
    case 'turn':
      tone(ac, { freq: 660, dur: 0.14, gain: 0.12 })
      tone(ac, { freq: 990, at: 0.09, dur: 0.2, gain: 0.1 })
      break
    case 'special':
      noise(ac, { dur: 0.08, gain: 0.3, freq: 1800 })
      tone(ac, { freq: 240, dur: 0.22, gain: 0.2, type: 'triangle', slideTo: 160 })
      break
    case 'pick':
      tone(ac, { freq: 520, dur: 0.12, gain: 0.1, type: 'square', slideTo: 300 })
      tone(ac, { freq: 420, at: 0.1, dur: 0.16, gain: 0.1, type: 'square', slideTo: 220 })
      break
    case 'lastCard':
      ;[784, 988, 1175].forEach((freq, i) => tone(ac, { freq, at: i * 0.07, dur: 0.14, gain: 0.12, type: 'triangle' }))
      break
    case 'caught':
      tone(ac, { freq: 190, dur: 0.24, gain: 0.14, type: 'sawtooth', slideTo: 120 })
      tone(ac, { freq: 150, at: 0.12, dur: 0.24, gain: 0.12, type: 'sawtooth', slideTo: 90 })
      break
    case 'win':
      ;[523, 659, 784, 1047].forEach((freq, i) => tone(ac, { freq, at: i * 0.1, dur: 0.3, gain: 0.12, type: 'triangle' }))
      break
    case 'lose':
      ;[392, 330, 262].forEach((freq, i) => tone(ac, { freq, at: i * 0.14, dur: 0.3, gain: 0.1, type: 'triangle' }))
      break
    case 'error':
      tone(ac, { freq: 170, dur: 0.1, gain: 0.1, type: 'square' })
      break
    case 'shuffle':
      for (let i = 0; i < 6; i++) noise(ac, { at: i * 0.045, dur: 0.05, gain: 0.18, freq: 1800 + i * 150 })
      break
  }
}

export function vibrate(pattern: number | number[]) {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate?.(pattern)
}
