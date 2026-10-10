import { useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, Lock, X } from 'lucide-react'
import { BACKS, CLOTHS, Cosmetic, isUnlocked } from '../lib/cosmetics'
import { getPlayerStats } from '../lib/stats'
import { useGameStore } from '../store/gameStore'
import { WhotCard } from './cards/WhotCard'

/** Pick your table cloth and card back; locked ones show what earns them. */
export function StyleSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const style = useGameStore((s) => s.style)
  const setStyle = useGameStore((s) => s.setStyle)
  const stats = getPlayerStats()

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center bg-table-950/70 sm:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Your style"
            className="panel max-h-[88vh] w-full max-w-md overflow-y-auto rounded-t-3xl !bg-table-900 p-5 pad-safe-bottom sm:rounded-3xl"
            initial={{ y: 40 }}
            animate={{ y: 0 }}
            exit={{ y: 40 }}
            transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
          >
            <header className="flex items-center justify-between">
              <h2 className="font-display text-2xl font-extrabold">Your style</h2>
              <button className="btn-icon" onClick={onClose} aria-label="Close">
                <X size={18} />
              </button>
            </header>
            <p className="mt-1 text-sm text-fg-muted">Play and win to earn more. Only you see your table.</p>

            <h3 className="mt-5 text-[11px] uppercase tracking-[0.2em] text-fg-faint">Table cloth</h3>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {CLOTHS.map((cloth) => (
                <Choice key={cloth.id} item={cloth} selected={style.cloth === cloth.id} stats={stats} onPick={() => setStyle({ cloth: cloth.id })}>
                  <div data-cloth={cloth.id} className="table-top h-14 w-full rounded-[50%]" aria-hidden="true" />
                </Choice>
              ))}
            </div>

            <h3 className="mt-5 text-[11px] uppercase tracking-[0.2em] text-fg-faint">Card back</h3>
            <div className="mt-2 grid grid-cols-4 gap-2">
              {BACKS.map((back) => (
                <Choice key={back.id} item={back} selected={style.back === back.id} stats={stats} compact onPick={() => setStyle({ back: back.id })}>
                  <div data-back={back.id} className="mx-auto w-12" aria-hidden="true">
                    <WhotCard faceDown />
                  </div>
                </Choice>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function Choice({
  item,
  selected,
  stats,
  compact,
  onPick,
  children,
}: {
  item: Cosmetic<string>
  selected: boolean
  stats: ReturnType<typeof getPlayerStats>
  compact?: boolean
  onPick: () => void
  children: React.ReactNode
}) {
  const unlocked = isUnlocked(item, stats)
  const [now, goal] = item.unlock?.progress(stats) ?? [0, 0]
  return (
    <button
      className={`relative flex flex-col items-center gap-1.5 rounded-2xl p-2 text-center transition-colors ${
        selected ? 'bg-marigold/15 ring-2 ring-marigold' : 'bg-table-800/50 ring-1 ring-table-600/40 hover:bg-table-800'
      } ${unlocked ? '' : 'cursor-not-allowed'}`}
      disabled={!unlocked}
      aria-pressed={selected}
      aria-label={unlocked ? item.name : `${item.name}, locked: ${item.unlock?.label}`}
      onClick={onPick}
    >
      <div className={unlocked ? 'w-full' : 'w-full opacity-35 grayscale'}>{children}</div>
      <span className="text-xs font-semibold">{item.name}</span>
      {!compact && unlocked && <span className="text-[11px] leading-tight text-fg-muted">{item.blurb}</span>}
      {!unlocked && (
        <span className="text-[11px] leading-tight text-fg-muted">
          {item.unlock?.label}
          <span className="block tabular-nums text-fg-faint">
            {Math.min(now, goal)}/{goal}
          </span>
        </span>
      )}
      {!unlocked && (
        <span className="absolute right-1.5 top-1.5 rounded-full bg-table-950/80 p-1 text-fg-muted">
          <Lock size={11} />
        </span>
      )}
      {selected && (
        <span className="absolute right-1.5 top-1.5 rounded-full bg-marigold p-0.5 text-table-950">
          <Check size={11} strokeWidth={3} />
        </span>
      )}
    </button>
  )
}
