import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Award, Flame, Loader2, RefreshCw, Star, Target, Trophy, Users, X } from 'lucide-react'
import { fetchGlobalLeaderboard, getPlayerStats, type LeaderboardEntry, type PlayerStats } from '../lib/stats'
import { hasNativeLeaderboard, showNativeLeaderboard } from '../native/playGames'
import { Avatar } from './Avatar'

interface LeaderboardModalProps {
  isOpen: boolean
  onClose: () => void
  currentUserName?: string
}

export function LeaderboardModal({ isOpen, onClose, currentUserName }: LeaderboardModalProps) {
  const [tab, setTab] = useState<'global' | 'personal'>('global')
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [stats, setStats] = useState<PlayerStats>(getPlayerStats)
  const nativeAvailable = hasNativeLeaderboard()

  const loadLeaderboard = async () => {
    setLoading(true)
    try {
      const data = await fetchGlobalLeaderboard()
      setEntries(data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isOpen) {
      setStats(getPlayerStats())
      loadLeaderboard()
    }
  }, [isOpen])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!isOpen) return null

  const winRate = stats.matchesPlayed > 0 ? Math.round((stats.matchesWon / stats.matchesPlayed) * 100) : 0

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-table-950/80 backdrop-blur-sm"
        />

        {/* Modal Window */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 12 }}
          transition={{ duration: 0.2, ease: [0.25, 1, 0.5, 1] }}
          className="panel relative z-10 flex max-h-[85vh] w-full max-w-md flex-col rounded-3xl p-5 shadow-2xl"
          role="dialog"
          aria-modal="true"
          aria-label="Leaderboard & Stats"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-table-700/50 pb-3">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-marigold/15 text-marigold">
                <Trophy size={18} />
              </span>
              <div>
                <h2 className="font-display text-xl font-bold">Leaderboard</h2>
                <p className="text-[11px] text-fg-faint">Rankings & personal records</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="rounded-xl p-1.5 text-fg-faint transition-colors hover:bg-table-800 hover:text-fg"
              aria-label="Close dialog"
            >
              <X size={18} />
            </button>
          </div>

          {/* Tab Switcher */}
          <div className="mt-3 flex rounded-xl bg-table-900 p-1">
            <button
              onClick={() => setTab('global')}
              className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition-all ${
                tab === 'global' ? 'bg-marigold text-table-950 shadow' : 'text-fg-muted hover:text-fg'
              }`}
            >
              🏆 Global Rankings
            </button>
            <button
              onClick={() => setTab('personal')}
              className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition-all ${
                tab === 'personal' ? 'bg-marigold text-table-950 shadow' : 'text-fg-muted hover:text-fg'
              }`}
            >
              📊 My Stats
            </button>
          </div>

          {/* Body Content */}
          <div className="mt-3 flex-1 overflow-y-auto pr-0.5 scrollbar-thin">
            {tab === 'global' ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between px-1 text-[11px] text-fg-faint">
                  <span>Top Players</span>
                  <button
                    onClick={loadLeaderboard}
                    disabled={loading}
                    className="flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-table-800 hover:text-fg"
                    title="Refresh rankings"
                  >
                    <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
                    <span>Refresh</span>
                  </button>
                </div>

                {loading && entries.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-fg-muted">
                    <Loader2 size={24} className="animate-spin text-marigold" />
                    <p className="mt-2 text-xs">Loading leaderboard...</p>
                  </div>
                ) : entries.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-table-700/60 p-6 text-center text-fg-muted">
                    <Users size={28} className="mx-auto mb-2 opacity-40 text-marigold" />
                    <p className="font-semibold text-fg text-sm">No match records yet</p>
                    <p className="mt-1 text-xs text-fg-faint">
                      Play an online match with friends to claim the #1 spot on the leaderboard!
                    </p>
                  </div>
                ) : (
                  <ul className="space-y-1.5">
                    {entries.map((item) => {
                      const isMe =
                        currentUserName &&
                        item.name.trim().toLowerCase() === currentUserName.trim().toLowerCase()

                      const medal =
                        item.rank === 1 ? '🥇' : item.rank === 2 ? '🥈' : item.rank === 3 ? '🥉' : null

                      return (
                        <li
                          key={`${item.name}-${item.rank}`}
                          className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 transition-colors ${
                            isMe
                              ? 'bg-marigold/15 ring-1 ring-marigold/50'
                              : 'bg-table-800/40 hover:bg-table-800/60'
                          }`}
                        >
                          <div className="flex w-6 shrink-0 items-center justify-center text-center font-display font-extrabold text-sm">
                            {medal ? <span className="text-base">{medal}</span> : <span className="text-fg-faint">#{item.rank}</span>}
                          </div>

                          <Avatar id={item.avatar} size={32} />

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <p className="truncate text-sm font-semibold text-fg">{item.name}</p>
                              {isMe && (
                                <span className="rounded bg-marigold/20 px-1.5 py-0.2 text-[9px] font-bold text-marigold uppercase tracking-wide">
                                  You
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-fg-faint">
                              {item.matches} {item.matches === 1 ? 'match' : 'matches'} · {item.winRate}% win rate
                            </p>
                          </div>

                          <div className="text-right">
                            <span className="font-display text-base font-bold text-marigold tabular-nums">
                              {item.wins}
                            </span>
                            <span className="ml-1 text-[10px] text-fg-faint">{item.wins === 1 ? 'win' : 'wins'}</span>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {/* Stats Grid */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-2xl bg-table-800/50 p-3.5 border border-table-700/30">
                    <div className="flex items-center justify-between text-marigold">
                      <span className="text-xs uppercase tracking-wider text-fg-faint font-medium">Wins</span>
                      <Trophy size={16} />
                    </div>
                    <p className="mt-1 font-display text-2xl font-black text-fg tabular-nums">
                      {stats.matchesWon}
                    </p>
                    <p className="text-[10px] text-fg-faint mt-0.5">Total matches won</p>
                  </div>

                  <div className="rounded-2xl bg-table-800/50 p-3.5 border border-table-700/30">
                    <div className="flex items-center justify-between text-emerald-400">
                      <span className="text-xs uppercase tracking-wider text-fg-faint font-medium">Win Rate</span>
                      <Target size={16} />
                    </div>
                    <p className="mt-1 font-display text-2xl font-black text-fg tabular-nums">
                      {winRate}%
                    </p>
                    <p className="text-[10px] text-fg-faint mt-0.5">Of {stats.matchesPlayed} games</p>
                  </div>

                  <div className="rounded-2xl bg-table-800/50 p-3.5 border border-table-700/30">
                    <div className="flex items-center justify-between text-ember">
                      <span className="text-xs uppercase tracking-wider text-fg-faint font-medium">Current</span>
                      <Flame size={16} />
                    </div>
                    <p className="mt-1 font-display text-2xl font-black text-fg tabular-nums">
                      {stats.currentStreak}
                    </p>
                    <p className="text-[10px] text-fg-faint mt-0.5">Consecutive wins</p>
                  </div>

                  <div className="rounded-2xl bg-table-800/50 p-3.5 border border-table-700/30">
                    <div className="flex items-center justify-between text-amber-300">
                      <span className="text-xs uppercase tracking-wider text-fg-faint font-medium">Best Streak</span>
                      <Star size={16} />
                    </div>
                    <p className="mt-1 font-display text-2xl font-black text-fg tabular-nums">
                      {stats.bestStreak}
                    </p>
                    <p className="text-[10px] text-fg-faint mt-0.5">All-time record</p>
                  </div>
                </div>

                <div className="rounded-2xl bg-table-800/40 p-3 flex items-center justify-between border border-table-700/30">
                  <div className="flex items-center gap-2.5">
                    <Award className="text-marigold" size={20} />
                    <div>
                      <p className="text-xs font-semibold text-fg">Check-ups called</p>
                      <p className="text-[10px] text-fg-faint">Rounds where you emptied your hand</p>
                    </div>
                  </div>
                  <span className="font-display text-lg font-bold text-marigold tabular-nums">
                    {stats.roundsWon}
                  </span>
                </div>

                {nativeAvailable && (
                  <button
                    onClick={showNativeLeaderboard}
                    className="btn-ghost w-full py-2.5 text-xs text-marigold border border-marigold/30"
                  >
                    <Trophy size={14} /> Open Google Play Games Leaderboard
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Footer note */}
          <p className="mt-3 text-center text-[10px] text-fg-faint border-t border-table-800 pt-2">
            Online matches update your global score and standings automatically.
          </p>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
