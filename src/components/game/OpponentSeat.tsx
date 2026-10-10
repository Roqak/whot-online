import { AnimatePresence, motion } from 'framer-motion'
import { Bot, Mic, MicOff, WifiOff } from 'lucide-react'
import type { PublicPlayer } from '../../types/game'
import { Avatar } from '../Avatar'
import { TurnRing } from './TurnRing'

interface OpponentSeatProps {
  player: PublicPlayer
  onTurn: boolean
  fraction: number
  urgent: boolean
  catchable: boolean
  onCatch: () => void
  /** Set when both you and this player are in voice. */
  voice?: { speaking: boolean; muted: boolean } | null
  onToggleMute?: () => void
  /** Their latest quick-chat line, while it's showing. */
  said?: string | null
}

const AVATAR_SIZE = 46

export function OpponentSeat({ player, onTurn, fraction, urgent, catchable, onCatch, voice, onToggleMute, said }: OpponentSeatProps) {
  const out = player.eliminated
  const speaking = !!voice?.speaking && !voice.muted
  return (
    <div
      data-seat={player.id}
      className={`relative flex w-[88px] flex-col items-center rounded-2xl px-1 py-2 transition-colors ${
        onTurn ? 'bg-marigold/10 ring-1 ring-marigold/40' : ''
      }`}
    >
      <div
        className="relative"
        style={{ width: AVATAR_SIZE, height: AVATAR_SIZE, cursor: voice ? 'pointer' : undefined }}
        // In voice, tapping someone mutes them for you (and tapping again brings them back).
        {...(voice
          ? {
              role: 'button',
              tabIndex: 0,
              'aria-pressed': voice.muted,
              'aria-label': voice.muted ? `Unmute ${player.name}` : `Mute ${player.name}`,
              onClick: onToggleMute,
              onKeyDown: (e: React.KeyboardEvent) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onToggleMute?.()
                }
              },
            }
          : {})}
      >
        <Avatar id={player.avatar} size={AVATAR_SIZE} dimmed={out || !player.connected} />
        {speaking && <span className="absolute -inset-1 rounded-full ring-[3px] ring-leaf" aria-hidden="true" />}
        {voice && (
          <span
            className={`absolute -right-1 -top-1 rounded-full p-[3px] ${
              voice.muted ? 'bg-ember text-table-950' : speaking ? 'bg-leaf text-table-950' : 'bg-table-950 text-fg-muted'
            }`}
            title={voice.muted ? 'Muted by you' : speaking ? 'Talking' : 'In voice'}
          >
            {voice.muted ? <MicOff size={11} /> : <Mic size={11} />}
          </span>
        )}
        <TurnRing size={AVATAR_SIZE} fraction={fraction} active={onTurn} urgent={urgent} />
        {onTurn && <span className="absolute inset-0 rounded-full ring-2 ring-marigold/50 animate-pulse-ring" />}
        {!player.connected && !out && (
          <span className="absolute -bottom-1 -right-1 rounded-full bg-table-950 p-0.5 text-fg-faint" title="Reconnecting">
            <WifiOff size={12} />
          </span>
        )}
        {player.isBot && (
          <span className="absolute -bottom-1 -right-1 rounded-full bg-table-950 p-0.5 text-fg-faint" title="Bot">
            <Bot size={12} />
          </span>
        )}
      </div>

      <span
        className={`mt-1 flex max-w-full items-center gap-1 truncate text-xs font-semibold ${
          out ? 'text-fg-faint line-through' : onTurn ? 'text-marigold' : 'text-fg-muted'
        }`}
      >
        <span className="truncate">{player.name}</span>
        {onTurn && !out && (
          <span className="flex shrink-0 gap-0.5" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="h-1 w-1 animate-dot-bounce rounded-full bg-marigold"
                style={{ animationDelay: `${i * 140}ms` }}
              />
            ))}
          </span>
        )}
      </span>

      {out ? (
        <span className="chip mt-0.5 bg-table-700/60 px-2 py-0 text-[10px] text-fg-faint">
          {player.left ? 'Left' : 'Out'}
        </span>
      ) : (
        <div className="mt-1 flex items-center gap-1">
          <div className="flex">
            {Array.from({ length: Math.min(player.handCount, 6) }, (_, i) => (
              <span
                key={i}
                className="h-[13px] w-[7px] rounded-[2px] border border-paper/30 bg-ink"
                style={{ marginLeft: i === 0 ? 0 : -2, transform: `rotate(${(i - 2.5) * 3}deg)` }}
              />
            ))}
          </div>
          <span className="text-xs font-bold tabular-nums text-fg">{player.handCount}</span>
        </div>
      )}

      {player.announcedLastCard && !out && (
        <span className="chip mt-1 bg-marigold px-2 py-0 text-[10px] font-bold text-table-950">LAST CARD</span>
      )}

      {/* Centred by the wrapper: motion's own transform would override a CSS translate. */}
      <div className="pointer-events-none absolute inset-x-[-40px] top-full z-30 mt-1 flex justify-center">
        <AnimatePresence>
          {said && (
            <motion.span
              key={said}
              initial={{ opacity: 0, y: -4, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              role="status"
              className="relative w-max max-w-[160px] rounded-xl bg-paper px-2.5 py-1.5 text-center text-xs font-semibold leading-tight text-table-950 shadow-card-lift"
            >
              <span aria-hidden="true" className="absolute -top-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 bg-paper" />
              {said}
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      {catchable && (
        <motion.button
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onCatch}
          className="absolute -bottom-3 z-10 rounded-full bg-ember px-3 py-1 text-[11px] font-bold text-table-950 shadow-card"
        >
          Catch!
        </motion.button>
      )}
    </div>
  )
}
