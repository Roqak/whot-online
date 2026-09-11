import { motion } from 'framer-motion'
import type { Card, PendingPick, Suit } from '../../types/game'
import { SHAPE_NAMES } from '../../types/game'
import { cardTilt } from '../../lib/hand'
import { WhotCard } from '../cards/WhotCard'
import { ShapeIcon } from '../cards/shapes'

interface TableCenterProps {
  pile: Card[]
  marketCount: number
  requestedShape: Suit | null
  pendingPick: PendingPick | null
  canDraw: boolean
  /** True when the player has no playable card and should go to market. */
  nudgeMarket: boolean
  onDraw: () => void
  /** Where the newest card flies in from, in pixels relative to the pile. */
  entryOffset: { x: number; y: number }
  cardWidth: number
}

export function TableCenter({
  pile,
  marketCount,
  requestedShape,
  pendingPick,
  canDraw,
  nudgeMarket,
  onDraw,
  entryOffset,
  cardWidth,
}: TableCenterProps) {
  const visible = pile.slice(-4)
  const marketWidth = Math.round(cardWidth * 0.86)
  const drawLabel = pendingPick ? `Pick ${pendingPick.amount}` : 'Market'

  return (
    <div className="flex items-center justify-center gap-5 sm:gap-8">
      <div className="flex flex-col items-center gap-2">
        <button
          onClick={onDraw}
          disabled={!canDraw}
          aria-label={pendingPick ? `Go to market and pick ${pendingPick.amount} cards` : 'Go to market'}
          className="relative block rounded-xl transition-transform active:scale-95 disabled:cursor-not-allowed"
          style={{ width: marketWidth }}
        >
          {marketCount > 0 ? (
            <>
              {[6, 3, 0].map((offset, i) => (
                <div
                  key={offset}
                  className={i === 2 ? 'relative' : 'absolute inset-x-0 top-0'}
                  style={{ transform: `translate(${offset / 2}px, ${-offset}px)`, opacity: i === 2 ? 1 : 0.65 }}
                >
                  <WhotCard faceDown />
                </div>
              ))}
              {nudgeMarket && canDraw && (
                <span className="absolute inset-0 rounded-xl ring-2 ring-marigold/70 animate-pulse-ring" />
              )}
            </>
          ) : (
            <div
              className="grid place-items-center rounded-xl border border-dashed border-table-600/70 text-[11px] text-fg-faint"
              style={{ aspectRatio: '5 / 7' }}
            >
              Empty
            </div>
          )}
        </button>
        <span className={`chip px-2 py-0.5 text-[11px] ${pendingPick ? 'bg-ember text-table-950' : 'text-fg-faint'}`}>
          {drawLabel} {!pendingPick && <span className="tabular-nums">· {marketCount}</span>}
        </span>
      </div>

      <div className="flex flex-col items-center gap-2">
        <div className="relative" style={{ width: cardWidth, aspectRatio: '5 / 7' }}>
          {visible.map((card, i) => {
            const tilt = cardTilt(card.id)
            const isTop = i === visible.length - 1
            return (
              <motion.div
                key={card.id}
                className="absolute inset-0"
                style={{ zIndex: i }}
                initial={
                  isTop
                    ? { x: entryOffset.x, y: entryOffset.y, rotate: tilt.rotate * 2, scale: 0.92, opacity: 0.6 }
                    : false
                }
                animate={{ x: tilt.x, y: tilt.y, rotate: tilt.rotate, scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 420, damping: 34, mass: 0.7 }}
              >
                <WhotCard card={card} />
              </motion.div>
            )
          })}
          {pendingPick && (
            <motion.span
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="absolute -right-3 -top-3 z-20 grid h-9 w-9 place-items-center rounded-full bg-ember text-sm font-bold text-table-950 shadow-card"
            >
              +{pendingPick.amount}
            </motion.span>
          )}
        </div>

        {requestedShape ? (
          <motion.span
            initial={{ y: -4, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="chip bg-paper py-0.5 text-[11px] font-semibold text-ink"
          >
            <ShapeIcon shape={requestedShape} size={13} />
            {SHAPE_NAMES[requestedShape]} asked
          </motion.span>
        ) : (
          <span className="h-[22px]" />
        )}
      </div>
    </div>
  )
}
