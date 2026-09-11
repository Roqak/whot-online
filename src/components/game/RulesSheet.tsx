import { useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import type { GameSettings } from '../../types/game'
import { ShapeIcon } from '../cards/shapes'

const SPECIALS = [
  { number: 1, title: 'Hold On', body: 'Play again immediately.' },
  { number: 2, title: 'Pick Two', body: 'Next player picks two, unless they defend with another 2.' },
  { number: 5, title: 'Pick Three', body: 'Next player picks three, unless they defend with another 5.' },
  { number: 8, title: 'Suspension', body: 'Next player is skipped.' },
  { number: 14, title: 'General Market', body: 'Everyone else picks one, then you play again.' },
  { number: 20, title: 'Whot', body: 'Play any time and ask for a shape.' },
]

export function RulesSheet({ open, onClose, settings }: { open: boolean; onClose: () => void; settings: GameSettings }) {
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
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 z-50 flex justify-end bg-table-950/60"
          onClick={onClose}
        >
          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.28, ease: [0.25, 1, 0.5, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="panel h-full w-full max-w-sm overflow-y-auto p-5 pad-safe-top"
            role="dialog"
            aria-modal="true"
            aria-label="How to play"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-display text-xl font-bold">How to play</h2>
              <button className="btn-icon" onClick={onClose} aria-label="Close rules">
                <X size={18} />
              </button>
            </div>

            <p className="mt-3 text-sm text-fg-muted">
              Match the card on the pile by shape or number. No match? Go to market. Empty your hand first to check up.
            </p>

            <div className="mt-4 flex gap-2">
              {(['circle', 'triangle', 'cross', 'square', 'star'] as const).map((shape) => (
                <span key={shape} className="grid h-9 w-9 place-items-center rounded-lg bg-paper text-ink">
                  <ShapeIcon shape={shape} size={18} />
                </span>
              ))}
            </div>

            <h3 className="mt-5 text-xs uppercase tracking-[0.18em] text-fg-faint">Special cards</h3>
            <ul className="mt-2 space-y-2">
              {SPECIALS.map((special) => (
                <li key={special.number} className="flex gap-3 rounded-xl bg-table-800/50 p-3">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-paper font-display font-bold text-ink">
                    {special.number}
                  </span>
                  <div>
                    <p className="text-sm font-semibold">{special.title}</p>
                    <p className="text-xs text-fg-muted">{special.body}</p>
                  </div>
                </li>
              ))}
            </ul>

            <h3 className="mt-5 text-xs uppercase tracking-[0.18em] text-fg-faint">Last card</h3>
            <p className="mt-2 text-sm text-fg-muted">
              Call last card when you are down to two or fewer. Forget, and anyone can catch you for two penalty cards.
            </p>

            <h3 className="mt-5 text-xs uppercase tracking-[0.18em] text-fg-faint">This table</h3>
            <ul className="mt-2 space-y-1 text-sm text-fg-muted">
              <li>{settings.handSize} cards each</li>
              <li>{settings.stackPicks ? 'Picks can be defended and stacked' : 'Picks cannot be defended'}</li>
              <li>{settings.turnSeconds > 0 ? `${settings.turnSeconds}s per turn` : 'No turn timer'}</li>
              <li>
                {settings.targetScore > 0
                  ? `Out at ${settings.targetScore} points. Stars count double, Whot counts 20.`
                  : 'Single round'}
              </li>
            </ul>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
