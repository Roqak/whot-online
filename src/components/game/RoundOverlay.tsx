import { useState } from 'react'
import { motion } from 'framer-motion'
import { Check, Loader2, RotateCcw, Trophy } from 'lucide-react'
import type { GameView } from '../../types/game'
import type { LobbyMember } from '../../net/protocol'
import { Avatar } from '../Avatar'
import { LeaderboardModal } from '../LeaderboardModal'
import { WhotCard } from '../cards/WhotCard'

interface RoundOverlayProps {
  view: GameView
  isHost: boolean
  secondsLeft: number
  onNextRound: () => void
  onBackToLobby: () => void
  onLeave: () => void
  rematch: { voters: LobbyMember[]; onVote: (on: boolean) => void }
}

export function RoundOverlay({ view, isHost, secondsLeft, onNextRound, onBackToLobby, onLeave, rematch }: RoundOverlayProps) {
  const result = view.lastRound
  const matchOver = view.phase === 'matchOver'
  const championId = view.matchWinnerId
  const name = (id: string) => view.players.find((p) => p.id === id)?.name ?? 'Someone'
  const winnerId = matchOver ? (championId ?? result?.winnerId) : result?.winnerId
  const iWon = winnerId === view.myId
  const [showLeaderboard, setShowLeaderboard] = useState(false)
  const iVoted = rematch.voters.some((m) => m.id === view.myId && m.rematch)
  const votes = rematch.voters.filter((m) => m.rematch).length
  const waitingOn = rematch.voters.filter((m) => !m.rematch).map((m) => m.name)

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
              {/* Same table, same settings, deal again as soon as everyone's in. */}
              <button
                className={iVoted ? 'btn-ghost flex-1 text-leaf' : 'btn-primary flex-1'}
                onClick={() => rematch.onVote(!iVoted)}
                aria-pressed={iVoted}
              >
                {iVoted ? <Loader2 size={17} className="animate-spin" /> : <RotateCcw size={17} />}
                {iVoted ? 'Waiting…' : 'Run it back'}
                {rematch.voters.length > 1 && (
                  <span className="tabular-nums opacity-70">
                    {votes}/{rematch.voters.length}
                  </span>
                )}
              </button>
              <button
                className="btn-ghost"
                onClick={() => setShowLeaderboard(true)}
                title="View leaderboard & stats"
                aria-label="View leaderboard"
              >
                <Trophy size={16} />
              </button>
              <button className="btn-ghost" onClick={onLeave}>
                Leave
              </button>
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
        {matchOver && rematch.voters.length > 1 && (
          <div className="mt-3 flex items-center justify-center gap-1.5" aria-label="Who wants a rematch">
            {rematch.voters.map((m) => (
              <span key={m.id} className="relative" title={m.rematch ? `${m.name} is in` : `Waiting for ${m.name}`}>
                <Avatar id={m.avatar} size={26} dimmed={!m.rematch} />
                {m.rematch && (
                  <span className="absolute -bottom-0.5 -right-0.5 rounded-full bg-leaf p-px text-table-950">
                    <Check size={10} strokeWidth={3} />
                  </span>
                )}
              </span>
            ))}
          </div>
        )}
        {matchOver && iVoted && waitingOn.length > 0 && (
          <p className="mt-1.5 text-center text-xs text-fg-muted">Waiting for {waitingOn.join(', ')}</p>
        )}
        {matchOver && isHost && (
          <button className="mx-auto mt-2 block py-1 text-xs text-fg-faint underline underline-offset-2 hover:text-fg" onClick={onBackToLobby}>
            Change table rules first
          </button>
        )}

        <LeaderboardModal
          isOpen={showLeaderboard}
          onClose={() => setShowLeaderboard(false)}
          currentUserName={view.players.find((p) => p.id === view.myId)?.name}
        />
      </motion.div>
    </motion.div>
  )
}
