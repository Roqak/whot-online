import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { X } from 'lucide-react'
import { REACTION_CATEGORIES, REACTIONS, type Reaction } from '../net/protocol'

interface ReactionPickerProps {
  onSelect: (emoji: Reaction) => void
  onClose: () => void
  className?: string
}

type TabId = 'all' | (typeof REACTION_CATEGORIES)[number]['id']

export function ReactionPicker({ onSelect, onClose, className = '' }: ReactionPickerProps) {
  const [activeTab, setActiveTab] = useState<TabId>('quick')
  const pickerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('pointerdown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  const emojis: readonly Reaction[] =
    activeTab === 'all'
      ? REACTIONS
      : (REACTION_CATEGORIES.find((c) => c.id === activeTab)?.emojis ?? REACTIONS)

  return (
    <motion.div
      ref={pickerRef}
      initial={{ opacity: 0, scale: 0.92, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.92, y: 8 }}
      transition={{ duration: 0.16, ease: 'easeOut' }}
      className={`panel z-50 w-72 max-w-[calc(100vw-32px)] rounded-2xl p-2.5 shadow-2xl backdrop-blur-md ${className}`}
      role="dialog"
      aria-label="Reaction emoji picker"
    >
      {/* Category Tabs & Close */}
      <div className="flex items-center justify-between border-b border-table-700/50 pb-2">
        <div className="flex gap-1 overflow-x-auto scrollbar-hide py-0.5">
          {REACTION_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveTab(cat.id)}
              className={`rounded-lg px-2 py-1 text-xs font-medium transition-colors ${
                activeTab === cat.id
                  ? 'bg-marigold text-table-950 font-bold shadow-sm'
                  : 'text-fg-muted hover:bg-table-800 hover:text-fg'
              }`}
              title={cat.name}
            >
              <span className="mr-1">{cat.icon}</span>
              {cat.name}
            </button>
          ))}
          <button
            onClick={() => setActiveTab('all')}
            className={`rounded-lg px-2 py-1 text-xs font-medium transition-colors ${
              activeTab === 'all'
                ? 'bg-marigold text-table-950 font-bold shadow-sm'
                : 'text-fg-muted hover:bg-table-800 hover:text-fg'
            }`}
          >
            All ({REACTIONS.length})
          </button>
        </div>
        <button
          onClick={onClose}
          className="ml-1 rounded-lg p-1 text-fg-faint transition-colors hover:bg-table-800 hover:text-fg"
          aria-label="Close emoji picker"
        >
          <X size={15} />
        </button>
      </div>

      {/* Emoji Grid */}
      <div className="mt-2 grid grid-cols-6 gap-1 max-h-48 overflow-y-auto pr-0.5 scrollbar-thin">
        {emojis.map((emoji) => (
          <button
            key={emoji}
            onClick={() => {
              onSelect(emoji)
              onClose()
            }}
            className="flex h-10 w-10 items-center justify-center rounded-xl text-2xl transition-all duration-100 hover:scale-115 hover:bg-table-800/80 active:scale-90"
            aria-label={`Send ${emoji}`}
          >
            {emoji}
          </button>
        ))}
      </div>
    </motion.div>
  )
}
