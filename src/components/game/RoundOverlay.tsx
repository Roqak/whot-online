import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Trophy, Loader2 } from 'lucide-react'
import type { GameView } from '../../types/game'
import { Avatar } from '../Avatar'
import { WhotCard } from '../cards/WhotCard'
import { portalGameplayStop, portalHappyTime, requestMidroll } from '../../lib/portalSdk'

interface RoundOverlayProps {
  view: GameView
  isHost: boolean
  secondsLeft: number
  onNextRound: () => void
  onBackToLobby: () => void
  onLeave: () => void
}

export function RoundOverlay({ view, isHost, secondsLeft, onNextRound, onBackToLobby, onLeave }: RoundOverlayProps) {
  const [adWaiting, setAdWaiting] = useState(false)
  const result = view.lastRound
  const matchOver = view.phase === 'matchOver'
  const championId = view.matchWinnerId
  const name = (id: string) => view.players.find((p) => p.id === id)?.name ?? 'Someone'
  const winnerId = matchOver ? (championId ?? result?.winnerId) : result?.winnerId
  const iWon = winnerId === view.myId

  useEffect(() => {
    portalGameplayStop()
    if (iWon) {
      portalHappyTime()
    }
  }, [iWon])

  const handleFinishAction = async (action: () => void) => {
    if (adWaiting) return
    if (matchOver) {
      setAdWaiting(true)
      try {
        await requestMidroll()
      } finally {
        setAdWaiting(false)
      }
    }
    action()
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-40 flex items-center justify-center bg-table-950/85 px-4"
      role="dialog"
      aria-modal="true"
      aria-label={matchOver ? 'Match over' : 'Round over'}
    >
      <motion.div
        initial={{ y: 16, scale: 0.97 }}
        animate={{ y: 0, scale: 1 }}
        transition={{ duration: 0.28, ease: [0.25, 1, 0.5, 1] }}
        className="panel max-h-full w-full max-w-md overflow-y-auto rounded-2xl p-5"
      >
        <header className="text-center">
          {matchOver ? (
            <Trophy className="mx-auto mb-2 text-marigold" size={28} />
          ) : (
            <p className="text-xs uppercase tracking-[0.2em] text-fg-faint">Round {result?.round}</p>
          )}
          <h2 className="font-display text-3xl font-extrabold">
            {matchOver ? (iWon ? 'You win the match' : `${name(winnerId ?? '')} wins`) : iWon ? 'Check up!' : `${name(winnerId ?? '')} checks up`}
          </h2>
          {result?.reason === 'tender' && !matchOver && (
            <p className="mt-1 text-sm text-fg-muted">Market finished, so the lowest hand won</p>
          )}
        </header>

        {result && (
          <ul className="mt-4 space-y-2">
            {[...result.hands]
              .sort((a, b) => a.points - b.points)
              .map((entry) => {
                const player = view.players.find((p) => p.id === entry.playerId)
                if (!player) return null
                const eliminated = result.eliminatedIds.includes(player.id)
                return (
                  <li
                    key={entry.playerId}
                    className={`flex items-center gap-3 rounded-xl px-3 py-2 ${
                      entry.playerId === winnerId ? 'bg-marigold/15 ring-1 ring-marigold/40' : 'bg-table-800/50'
                    }`}
                  >
                    <Avatar id={player.avatar} size={32} dimmed={eliminated} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {player.name}
                        {eliminated && <span className="ml-2 text-[10px] uppercase text-ember">out</span>}
                      </p>
                      <div className="mt-1 flex gap-0.5">
                        {entry.cards.slice(0, 8).map((card) => (
                          <span key={card.id} className="w-[22px]">
                            <WhotCard card={card} />
                          </span>
                        ))}
                        {entry.cards.length === 0 && <span className="text-[11px] text-fg-faint">Emptied their hand</span>}
                        {entry.cards.length > 8 && <span className="text-[11px] text-fg-faint">+{entry.cards.length - 8}</span>}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-display text-lg font-bold tabular-nums">+{entry.points}</p>
                      {view.settings.targetScore > 0 && (
                        <p className="text-[11px] text-fg-faint tabular-nums">
                          {player.score}/{view.settings.targetScore}
                        </p>
                      )}
                    </div>
                  </li>
                )
              })}
          </ul>
        )}

        <div className="mt-5 flex gap-2">
          {matchOver ? (
            <>
              <button
                className="btn-primary flex-1"
                disabled={adWaiting}
                onClick={() => handleFinishAction(isHost ? onBackToLobby : onLeave)}
              >
                {adWaiting ? <Loader2 size={16} className="animate-spin" /> : isHost ? 'Play again' : 'Leave table'}
              </button>
              {isHost && (
                <button className="btn-ghost" disabled={adWaiting} onClick={() => handleFinishAction(onLeave)}>
                  Leave
                </button>
              )}
            </>
          ) : isHost ? (
            <button className="btn-primary flex-1" onClick={onNextRound}>
              Next round {secondsLeft > 0 && <span className="tabular-nums opacity-70">({secondsLeft}s)</span>}
            </button>
          ) : (
            <p className="flex-1 py-3 text-center text-sm text-fg-muted">
              Next round starts {secondsLeft > 0 ? `in ${secondsLeft}s` : 'shortly'}
            </p>
          )}
        </div>
        {!matchOver && !isHost && (
          <p className="mt-2 text-center text-xs text-fg-faint">The host can start it sooner</p>
        )}
      </motion.div>
    </motion.div>
  )
}
