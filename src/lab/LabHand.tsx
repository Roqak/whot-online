import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { Card, Shape, Suit } from '../types/game'
import { cardLabel, SHAPE_NAMES, SUITS } from '../types/game'
import { cardTilt } from '../lib/hand'
import { playSound, vibrate } from '../lib/sound'
import { ShapeIcon } from '../components/cards/shapes'
import { WhotCard } from '../components/cards/WhotCard'
import { suitColor } from './suit'

export interface OutcomeChip {
  text: string
  tone: 'neutral' | 'good' | 'bad'
}

/** What the table needs to know about a drag in progress. */
export interface DragReport {
  overPile: boolean
  legal: boolean
  shape: Shape
  reason: string | null
}

interface LabHandProps {
  cards: Card[]
  legalIds: Set<string>
  myTurn: boolean
  cardWidth: number
  /** The pile's DOM node: releasing above this rect is a throw. */
  pileEl: HTMLElement | null
  /** Why a card cannot be played right now, or null when it can. */
  explain: (card: Card) => string | null
  preview: (card: Card) => OutcomeChip[]
  onPlay: (cardId: string, shape?: Suit) => void
  hintId: string | null
  onDragReport: (report: DragReport | null) => void
}

const MAX_TILT = 4
const THROW_THRESHOLD = 12

interface DragState {
  id: string
  pointerId: number
  startX: number
  startY: number
  x: number
  y: number
  prevX: number
  thrown: boolean
  overPile: boolean
  /** The shape the pointer is resting on while carrying a Whot. */
  puck: Suit | null
  /** Where the shape picker bloomed, so its pucks stay put under the pointer. */
  pickerLock: { x: number; y: number } | null
}

/**
 * The experimental hand. A card is not "pressed" — it is picked up:
 * press it, feel it lift, carry it up to the pile and let go. Whots
 * bloom a radial shape picker above the finger on the way. Tap-tap
 * still works: tap to lift, tap again (or Enter) to commit.
 */
