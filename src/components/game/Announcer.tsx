import { AnimatePresence, motion } from 'framer-motion'

export interface Announcement {
  id: number
  text: string
  tone: 'neutral' | 'good' | 'bad'
}

const TONE_CLASS: Record<Announcement['tone'], string> = {
  neutral: 'bg-table-900/95 text-fg border-table-600/60',
  good: 'bg-marigold text-table-950 border-marigold',
  bad: 'bg-ember text-table-950 border-ember',
}

/** One short line at a time, over the table. */
export function Announcer({ item }: { item: Announcement | null }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-[104px] z-30 flex justify-center px-4" aria-live="polite">
      <AnimatePresence mode="wait">
        {item && (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, y: -12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.22, ease: [0.25, 1, 0.5, 1] }}
            className={`rounded-full border px-4 py-1.5 text-sm font-semibold shadow-card ${TONE_CLASS[item.tone]}`}
          >
            {item.text}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
