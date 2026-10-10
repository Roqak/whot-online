import { Loader2, Mic, MicOff, PhoneOff } from 'lucide-react'
import { useGameStore } from '../store/gameStore'

/**
 * Join voice, then mute or leave. Opt-in: the mic is only requested when the
 * player taps "Voice". Hidden where voice can't work (solo, portals, spectators).
 */
export function VoiceControls() {
  const canUseVoice = useGameStore((s) => s.canUseVoice)
  const isLocal = useGameStore((s) => s.isLocal)
  const session = useGameStore((s) => s.session)
  const voice = useGameStore((s) => s.voice)
  const myId = session?.playerId
  const joinVoice = useGameStore((s) => s.joinVoice)
  const leaveVoice = useGameStore((s) => s.leaveVoice)
  const toggleVoiceMute = useGameStore((s) => s.toggleVoiceMute)

  if (!canUseVoice || isLocal || !session) return null

  if (voice.status === 'off') {
    return (
      <button className="btn-icon gap-1.5 px-2.5 text-xs font-semibold" onClick={() => void joinVoice()} aria-label="Join voice chat">
        <Mic size={16} />
        Voice
      </button>
    )
  }

  if (voice.status === 'joining') {
    return (
      <span className="btn-icon gap-1.5 px-2.5 text-xs font-semibold" role="status">
        <Loader2 size={16} className="animate-spin" />
        Joining
      </span>
    )
  }

  const talking = !voice.muted && !!myId && voice.speaking.includes(myId)
  return (
    <div className="flex items-center gap-0.5" role="group" aria-label="Voice chat">
      <button
        className={`btn-icon relative ${voice.muted ? 'text-ember' : 'text-leaf'}`}
        onClick={toggleVoiceMute}
        aria-pressed={voice.muted}
        aria-label={voice.muted ? 'Unmute your microphone' : 'Mute your microphone'}
        title={voice.muted ? 'You are muted' : 'Your mic is on'}
      >
        {talking && <span className="absolute inset-1 rounded-lg ring-2 ring-leaf/70" aria-hidden="true" />}
        {voice.muted ? <MicOff size={17} /> : <Mic size={17} />}
      </button>
      <button className="btn-icon" onClick={leaveVoice} aria-label="Leave voice chat" title="Leave voice">
        <PhoneOff size={16} />
      </button>
    </div>
  )
}
