import { motion } from 'framer-motion'
import { Play } from 'lucide-react'

interface PauseOverlayProps {
  onResume: () => void
  onLeave: () => void
}

export function PauseOverlay({ onResume, onLeave }: PauseOverlayProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-40 flex items-center justify-center bg-table-950/90 px-4"
      role="dialog"
      aria-modal="true"
      aria-label="Game paused"
    >
      <motion.div
        initial={{ y: 16, scale: 0.97 }}
        animate={{ y: 0, scale: 1 }}
        transition={{ duration: 0.28, ease: [0.25, 1, 0.5, 1] }}
        className="panel flex w-full max-w-xs flex-col items-center gap-4 rounded-2xl p-6 text-center"
      >
        <h2 className="text-lg font-semibold text-fg">Paused</h2>
        <button
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-ember py-2.5 font-semibold text-table-950"
          onClick={onResume}
          autoFocus
        >
          <Play size={17} />
          Resume
        </button>
        <button className="text-sm text-fg-muted" onClick={onLeave}>
          Leave game
        </button>
      </motion.div>
    </motion.div>
  )
}
