import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { describeEvent, type EventLine, type EventTone } from '../lib/events'
import { playSound, setSoundEnabled, vibrate } from '../lib/sound'
import {
  applyAction, applyTimeout, createMatch, currentPlayer, isCatchable, playContext, seededRng,
  startNextRound, type Seat,
} from '../engine/gameEngine'
import { chooseBotMove } from '../engine/bot'
import {
  canPlayCard, isSpecial, SHAPE_NAMES, SPECIAL_NAMES, SUITS,
  type Card, type GameAction, type GameEvent, type GameState, type Shape, type Suit,
} from '../types/game'
import './lab4.css'

const ME = 'me'

const SEATS: Seat[] = [
  { id: ME, name: 'You', avatar: 'lion', isBot: false },
  { id: 'bot-1', name: 'Ada', avatar: 'elephant', isBot: true, botLevel: 'normal' },
  { id: 'bot-2', name: 'Chidi', avatar: 'fox', isBot: true, botLevel: 'hard' },
  { id: 'bot-3', name: 'Ngozi', avatar: 'turtle', isBot: true, botLevel: 'easy' },
]

const SETTINGS = { handSize: 7, targetScore: 100, pickDefence: 'stack' as const, turnSeconds: 0 }

function newMatch(): GameState {
  return createMatch(SEATS, SETTINGS, seededRng(Math.floor(Math.random() * 2 ** 31)))
}

/** FNV-1a so every card keeps one stable messy rotation/offset on the pile. */
function cardHash(id: string): number {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

const INK: Record<Shape, string> = {
  circle: '#FF3B30', triangle: '#1466FF', cross: '#00A868', square: '#FFC700', star: '#FF7A00', whot: '#131313',
}
const STAR = '50,10 60,36.2 88,37.6 66.2,55.3 73.5,82.4 50,67 26.5,82.4 33.8,55.3 12,37.6 40,36.2'
const CROSS = '36,10 64,10 64,36 90,36 90,64 64,64 64,90 36,90 36,64 10,64 10,36 36,36'

function ShapeGlyph({ shape, size }: { shape: Shape; size: number }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden>
      {shape === 'circle' && <circle cx="50" cy="50" r="36" fill={INK.circle} stroke="#131313" strokeWidth="4" />}
      {shape === 'square' && <rect x="16" y="16" width="68" height="68" rx="10" fill={INK.square} stroke="#131313" strokeWidth="4" />}
      {shape === 'triangle' && <polygon points="50,12 90,86 10,86" fill={INK.triangle} stroke="#131313" strokeWidth="4" />}
      {shape === 'cross' && <polygon points={CROSS} fill={INK.cross} stroke="#131313" strokeWidth="4" />}
      {shape === 'star' && <polygon points={STAR} fill={INK.star} stroke="#131313" strokeWidth="4" />}
      {shape === 'whot' && <text x="50" y="62" textAnchor="middle" fontSize="28" fontWeight="900" fill="#131313">WHOT</text>}
    </svg>
  )
}

/** Lab4's own chunky plastic card — same engine card data, toybox body. */
function ToyCard({ card, faceDown, width = 84, muted }: { card?: Card; faceDown?: boolean; width?: number; muted?: boolean }) {
  if (faceDown || !card) {
    return <div className="lab4-card lab4-back" style={{ width, height: width * 1.4 }}><span>WHOT!</span></div>
  }
  const label = card.shape === 'whot' ? '20' : String(card.number)
  return (
    <div className={`lab4-card${muted ? ' lab4-muted' : ''}`} style={{ width, height: width * 1.4 }}>
      <i className="lab4-idx">{label}</i>
      <ShapeGlyph shape={card.shape} size={Math.round(width * 0.52)} />
      {isSpecial(card) && card.shape !== 'whot' && <b className="lab4-tag">{SPECIAL_NAMES[card.number]}</b>}
      <i className="lab4-idx lab4-idx-b">{label}</i>
    </div>
  )
}

interface Drag {
  cardId: string
  pointerId: number
  grabX: number
  grabY: number
  x: number
  y: number
  startX: number
  startY: number
  lastX: number
  lastY: number
  lastT: number
  tilt: number
  speed: number
  tap: boolean
}

