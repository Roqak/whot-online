import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import type { Card } from '../../types/game'
import { cardLabel } from '../../types/game'
import { useWidth } from '../../lib/hooks'
import { WhotCard } from '../cards/WhotCard'

interface PlayerHandProps {
  cards: Card[]
  playableIds: Set<string>
  selectedId: string | null
  shakeId: string | null
  interactive: boolean
  cardWidth: number
  onActivate: (cardId: string) => void
}

const MAX_TILT = 4

/** The player's fanned hand. Tap to lift a card, tap again (or flick up) to play it. */
export function PlayerHand({ cards, playableIds, selectedId, shakeId, interactive, cardWidth, onActivate }: PlayerHandProps) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const buttons = useRef<(HTMLButtonElement | null)[]>([])
  const [focusIndex, setFocusIndex] = useState(0)

  useEffect(() => {
    if (focusIndex > cards.length - 1) setFocusIndex(Math.max(0, cards.length - 1))
  }, [cards.length, focusIndex])

  const count = cards.length
  const spacing = count > 1 ? Math.min(cardWidth * 0.66, Math.max(18, (width - cardWidth - 8) / (count - 1))) : 0
  const startX = (width - (cardWidth + spacing * (count - 1))) / 2

  const move = (from: number, delta: number) => {
    const next = Math.min(count - 1, Math.max(0, from + delta))
    setFocusIndex(next)
    buttons.current[next]?.focus()
  }

  return (
    <div
      ref={ref}
      className="relative h-full w-full"
      role="group"
      aria-label={`Your hand, ${count} card${count === 1 ? '' : 's'}`}
    >
      {cards.map((card, i) => {
        const playable = playableIds.has(card.id)
        const selected = selectedId === card.id
        const tilt = count > 1 ? (i - (count - 1) / 2) * Math.min(MAX_TILT, 34 / count) : 0
        const t = count > 1 ? (i - (count - 1) / 2) / ((count - 1) / 2) : 0
        const arc = t * t * 12

        return (
          <motion.div
            key={card.id}
            className="absolute bottom-3 left-0 origin-bottom"
            style={{ width: cardWidth, zIndex: selected ? 50 : i }}
            initial={{ x: startX + i * spacing, y: 60, opacity: 0, rotate: tilt }}
            animate={{
              x: startX + i * spacing,
              // Outer cards ride higher, like a fan held from below.
              y: -arc - (selected ? 26 : 0),
              rotate: selected ? 0 : tilt,
              opacity: 1,
              scale: selected ? 1.06 : 1,
            }}
            transition={{ type: 'spring', stiffness: 380, damping: 32, mass: 0.6 }}
          >
            <motion.button
              ref={(el) => {
                buttons.current[i] = el
              }}
              type="button"
              tabIndex={i === focusIndex ? 0 : -1}
              aria-label={`${cardLabel(card)}${interactive ? (playable ? ', playable' : ', not playable') : ''}`}
              aria-pressed={selected}
              onFocus={() => setFocusIndex(i)}
              onClick={() => onActivate(card.id)}
              onDoubleClick={() => onActivate(card.id)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowRight') {
                  e.preventDefault()
                  move(i, 1)
                } else if (e.key === 'ArrowLeft') {
                  e.preventDefault()
                  move(i, -1)
                }
              }}
              drag={interactive && playable ? 'y' : false}
              dragConstraints={{ top: -160, bottom: 0 }}
              dragElastic={0.2}
              dragSnapToOrigin
              onDragEnd={(_, info) => {
                if (info.offset.y < -70) onActivate(card.id)
              }}
              whileHover={interactive && playable ? { y: -10 } : undefined}
              whileTap={{ scale: 0.97 }}
              animate={shakeId === card.id ? { x: [0, -6, 6, -4, 0] } : {}}
              transition={{ duration: 0.32 }}
              className={`block w-full cursor-pointer touch-none rounded-[7%] shadow-card transition-shadow ${
                selected ? 'shadow-card-lift ring-2 ring-marigold' : ''
              } ${interactive && playable ? 'ring-1 ring-marigold/40' : ''}`}
            >
              <WhotCard card={card} muted={interactive && !playable} />
            </motion.button>
          </motion.div>
        )
      })}

      {count === 0 && <p className="grid h-full place-items-center text-sm text-fg-faint">No cards left</p>}
    </div>
  )
}