export function LabHand({ cards, legalIds, myTurn, cardWidth, pileEl, explain, preview, onPlay, hintId, onDragReport }: LabHandProps) {
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const [width, setWidth] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [shapeFor, setShapeFor] = useState<string | null>(null)
  const [shakeId, setShakeId] = useState<string | null>(null)
  const [drag, setDrag] = useState<DragState | null>(null)
  const [focusIndex, setFocusIndex] = useState(0)

  const dragRef = useRef<DragState | null>(null)
  const pileRectRef = useRef<DOMRect | null>(null)
  const rafRef = useRef(0)
  const suppressClick = useRef(false)
  const buttons = useRef<(HTMLButtonElement | null)[]>([])

  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(el)
    setWidth(el.clientWidth)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (focusIndex > cards.length - 1) setFocusIndex(Math.max(0, cards.length - 1))
  }, [cards.length, focusIndex])

  useEffect(() => () => cancelAnimationFrame(rafRef.current), [])

  const report = (next: DragState | null) => {
    if (!next) {
      onDragReport(null)
      return
    }
    const card = cards.find((c) => c.id === next.id)
    if (!card) return
    const legal = legalIds.has(next.id)
    onDragReport({ overPile: next.overPile, legal, shape: card.shape, reason: legal ? null : explain(card) })
  }

  /** The five shape pucks bloom above the finger while carrying a Whot. */
  const puckPositions = (cx: number, cy: number) =>
    SUITS.map((suit, i) => {
      const angle = ((-90 + i * 72) * Math.PI) / 180
      return { suit, x: cx + Math.cos(angle) * 62, y: cy + Math.sin(angle) * 62 }
    })

  const puckAt = (px: number, py: number, cx: number, cy: number): Suit | null => {
    if (Math.hypot(px - cx, py - cy) < 34) return null
    let best: { suit: Suit; d: number } | null = null
    for (const puck of puckPositions(cx, cy)) {
      const d = Math.hypot(px - puck.x, py - puck.y)
      if (d < 48 && (!best || d < best.d)) best = { suit: puck.suit, d }
    }
    return best?.suit ?? null
  }

  /** Runs once per animation frame while a pointer is down. */
  const applyPointer = () => {
    const next = dragRef.current
    if (!next) return
    const rect = pileRectRef.current
    const overPile = rect
      ? next.x > rect.left - 56 &&
        next.x < rect.right + 56 &&
        next.y > rect.top - 120 &&
        next.y < rect.bottom + 30
      : false
    const card = cards.find((c) => c.id === next.id)
    // The picker blooms where the Whot entered the pile and stays anchored,
    // so the pucks do not retreat from the pointer.
    let picker = next.pickerLock
    if (!picker && card && card.shape === 'whot' && overPile && legalIds.has(card.id)) {
      picker = { x: next.x, y: next.y - 120 }
    }
    if (!card || card.shape !== 'whot' || !overPile || !legalIds.has(card.id)) picker = null
    const puck = picker ? puckAt(next.x, next.y, picker.x, picker.y) : null
    const targetChanged = overPile !== next.overPile || puck !== next.puck
    const applied: DragState = { ...next, overPile, puck, pickerLock: picker }
    dragRef.current = applied
    setDrag({ ...applied })
    if (targetChanged) report(applied)
  }

  const clearDrag = () => {
    dragRef.current = null
    setDrag(null)
    onDragReport(null)
  }

  const onPointerDown = (card: Card, e: React.PointerEvent<HTMLButtonElement>) => {
    if (!myTurn) return
    e.currentTarget.setPointerCapture(e.pointerId)
    pileRectRef.current = pileEl?.getBoundingClientRect() ?? null
    const d: DragState = {
      id: card.id,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      x: e.clientX,
      y: e.clientY,
      prevX: e.clientX,
      thrown: false,
      overPile: false,
      puck: null,
      pickerLock: null,
    }
    dragRef.current = d
    setDrag({ ...d })
  }

  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const next = dragRef.current
    if (!next || next.pointerId !== e.pointerId) return
    const dx = e.clientX - next.startX
    const dy = e.clientY - next.startY
    const moved: DragState = {
      ...next,
      x: e.clientX,
      y: e.clientY,
      prevX: next.x,
      thrown: next.thrown || Math.hypot(dx, dy) > THROW_THRESHOLD,
    }
    dragRef.current = moved
    if (!rafRef.current) {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = 0
        applyPointer()
      })
    }
  }

  const finishDrag = (e: React.PointerEvent<HTMLButtonElement>) => {
    const next = dragRef.current
    if (!next || next.pointerId !== e.pointerId) return
    const card = cards.find((c) => c.id === next.id)
    const { thrown, overPile, puck } = next
    clearDrag()
    if (!card) return
    const legal = legalIds.has(card.id)

    if (!thrown) {
      // A tap: suppress the click this pointerup is about to produce.
      suppressClick.current = true
      activate(card.id)
      return
    }
    if (overPile && legal) {
      if (card.shape === 'whot') {
        if (puck) {
          playSound('special')
          onPlay(card.id, puck)
        } else {
          nudge(card.id)
        }
        return
      }
      onPlay(card.id)
      return
    }
    if (overPile && !legal) nudge(card.id)
    // Released near the hand: silently springs back — a cancelled pick.
  }

  const activate = (cardId: string) => {
    const card = cards.find((c) => c.id === cardId)
    if (!card) return
    if (!legalIds.has(cardId)) {
      nudge(cardId)
      return
    }
    if (selectedId !== cardId) {
      setSelectedId(cardId)
      playSound('tap')
      return
    }
    if (card.shape === 'whot') {
      setShapeFor(cardId)
      return
    }
    onPlay(cardId)
    setSelectedId(null)
  }

  const nudge = (cardId: string) => {
    playSound('error')
    vibrate(30)
    setShakeId(cardId)
    setTimeout(() => setShakeId(null), 420)
  }

  const chooseShape = (shape: Suit) => {
    if (!shapeFor) return
    onPlay(shapeFor, shape)
    setShapeFor(null)
    setSelectedId(null)
  }

  const move = (from: number, delta: number) => {
    const count = cards.length
    const next = Math.min(count - 1, Math.max(0, from + delta))
    setFocusIndex(next)
    buttons.current[next]?.focus()
  }

  // A carried or lifted card drives the outcome strip; a Whot awaiting a
  // shape through the tap path gets the picker row instead.
  const activeCard = cards.find((c) => c.id === (drag?.id ?? selectedId)) ?? null
  const count = cards.length
  const spacing = count > 1 ? Math.min(cardWidth * 0.66, Math.max(12, (width - cardWidth - 24) / (count - 1))) : 0
  const startX = (width - (cardWidth + spacing * (count - 1))) / 2
  const handHeight = Math.round(cardWidth * 1.4 + 46)
  const carryingWhot = drag?.thrown && cards.find((c) => c.id === drag.id)?.shape === 'whot'
  const pickerCenter = drag?.pickerLock ?? (drag ? { x: drag.x, y: drag.y - 120 } : null)

  return (
    <div
      ref={canvasRef}
      className="lab-hand-canvas"
      style={{ height: handHeight, width: '100%' }}
      role="group"
      aria-label={`Your hand, ${count} card${count === 1 ? '' : 's'}`}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          setSelectedId(null)
          setShapeFor(null)
        }
      }}
    >
      {count === 0 && <p className="lab-empty">Nothing in hand — wait for the deal</p>}

      <AnimatePresence>
        {activeCard && shapeFor === null && myTurn && (drag?.thrown || selectedId) && legalIds.has(activeCard.id) && preview(activeCard).length > 0 && (
          <motion.div
            className="lab-preview"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            {preview(activeCard).map((chip, i) => (
              <span key={i} className={chip.tone === 'neutral' ? '' : chip.tone}>
                {chip.text}
              </span>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {shapeFor && myTurn && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 40, textAlign: 'center' }}>
          <p className="lab-shape-ask" style={{ position: 'relative', top: -4 }}>
            Name the shape
          </p>
          <div className="lab-puck-row" style={{ justifyContent: 'center' }}>
            {SUITS.map((suit) => (
              <button key={suit} type="button" className="lab-puck-as-button" aria-label={`Name ${SHAPE_NAMES[suit]}`} onClick={() => chooseShape(suit)}>
                <span
                  style={{
                    display: 'grid',
                    placeItems: 'center',
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    background: suitColor(suit),
                    color: 'var(--riso-paper)',
                  }}
                >
                  <ShapeIcon shape={suit} size={15} />
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {cards.map((card, i) => {
        const legal = legalIds.has(card.id)
        const selected = selectedId === card.id
        const dragging = drag?.id === card.id && drag.thrown
        const tilt = count > 1 ? (i - (count - 1) / 2) * Math.min(MAX_TILT, 34 / count) : 0
        const t = count > 1 ? (i - (count - 1) / 2) / ((count - 1) / 2) : 0
        const arc = t * t * 12
        const jitter = cardTilt(card.id)
        const dragDx = dragging && drag ? drag.x - drag.startX : 0
        const dragDy = dragging && drag ? drag.y - drag.startY : 0
        const wobble = dragging && drag ? Math.max(-9, Math.min(9, (drag.x - drag.prevX) * 0.5)) : 0
        const ring =
          dragging
            ? '0 0 0 2.5px var(--riso-ink)'
            : selected
              ? '0 0 0 2.5px var(--riso-ink)'
              : myTurn && legal
                ? `0 0 0 2px color-mix(in srgb, ${suitColor(card.shape)} 60%, transparent)`
                : 'none'

        return (
          <motion.div
            key={card.id}
            className="absolute bottom-3 left-0 origin-bottom"
            style={{ width: cardWidth, zIndex: dragging ? 70 : selected ? 50 : i }}
            initial={{ x: startX + i * spacing, y: 60, opacity: 0, rotate: tilt }}
            animate={{
              x: startX + i * spacing + dragDx,
              y: -arc - (selected ? 24 : 0) + dragDy,
              rotate: dragging ? wobble : selected ? 0 : tilt + jitter.rotate * 0.3,
              opacity: 1,
              scale: dragging ? 1.1 : selected ? 1.05 : 1,
            }}
            transition={
              dragging
                ? { type: 'spring', stiffness: 600, damping: 42, mass: 0.7 }
                : { type: 'spring', stiffness: 380, damping: 32, mass: 0.6 }
            }
          >
            <motion.button
              ref={(el) => {
                buttons.current[i] = el
              }}
              type="button"
              tabIndex={i === focusIndex ? 0 : -1}
              aria-label={`${cardLabel(card)}${myTurn ? (legal ? ', playable' : ', not playable') : ''}`}
              aria-pressed={selected}
              onFocus={() => setFocusIndex(i)}
              onClick={() => {
                if (suppressClick.current) {
                  suppressClick.current = false
                  return
                }
                activate(card.id)
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowRight') {
                  e.preventDefault()
                  move(i, 1)
                } else if (e.key === 'ArrowLeft') {
                  e.preventDefault()
                  move(i, -1)
                }
              }}
              onPointerDown={(e) => onPointerDown(card, e)}
              onPointerMove={onPointerMove}
              onPointerUp={finishDrag}
              onPointerCancel={clearDrag}
              style={{ touchAction: 'none', boxShadow: ring, borderRadius: '7%' }}
              className="block w-full cursor-grab touch-none"
              animate={shakeId === card.id ? { x: [0, -7, 7, -4, 0] } : {}}
              transition={{ duration: 0.36 }}
            >
              <div
                style={{
                  filter: dragging
                    ? 'drop-shadow(8px 14px 0 oklch(0.26 0.03 70 / 0.22))'
                    : selected
                      ? 'drop-shadow(5px 7px 0 oklch(0.26 0.03 70 / 0.2))'
                      : myTurn && legal
                        ? `drop-shadow(4px 5px 0 color-mix(in srgb, ${suitColor(card.shape)} 35%, transparent))`
                        : 'drop-shadow(3px 4px 0 oklch(0.26 0.03 70 / 0.16))',
                }}
              >
                <WhotCard card={card} muted={myTurn && !legal} />
              </div>
              {hintId === card.id && myTurn && (
                <span
                  style={{
                    position: 'absolute',
                    top: -12,
                    left: '50%',
                    transform: 'translateX(-50%) rotate(-4deg)',
                    fontFamily: 'var(--lab-mono)',
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: '0.08em',
                    padding: '2px 7px',
                    borderRadius: 99,
                    border: '1.5px solid var(--riso-ink)',
                    background: 'var(--riso-star)',
                    zIndex: 3,
                    whiteSpace: 'nowrap',
                    pointerEvents: 'none',
                  }}
                >
                  ★ ENGINE'S PICK
                </span>
              )}
            </motion.button>
          </motion.div>
        )
      })}

      {/* The radial shape picker follows the finger while a Whot is in the air. */}
      {carryingWhot && pickerCenter && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 75, pointerEvents: 'none' }}>
          <p
            className="lab-shape-ask"
            style={{
              position: 'fixed',
              left: pickerCenter.x - 70,
              top: pickerCenter.y + 74,
              width: 140,
              margin: 0,
            }}
          >
            {drag?.puck ? SHAPE_NAMES[drag.puck] : 'release on a shape'}
          </p>
          {puckPositions(pickerCenter.x, pickerCenter.y).map((p) => (
            <div
              key={p.suit}
              className={`lab-puck${drag?.puck === p.suit ? ' hot' : ''}`}
              style={{ left: p.x - 27, top: p.y - 27 }}
              data-suit={p.suit}
            >
              <span
                style={{
                  display: 'grid',
                  placeItems: 'center',
                  width: 30,
                  height: 30,
                  borderRadius: '50%',
                  background: suitColor(p.suit),
                  color: 'var(--riso-paper)',
                }}
              >
                <ShapeIcon shape={p.suit} size={15} />
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}