/**
 * Whot Lab 04 (#/lab4) — the pile is a physical object. Cards are dragged from
 * a neat tray and slammed onto a messy, growing stack; a Whot is named by
 * dropping it on one of five suit chips orbiting the stack top.
 * Same engine and bots as the online table, run directly, offline.
 */
export default function Lab4() {
  const [tick, setTick] = useState(0)
  const stateRef = useRef<GameState>(newMatch())
  const [batch, setBatch] = useState<{ id: number; events: GameEvent[] } | null>(null)
  const [lines, setLines] = useState<EventLine[]>([])
  const [toast, setToast] = useState<{ text: string; tone: EventTone; id: number } | null>(null)
  const [soundOn, setSoundOn] = useState(true)
  const [exitAsk, setExitAsk] = useState(false)
  const [dragCard, setDragCard] = useState<Card | null>(null)
  const [namingWhot, setNamingWhot] = useState<Card | null>(null)

  const dragRef = useRef<Drag | null>(null)
  const ghostRef = useRef<HTMLDivElement | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const stackRef = useRef<HTMLDivElement | null>(null)
  const trayEls = useRef(new Map<string, HTMLElement>())
  const chipEls = useRef(new Map<Suit, HTMLElement>())
  const toastTimer = useRef(0)

  const s = stateRef.current
  const render = useCallback(() => setTick((n) => n + 1), [])

  const say = useCallback((text: string, tone: EventTone = 'bad') => {
    setToast({ text, tone, id: Math.random() })
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 2400)
  }, [])

  const nameOf = useCallback((id: string) => stateRef.current.players.find((p) => p.id === id)?.name ?? 'Someone', [])

  const collapsePile = useCallback(() => {
    const floor = stackRef.current
    if (!floor) return
    floor.classList.remove('lab4-vacuum')
    void floor.offsetWidth
    floor.classList.add('lab4-vacuum')
    window.setTimeout(() => floor.classList.remove('lab4-vacuum'), 700)
  }, [])

  /** Commits actions through the engine; returns whether the whole batch landed. */
  const dispatch = useCallback(
    (playerId: string, actions: GameAction[]): boolean => {
      const prev = stateRef.current
      if (prev.phase !== 'playing') return false
      let state = prev
      const events: GameEvent[] = []
      for (const action of actions) {
        const result = applyAction(state, playerId, action)
        if (!result.ok) {
          say(result.error)
          playSound('error')
          return false
        }
        state = result.state
        events.push(...result.events)
      }
      stateRef.current = state
      setBatch({ id: state.turnId, events })
      render()
      return true
    },
    [say, render],
  )

  // Bots wind up a beat after they are dealt the turn; fallback to market.
  useEffect(() => {
    const state = stateRef.current
    if (state.phase !== 'playing') return
    const player = currentPlayer(state)
    if (!player.isBot) return
    const timer = setTimeout(() => {
      const fresh = stateRef.current
      if (fresh.phase !== 'playing' || currentPlayer(fresh).id !== player.id) return
      const before = fresh.turnId
      const events: GameEvent[] = []
      let state = fresh
      for (const action of chooseBotMove(fresh, player.id, seededRng((Date.now() % 2 ** 31) | 0))) {
        const result = applyAction(state, player.id, action)
        if (!result.ok) break
        state = result.state
        events.push(...result.events)
      }
      if (events.length === 0 || state.turnId === before) {
        const timeout = applyTimeout(state, player.id)
        if (!timeout.ok) return
        stateRef.current = timeout.state
        setBatch({ id: timeout.state.turnId, events: [...events, ...timeout.events] })
        render()
        return
      }
      stateRef.current = state
      setBatch({ id: state.turnId, events })
      render()
    }, 800 + Math.random() * 1100)
    return () => window.clearTimeout(timer)
  }, [tick, render])

  // A bot pounces if the human forgets to call last card.
  useEffect(() => {
    const state = stateRef.current
    if (state.phase !== 'playing') return
    const me = state.players.find((p) => p.id === ME)
    if (!me || !isCatchable(me)) return
    const timer = window.setTimeout(() => {
      const fresh = stateRef.current
      const target = fresh.players.find((p) => p.id === ME)
      if (fresh.phase !== 'playing' || !target || !isCatchable(target)) return
      dispatch('bot-2', [{ type: 'catch', targetId: ME }])
    }, 2600 + Math.random() * 2600)
    return () => window.clearTimeout(timer)
  }, [tick, dispatch])

  // Sound, haptics, commentary — and the pile's vacuum reshuffle moment.
  useEffect(() => {
    if (!batch) return
    for (const event of batch.events) {
      const line = describeEvent(event, { nameOf, myId: ME, verbose: true })
      if (line) setLines((q) => [...q, line].slice(-4))
      if (event.type === 'played') {
        playSound(isSpecial(event.card) ? 'special' : 'play')
        if (event.playerId !== ME) recoilFloor()
      } else if (event.type === 'drew') playSound('draw')
      else if (event.type === 'reshuffled') {
        playSound('shuffle')
        vibrate(20)
        collapsePile()
      } else if (event.type === 'roundOver' || event.type === 'matchOver') {
        const winner = event.type === 'roundOver' ? event.result.winnerId : event.winnerId
        playSound(winner === ME ? 'win' : 'lose')
      } else if (event.type === 'pick' || event.type === 'caught') {
        playSound(event.type === 'pick' ? 'pick' : 'caught')
        vibrate(event.type === 'pick' ? 30 : [30, 40, 30])
      } else if (event.type === 'lastCard') {
        playSound('lastCard')
        vibrate(20)
      } else if (
        event.type === 'holdOn' || event.type === 'suspended' ||
        event.type === 'shapeRequested' || event.type === 'generalMarket'
      ) {
        playSound('special')
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batch, nameOf, collapsePile])

  const recoilFloor = useCallback(() => {
    const floor = stackRef.current
    if (!floor) return
    floor.classList.remove('lab4-recoil')
    void floor.offsetWidth
    floor.classList.add('lab4-recoil')
  }, [])

  const quake = useCallback(() => {
    const root = rootRef.current
    if (!root) return
    root.classList.remove('lab4-quake')
    void root.offsetWidth
    root.classList.add('lab4-quake')
    window.setTimeout(() => root.classList.remove('lab4-quake'), 320)
  }, [])

  const me = s.players.find((p) => p.id === ME)
  const turnPlayer = s.phase === 'playing' ? currentPlayer(s) : null
  const myTurn = s.phase === 'playing' && turnPlayer?.id === ME
  const ctx = useMemo(() => playContext(s), [tick]) // eslint-disable-line react-hooks/exhaustive-deps
  const hand = useMemo(() => (me ? [...me.hand].sort((a, b) => a.shape.localeCompare(b.shape) || a.number - b.number) : []), [tick]) // eslint-disable-line react-hooks/exhaustive-deps
  const legalIds = useMemo(() => {
    if (!myTurn || !me) return new Set<string>()
    return new Set(me.hand.filter((c) => canPlayCard(c, ctx)).map((c) => c.id))
  }, [myTurn, me, ctx, tick]) // eslint-disable-line react-hooks/exhaustive-deps
  const pendingPickMine = s.pendingPick && myTurn && legalIds.size === 0
  const canCallLastCard = !!me && s.phase === 'playing' && !me.announcedLastCard && me.hand.length > 0 && me.hand.length <= 2
  const opponents = s.players.filter((p) => p.id !== ME)

  const explain = useCallback(
    (): string => {
      if (s.pendingPick) {
        return s.settings.pickDefence === 'none' ? 'take the pick — nothing plays' : `throw a ${s.pendingPick.number} to defend, or take the pick`
      }
      if (s.requestedShape) return `the shape is ${SHAPE_NAMES[s.requestedShape]} — nothing else plays`
      const top = s.pile[s.pile.length - 1] ?? null
      if (!top) return 'nothing on the pile yet'
      return `not a ${SHAPE_NAMES[top.shape]}, not a ${top.number}`
    },
    [s.pendingPick, s.requestedShape, s.pile, s.settings.pickDefence],
  )

  const inStack = (x: number, y: number): boolean => {
    const floor = stackRef.current
    if (!floor) return false
    const r = floor.getBoundingClientRect()
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom
  }

  const chipAt = (x: number, y: number): Suit | null => {
    for (const [suit, el] of chipEls.current) {
      const r = el.getBoundingClientRect()
      if (x >= r.left - 6 && x <= r.right + 6 && y >= r.top - 6 && y <= r.bottom + 6) return suit
    }
    return null
  }

  const clearHover = () => {
    stackRef.current?.classList.remove('lab4-floor-hot')
    chipEls.current.forEach((el) => el.classList.remove('lab4-chip-hot'))
  }

  const commitPlay = useCallback(
    (cardId: string, shape: Suit | undefined, slam: boolean) => {
      setNamingWhot(null)
      if (!dispatch(ME, [{ type: 'play', cardId, requestedShape: shape }])) return
      recoilFloor()
      if (slam) {
        quake()
        playSound('caught')
        vibrate([25, 20, 45])
      } else {
        playSound('play')
        vibrate(15)
      }
    },
    [dispatch, recoilFloor, quake],
  )

  /** Sends the ghost gliding back to its tray slot; shake marks an illegal drop. */
  const returnGhost = (card: Card, shake: boolean) => {
    const el = ghostRef.current
    const tray = trayEls.current.get(card.id)
    if (!el || !tray) {
      setDragCard(null)
      return
    }
    const r = tray.getBoundingClientRect()
    el.style.transition = 'transform .3s cubic-bezier(.34,1.25,.5,1)'
    el.style.transform = `translate3d(${r.left}px, ${r.top}px, 0) rotate(0deg) scale(.9)`
    if (shake) {
      tray.classList.add('lab4-tray-shake')
      window.setTimeout(() => tray.classList.remove('lab4-tray-shake'), 380)
    }
    window.setTimeout(() => setDragCard(null), 310)
  }

  const beginDrag = (e: ReactPointerEvent, card: Card) => {
    if (s.phase !== 'playing') return
    if (currentPlayer(stateRef.current).id !== ME) {
      say('not your turn — wait for the wind-up')
      return
    }
    if (e.pointerType === 'mouse' && e.button !== 0) return
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    dragRef.current = {
      cardId: card.id, pointerId: e.pointerId,
      grabX: e.clientX - rect.left, grabY: e.clientY - rect.top,
      x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY,
      lastX: e.clientX, lastY: e.clientY, lastT: e.timeStamp, tilt: 0, speed: 0, tap: true,
    }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    setNamingWhot(null)
    setDragCard(card)
    playSound('tap')
  }

  const moveDrag = (e: ReactPointerEvent) => {
    const d = dragRef.current
    if (!d || d.pointerId !== e.pointerId) return
    const dt = Math.max(1, e.timeStamp - d.lastT)
    d.speed = Math.hypot(e.clientX - d.lastX, e.clientY - d.lastY) / dt
    d.tilt = d.tilt * 0.82 + Math.max(-14, Math.min(14, (e.clientX - d.lastX) * 0.55)) * 0.18
    d.x = e.clientX
    d.y = e.clientY
    d.lastX = e.clientX
    d.lastY = e.clientY
    d.lastT = e.timeStamp
    if (Math.abs(e.clientX - d.startX) + Math.abs(e.clientY - d.startY) > 8) d.tap = false
    const el = ghostRef.current
    if (el) el.style.transform = `translate3d(${d.x - d.grabX}px, ${d.y - d.grabY}px, 0) rotate(${d.tilt}deg)`
    const chip = dragCard?.shape === 'whot' ? chipAt(d.x, d.y) : null
    stackRef.current?.classList.toggle('lab4-floor-hot', inStack(d.x, d.y) && !chip)
    chipEls.current.forEach((c, suit) => c.classList.toggle('lab4-chip-hot', suit === chip))
  }

  const endDrag = (e: ReactPointerEvent) => {
    const d = dragRef.current
    if (!d || d.pointerId !== e.pointerId || !dragCard) return
    dragRef.current = null
    clearHover()
    const card = dragCard
    const slam = d.speed > 1.9
    if (d.tap) {
      // A tap plays a legal number card straight from the tray, or opens the
      // suit orbit for a Whot.
      if (card.shape === 'whot') {
        setNamingWhot(card)
        setDragCard(null)
        say('tap a suit chip to name it')
      } else if (canPlayCard(card, ctx)) {
        setDragCard(null)
        commitPlay(card.id, undefined, false)
      } else {
        say(explain())
        playSound('error')
        returnGhost(card, true)
      }
      return
    }
    const chip = card.shape === 'whot' ? chipAt(d.x, d.y) : null
    if (chip) {
      setDragCard(null)
      commitPlay(card.id, chip, slam)
    } else if (inStack(d.x, d.y)) {
      if (card.shape === 'whot') {
        say('drop the whot on a suit chip to name it')
        playSound('error')
        returnGhost(card, true)
      } else if (canPlayCard(card, ctx)) {
        setDragCard(null)
        commitPlay(card.id, undefined, slam)
      } else {
        say(explain())
        playSound('error')
        returnGhost(card, true)
      }
    } else {
      returnGhost(card, false)
    }
  }

  const cancelDrag = (e: ReactPointerEvent) => {
    const d = dragRef.current
    if (!d || d.pointerId !== e.pointerId || !dragCard) return
    dragRef.current = null
    clearHover()
    returnGhost(dragCard, false)
  }

  useEffect(() => {
    const d = dragRef.current
    const el = ghostRef.current
    if (dragCard && d && el) {
      el.style.transition = 'none'
      el.style.transform = `translate3d(${d.x - d.grabX}px, ${d.y - d.grabY}px, 0)`
    }
  }, [dragCard])

  const draw = () => {
    if (!myTurn) {
      say('not your turn')
      return
    }
    dispatch(ME, [{ type: 'draw' }])
  }

  const nextRound = () => {
    const { state, events } = startNextRound(stateRef.current)
    stateRef.current = state
    setBatch({ id: state.turnId, events })
    render()
  }

  const restart = () => {
    stateRef.current = newMatch()
    setBatch(null)
    setLines([])
    setToast(null)
    setNamingWhot(null)
    render()
  }

  const pileView = s.pile.slice(-5)
  const namingOpen = (!!dragCard && dragCard.shape === 'whot') || !!namingWhot

  return (
    <div ref={rootRef} className="lab4">
      <header className="lab4-top">
        <div className="lab4-wordmark">
          Whot Lab 04 · Pile Stack
          <small>drag from the tray · slam the pile · name whots on orbiting chips</small>
        </div>
        <button
          type="button"
          className={`lab4-topbtn${soundOn ? ' on' : ''}`}
          aria-pressed={soundOn}
          onClick={() => {
            setSoundOn(!soundOn)
            setSoundEnabled(!soundOn)
          }}
        >
          SOUND {soundOn ? 'ON' : 'OFF'}
        </button>
        <button type="button" className="lab4-topbtn lab4-exit" onClick={() => setExitAsk(true)}>Exit lab4</button>
      </header>

      <main className="lab4-board">
        <div className="lab4-bots">
          {opponents.map((p) => (
            <div key={p.id} className={`lab4-seat lab4-panel${turnPlayer?.id === p.id ? ' active' : ''}`}>
              {p.announcedLastCard && <span className="lab4-stamp">LAST CARD</span>}
              {s.phase === 'playing' && isCatchable(p) && (
                <button type="button" className="lab4-stamp" onClick={() => dispatch(ME, [{ type: 'catch', targetId: p.id }])}>
                  CATCH!
                </button>
              )}
              <span className="lab4-seat-name">{p.name}</span>
              <span className="lab4-pips" aria-label={`${p.hand.length} cards`}>
                {Array.from({ length: Math.min(p.hand.length, 10) }).map((_, i) => <i key={i} className="lab4-pip" />)}
              </span>
              {turnPlayer?.id === p.id && <span className="lab4-dot" aria-label="thinking" />}
            </div>
          ))}
        </div>

        <div className="lab4-table">
          <aside className="lab4-market lab4-panel">
            <span className="lab4-count">MARKET {s.market.length}</span>
            <button
              type="button"
              className="lab4-deck"
              onClick={draw}
              disabled={!myTurn}
              aria-label={pendingPickMine ? `Take the pick of ${s.pendingPick?.amount}` : `Go to market, ${s.market.length} cards left`}
            >
              <span className="lab4-deckcard" style={{ transform: 'translate(-6px,4px) rotate(-6deg)' }}><ToyCard faceDown width={86} /></span>
              <span className="lab4-deckcard" style={{ transform: 'translate(4px,-3px) rotate(4deg)' }}><ToyCard faceDown width={86} /></span>
              <span className="lab4-deckcard"><ToyCard faceDown width={86} /></span>
            </button>
            {pendingPickMine ? (
              <span className="lab4-mustpick">TAP DECK — PICK {s.pendingPick?.amount}</span>
            ) : (
              <span className="lab4-count dim">{s.market.length === 0 ? 'EMPTY — PILE REFILLS IT' : `${s.market.length} LEFT`}</span>
            )}
          </aside>

          <div ref={stackRef} className="lab4-floor">
            <span className="lab4-pad" aria-hidden />
            {s.requestedShape && (
              <span className="lab4-badge">
                <ShapeGlyph shape={s.requestedShape} size={16} /> NAME: {SHAPE_NAMES[s.requestedShape].toUpperCase()}
              </span>
            )}
            <span className="lab4-badge lab4-meta">{s.pile.length} SLAMMED</span>

            <div className="lab4-stack">
              {pileView.map((card, i) => {
                const h = cardHash(card.id)
                const isTop = i === pileView.length - 1
                return (
                  <motion.div
                    key={card.id}
                    className="lab4-pilecard"
                    style={{ zIndex: i }}
                    initial={isTop ? { x: (h % 13) - 6, y: -160, rotate: (h % 17) - 8 + 22, opacity: 0.6, scale: 1.07 } : false}
                    animate={{ x: (h % 13) - 6, y: ((h >> 3) % 11) - 5, rotate: (h % 17) - 8, opacity: 1, scale: 1 }}
                    transition={{ type: 'spring', stiffness: 420, damping: 24 }}
                  >
                    <ToyCard card={card} width={94} />
                  </motion.div>
                )
              })}
            </div>

            {namingOpen && myTurn && (
              <div className="lab4-orbit">
                {SUITS.map((suit, i) => (
                  <button
                    key={suit}
                    type="button"
                    className="lab4-chip"
                    aria-label={`name ${SHAPE_NAMES[suit]}`}
                    ref={(el) => {
                      if (el) chipEls.current.set(suit, el)
                      else chipEls.current.delete(suit)
                    }}
                    style={{ transform: `translate(-50%,-50%) rotate(${i * 72}deg) translateY(-118px)` }}
                    onClick={() => {
                      if (namingWhot) {
                        const card = namingWhot
                        setNamingWhot(null)
                        commitPlay(card.id, suit, false)
                      }
                    }}
                  >
                    <span className="lab4-chip-tilt" style={{ transform: `rotate(${-i * 72}deg)` }}>
                      <span className="lab4-chip-spin"><ShapeGlyph shape={suit} size={30} /></span>
                    </span>
                  </button>
                ))}
              </div>
            )}
            {namingWhot && (
              <button type="button" className="lab4-nametip" onClick={() => setNamingWhot(null)}>CANCEL NAMING</button>
            )}

            <div className="lab4-ticker" aria-live="polite">
              {lines.slice(-3).map((line, i) => (
                <span key={`${line.text}-${lines.length - i}`} className={`lab4-line ${line.tone}`}>{line.text}</span>
              ))}
            </div>
          </div>
        </div>
      </main>

      <section className="lab4-dock">
        <div className="lab4-dock-row">
          <span className={`lab4-turnchip${myTurn ? ' mine' : ''}`}>
            {s.phase !== 'playing'
              ? 'TABLE SETTLED'
              : myTurn
                ? pendingPickMine
                  ? 'TAKE THE PICK — TAP THE DECK'
                  : 'YOUR TURN — DRAG & SLAM'
                : `${turnPlayer?.name.toUpperCase()} IS WINDING UP…`}
          </span>
          {canCallLastCard && (
            <button type="button" className="lab4-btn warn" onClick={() => dispatch(ME, [{ type: 'lastCard' }])}>CALL LAST CARD</button>
          )}
          {me?.announcedLastCard && <span className="lab4-turnchip good">LAST CARD CALLED</span>}
          <span className="lab4-count">{hand.length} IN HAND · ROUND {s.round}</span>
        </div>
        <div className="lab4-hand">
          {hand.map((card) => {
            const legal = myTurn && legalIds.has(card.id)
            return (
              <div
                key={card.id}
                ref={(el) => {
                  if (el) trayEls.current.set(card.id, el)
                  else trayEls.current.delete(card.id)
                }}
                className={`lab4-grip${legal ? ' legal' : myTurn ? ' dim' : ''}${dragCard?.id === card.id ? ' lifted' : ''}`}
                onPointerDown={(e) => beginDrag(e, card)}
                onPointerMove={moveDrag}
                onPointerUp={endDrag}
                onPointerCancel={cancelDrag}
                onContextMenu={(e) => e.preventDefault()}
              >
                <ToyCard card={card} width={84} muted={myTurn && !legal} />
              </div>
            )
          })}
        </div>
      </section>

      {dragCard && (
        <div ref={ghostRef} className="lab4-ghost">
          <ToyCard card={dragCard} width={96} />
        </div>
      )}

      {toast && <div key={`${toast.id}-${toast.text}`} className={`lab4-toast ${toast.tone}`}>{toast.text}</div>}

      <AnimatePresence>
        {s.phase === 'roundOver' && s.lastRound && (
          <motion.div className="lab4-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="lab4-sheet">
              <h2>
                {s.lastRound.winnerId === ME
                  ? 'YOU CHECK UP'
                  : s.lastRound.winnerId
                    ? `${nameOf(s.lastRound.winnerId).toUpperCase()} CHECKS UP`
                    : 'NOBODY CHECKS UP'}
              </h2>
              <p className="lab4-sub">
                ROUND {s.lastRound.round} · {s.lastRound.reason === 'tender' ? 'MARKET DRY' : 'WINNER TAKES THE PILE'}
              </p>
              <div className="lab4-score">
                {s.lastRound.hands.map((row) => {
                  const player = s.players.find((p) => p.id === row.playerId)
                  return (
                    <div key={row.playerId} className={`lab4-srow${row.playerId === s.lastRound?.winnerId ? ' win' : ''}`}>
                      <span>{player?.name ?? row.playerId}{player?.eliminated ? ' · OUT' : ''}</span>
                      <span>{row.points} PTS</span>
                    </div>
                  )
                })}
              </div>
              <button type="button" className="lab4-btn" onClick={nextRound}>NEXT ROUND</button>{' '}
              <button type="button" className="lab4-btn ghost" onClick={restart}>NEW MATCH</button>
            </div>
          </motion.div>
        )}
        {s.phase === 'matchOver' && s.matchWinnerId && (
          <motion.div className="lab4-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="lab4-sheet">
              <h2>{s.matchWinnerId === ME ? 'YOU WIN THE MATCH' : `${nameOf(s.matchWinnerId).toUpperCase()} WINS THE MATCH`}</h2>
              <p className="lab4-sub">THAT IS THE WHOLE MATCH</p>
              <button type="button" className="lab4-btn" onClick={restart}>NEW MATCH</button>
            </div>
          </motion.div>
        )}
        {exitAsk && (
          <motion.div className="lab4-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="lab4-sheet">
              <h2>LEAVE THE LAB?</h2>
              <p className="lab4-sub">THE PILE WILL NOT BE SAVED</p>
              <button type="button" className="lab4-btn" onClick={() => (window.location.hash = '')}>LEAVE</button>{' '}
              <button type="button" className="lab4-btn ghost" onClick={() => setExitAsk(false)}>KEEP SLAMMING</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}