import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { describeEvent, type EventLine } from '../lib/events'
import { playSound, unlockAudio, vibrate } from '../lib/sound'
import {
  applyAction,
  applyTimeout,
  createMatch,
  currentPlayer,
  isCatchable,
  nextActiveIndex,
  playContext,
  seededRng,
  startNextRound,
  type Seat,
} from '../engine/gameEngine'
import { chooseBotMove } from '../engine/bot'
import {
  canPlayCard,
  GENERAL_MARKET,
  HOLD_ON,
  isSpecial,
  PICK_THREE,
  PICK_TWO,
  SHAPE_NAMES,
  SPECIAL_NAMES,
  SUITS,
  type Card,
  type GameAction,
  type GameEvent,
  type GameState,
  type Shape,
  type Suit,
  SUSPENSION,
} from '../types/game'
import { WhotCard } from '../components/cards/WhotCard'
import { ShapeGlyph } from '../components/cards/shapes'
import './lab3.css'

const ME = 'me'

const SEATS: Seat[] = [
  { id: ME, name: 'You', avatar: 'me', isBot: false },
  { id: 'bot-1', name: 'Ada', avatar: 'ada', isBot: true, botLevel: 'normal' },
  { id: 'bot-2', name: 'Chidi', avatar: 'chidi', isBot: true, botLevel: 'hard' },
  { id: 'bot-3', name: 'Ngozi', avatar: 'ngozi', isBot: true, botLevel: 'easy' },
]

const SETTINGS = { handSize: 7, targetScore: 100, pickDefence: 'stack' as const, turnSeconds: 0 }

function newMatch(): GameState {
  return createMatch(SEATS, SETTINGS, seededRng(Math.floor(Math.random() * 2 ** 31)))
}

const CARD_W = 192
const STEP = CARD_W + 30
const SWIPE_X = 46
const SWIPE_UP = 58
const SHAPE_ORDER: Shape[] = ['circle', 'triangle', 'cross', 'square', 'star', 'whot']

/** Editorial spot inks — the aura wash behind a legal focus card. */
const SUIT_INK: Record<Shape, string> = {
  circle: '#d0342c',
  triangle: '#0e7a5c',
  cross: '#2456b8',
  square: '#c07a15',
  star: '#6d3fb4',
  whot: '#141414',
}

function sortHand(cards: Card[]): Card[] {
  return [...cards].sort((a, b) => SHAPE_ORDER.indexOf(a.shape) - SHAPE_ORDER.indexOf(b.shape) || a.number - b.number)
}

function cardName(card: Card): string {
  if (card.shape === 'whot') return 'Whot!'
  const special = SPECIAL_NAMES[card.number]
  return special ? `${SHAPE_NAMES[card.shape]} ${special}` : `${SHAPE_NAMES[card.shape]} ${card.number}`
}

/* The whot dial: five wedges in a ring around the focused card. */
const DIAL = 356
const DIAL_C = DIAL / 2
const DIAL_R0 = 86
const DIAL_R1 = 166

function polar(r: number, deg: number): [number, number] {
  const a = (deg * Math.PI) / 180
  return [DIAL_C + r * Math.cos(a), DIAL_C - r * Math.sin(a)]
}

function wedgePath(i: number): string {
  const a0 = -90 + i * 72 + 4
  const [x0, y0] = polar(DIAL_R1, a0)
  const [x1, y1] = polar(DIAL_R1, a0 + 64)
  const [x2, y2] = polar(DIAL_R0, a0 + 64)
  const [x3, y3] = polar(DIAL_R0, a0)
  return `M ${x0} ${y0} A ${DIAL_R1} ${DIAL_R1} 0 0 0 ${x1} ${y1} L ${x2} ${y2} A ${DIAL_R0} ${DIAL_R0} 0 0 1 ${x3} ${y3} Z`
}

/**
 * Whot Lab №3 (#/lab3) — the focus carousel.
 * One card huge in the centre, the rest of the hand as edges on both sides.
 * Swipe left/right to browse, swipe up to throw the focused card, swipe down
 * on the market pile to draw. A whot focus opens a five-wedge shape dial
 * around the card. It runs the same engine and bots directly, offline, and
 * touches nothing in the online game: no store, no connection, no engine edits.
 */
export default function Lab3() {
  const [tick, setTick] = useState(0)
  const stateRef = useRef<GameState>(newMatch())
  const [batch, setBatch] = useState<{ turnId: number; events: GameEvent[] } | null>(null)
  const [lines, setLines] = useState<EventLine[]>([])
  const [exitAsk, setExitAsk] = useState(false)
  const [focusId, setFocusId] = useState<string | null>(null)
  const [dialOpen, setDialOpen] = useState(false)
  const [shake, setShake] = useState(false)

  const s = stateRef.current
  const render = useCallback(() => setTick((n) => n + 1), [])

  const dispatch = useCallback(
    (playerId: string, actions: GameAction[]) => {
      const prev = stateRef.current
      if (prev.phase !== 'playing') return
      const events: GameEvent[] = []
      let state = prev
      for (const action of actions) {
        const result = applyAction(state, playerId, action)
        if (!result.ok) return
        state = result.state
        events.push(...result.events)
      }
      stateRef.current = state
      setBatch({ turnId: state.turnId, events })
      render()
    },
    [render],
  )

  const nameOf = useCallback((id: string) => stateRef.current.players.find((p) => p.id === id)?.name ?? 'Someone', [])

  // Bots take their turn a beat after they are dealt it, with the same
  // "if the move went nowhere, go to market" fallback the online table uses.
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
        setBatch({ turnId: timeout.state.turnId, events: [...events, ...timeout.events] })
      } else {
        stateRef.current = state
        setBatch({ turnId: state.turnId, events })
      }
      render()
    }, 750 + Math.random() * 1100)
    return () => clearTimeout(timer)
  }, [tick, render])

  // A bot pounces on a human who forgot to call last card.
  useEffect(() => {
    const state = stateRef.current
    if (state.phase !== 'playing') return
    const mine = state.players.find((p) => p.id === ME)
    if (!mine || !isCatchable(mine)) return
    const timer = window.setTimeout(() => {
      const fresh = stateRef.current
      const mine = fresh.players.find((p) => p.id === ME)
      if (fresh.phase !== 'playing' || !mine || !isCatchable(mine)) return
      dispatch('bot-2', [{ type: 'catch', targetId: ME }])
    }, 2600 + Math.random() * 2600)
    return () => window.clearTimeout(timer)
  }, [tick, dispatch])

  // Sound, haptics and commentary for whatever just happened.
  useEffect(() => {
    if (!batch) return
    for (const event of batch.events) {
      const line = describeEvent(event, { nameOf, myId: ME, verbose: true })
      if (line) setLines((q) => [...q, line].slice(-4))
      switch (event.type) {
        case 'played':
          playSound(isSpecial(event.card) ? 'special' : 'play')
          break
        case 'pick':
          playSound('pick')
          vibrate(30)
          break
        case 'drew':
          playSound('draw')
          break
        case 'lastCard':
          playSound('lastCard')
          vibrate(20)
          break
        case 'caught':
          playSound('caught')
          vibrate([30, 40, 30])
          break
        case 'holdOn':
        case 'suspended':
        case 'shapeRequested':
        case 'generalMarket':
          playSound('special')
          break
        case 'reshuffled':
        case 'roundStarted':
          playSound('shuffle')
          break
        case 'roundOver':
        case 'matchOver':
          playSound((event.type === 'roundOver' ? event.result.winnerId : event.winnerId) === ME ? 'win' : 'lose')
          break
      }
    }
  }, [batch, nameOf])

  const me = s.players.find((p) => p.id === ME)
  const hand = useMemo(() => (me ? sortHand(me.hand) : []), [me])
  const fi = useMemo(() => {
    if (hand.length === 0) return -1
    const idx = focusId ? hand.findIndex((c) => c.id === focusId) : 0
    return idx >= 0 ? idx : 0
  }, [hand, focusId])
  const focusCard = fi >= 0 ? (hand[fi] ?? null) : null
  const turnPlayer = s.phase === 'playing' ? currentPlayer(s) : null
  const myTurn = !!turnPlayer && turnPlayer.id === ME
  const ctx = playContext(s)
  const legalIds = useMemo(() => {
    if (!myTurn || !me || s.phase !== 'playing') return new Set<string>()
    return new Set(me.hand.filter((c) => canPlayCard(c, ctx)).map((c) => c.id))
  }, [myTurn, me, ctx, s.phase])
  const focusLegal = !!focusCard && myTurn && legalIds.has(focusCard.id)
  const canCallLastCard =
    !!me && myTurn && s.phase === 'playing' && !me.announcedLastCard && me.hand.length > 0 && me.hand.length <= 2
  const pendingPickMine = myTurn && s.phase === 'playing' && !!s.pendingPick && legalIds.size === 0

  // The carousel track is moved by hand so a drag never re-renders the lab.
  const trackRef = useRef<HTMLDivElement>(null)
  const focusRef = useRef(fi)
  focusRef.current = fi

  const setTrack = useCallback((dx: number, animate: boolean) => {
    const el = trackRef.current
    if (!el) return
    el.style.transition = animate ? 'transform 400ms cubic-bezier(.2,.85,.25,1)' : 'none'
    el.style.transform = `translateX(${-(focusRef.current * STEP + CARD_W / 2) + dx}px)`
  }, [])

  useEffect(() => {
    setTrack(0, true)
  }, [fi, hand.length, setTrack])

  const step = (dir: number): boolean => {
    if (hand.length === 0) return false
    const next = Math.max(0, Math.min(hand.length - 1, fi + dir))
    if (next === fi) return false
    setFocusId(hand[next]?.id ?? null)
    setDialOpen(false)
    playSound('tap')
    vibrate(8)
    return true
  }

  const reject = useCallback(() => {
    playSound('error')
    vibrate(60)
    setShake(true)
    window.setTimeout(() => setShake(false), 340)
  }, [])

  const playFocused = (shape?: Suit) => {
    if (s.phase !== 'playing') return
    if (!myTurn) {
      reject()
      return
    }
    const card = focusCard
    if (!card || !legalIds.has(card.id)) {
      if (card) reject()
      return
    }
    if (shape === undefined && card.shape === 'whot') {
      setDialOpen(true)
      playSound('tap')
      return
    }
    dispatch(ME, [{ type: 'play', cardId: card.id, requestedShape: shape }])
    setFocusId(hand[fi + 1]?.id ?? hand[fi - 1]?.id ?? null)
    setDialOpen(false)
  }

  const draw = () => (myTurn ? dispatch(ME, [{ type: 'draw' }]) : reject())

  // One gesture surface drives the carousel: horizontal to browse, up to throw,
  // a plain tap to focus the card you touched.
  const gesture = useRef<{ id: number; x0: number; y0: number; moved: boolean } | null>(null)

  const onStageDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    unlockAudio()
    gesture.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, moved: false }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const onStageMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gesture.current
    if (!g || e.pointerId !== g.id) return
    const dx = e.clientX - g.x0
    const dy = e.clientY - g.y0
    if (Math.abs(dx) > 6 || Math.abs(dy) > 6) g.moved = true
    // A mostly-vertical rising drag previews the throw; everything else carousels.
    setTrack(dy < -SWIPE_UP && Math.abs(dy) > Math.abs(dx) ? dx * 0.3 : dx, false)
  }

  const onStageUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gesture.current
    gesture.current = null
    if (!g || e.pointerId !== g.id) return
    const dx = e.clientX - g.x0
    const dy = e.clientY - g.y0
    if (Math.abs(dx) >= SWIPE_X && Math.abs(dx) > Math.abs(dy)) {
      if (!step(dx < 0 ? 1 : -1)) setTrack(0, true)
      return
    }
    setTrack(0, true)
    if (dy <= -SWIPE_UP && Math.abs(dy) > Math.abs(dx)) {
      playFocused()
      return
    }
    if (g.moved) return
    const holder = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-idx]')
    if (holder instanceof HTMLElement && holder.dataset.idx) {
      const i = Number(holder.dataset.idx)
      const card = Number.isInteger(i) ? (hand[i] ?? null) : null
      if (card && card.id !== focusId) {
        setFocusId(card.id)
        setDialOpen(false)
        playSound('tap')
        vibrate(8)
      }
    }
  }

  // The market pile: swipe down to go to market (a plain click works too).
  const marketDrag = useRef<{ id: number; y0: number } | null>(null)
  const marketMoved = useRef(false)

  const onMarketDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    unlockAudio()
    marketMoved.current = false
    marketDrag.current = { id: e.pointerId, y0: e.clientY }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onMarketMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = marketDrag.current
    if (g && e.pointerId === g.id && e.clientY - g.y0 > 10) marketMoved.current = true
  }
  const onMarketUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = marketDrag.current
    marketDrag.current = null
    if (g && e.pointerId === g.id && e.clientY - g.y0 > 44) {
      marketMoved.current = true
      draw()
    }
  }

  const nextRound = () => {
    const { state, events } = startNextRound(stateRef.current)
    stateRef.current = state
    setBatch({ turnId: state.turnId, events })
    setFocusId(null)
    setDialOpen(false)
    render()
  }
  const restart = () => {
    stateRef.current = newMatch()
    setBatch(null)
    setLines([])
    setFocusId(null)
    setDialOpen(false)
    render()
  }

  // Legality copy for the caption line under the focus card.
  let caption: string | null = null
  let captionTone: 'bad' | 'good' | 'neutral' = 'neutral'
  if (s.phase === 'playing' && !myTurn) {
    caption = `${turnPlayer?.name ?? 'Someone'} is playing…`
  } else if (focusCard && myTurn) {
    if (focusLegal) {
      const who = s.players[nextActiveIndex(s.players, s.turnIndex)]?.name ?? 'the next player'
      const rest = hand.length - 1
      if (focusCard.shape === 'whot') caption = 'name any shape'
      else if (focusCard.number === HOLD_ON) caption = 'you throw again'
      else if (focusCard.number === PICK_TWO) caption = `${who} picks two`
      else if (focusCard.number === PICK_THREE) caption = `${who} picks three`
      else if (focusCard.number === SUSPENSION) caption = `${who} sits out`
      else if (focusCard.number === GENERAL_MARKET) caption = 'everybody to market'
      else if (rest === 0) caption = 'that checks up'
      else if (rest === 1) caption = 'then call last card'
      else caption = 'clean throw'
      captionTone = 'good'
    } else {
      if (s.pendingPick) {
        caption =
          s.settings.pickDefence === 'none'
            ? `no defence — pick ${s.pendingPick.amount}`
            : `throw a ${s.pendingPick.number} to defend, or take the ${s.pendingPick.amount}`
      } else if (s.requestedShape) {
        caption = `${SHAPE_NAMES[s.requestedShape]} was named — nothing else plays`
      } else {
        const top = s.pile[s.pile.length - 1] ?? null
        caption = top ? `not a ${SHAPE_NAMES[top.shape].toLowerCase()}, not a ${top.number}` : null
      }
      captionTone = 'bad'
    }
  }

  const counterNum = fi >= 0 ? fi + 1 : 0

  return (
    <div className="lab3">
      <header className="lab3-mast">
        <div className="lab3-brand">
          Whot Lab <em>№3</em>
        </div>
        <div className="lab3-mast-mid">
          <span className="lab3-kicker">The Focus Carousel</span>
          <span className="lab3-mast-sub">swipe ⇄ to browse · swipe ↑ to throw · swipe ↓ on the market to draw</span>
        </div>
        <button type="button" className="lab3-exit" onClick={() => setExitAsk(true)}>
          Exit lab3
        </button>
      </header>
      <div className="lab3-rule" aria-hidden />

      <div className="lab3-bylines">
        {s.players.map((p) => (
          <div key={p.id} className={`lab3-byline${turnPlayer?.id === p.id ? ' active' : ''}`}>
            <span className="lab3-byline-dot" aria-hidden />
            <span className="lab3-byline-name">{p.id === ME ? 'You' : p.name}</span>
            <span className="lab3-byline-count">{p.hand.length} cards</span>
            {p.announcedLastCard && <span className="lab3-stamp">LAST CARD</span>}
            {s.phase === 'playing' && p.id !== ME && isCatchable(p) && (
              <button type="button" className="lab3-catch" onClick={() => dispatch(ME, [{ type: 'catch', targetId: p.id }])}>
                CATCH
              </button>
            )}
          </div>
        ))}
        <span className="lab3-issue">
          Round {s.round} <i>·</i> first to 100
        </span>
      </div>

      <main
        className={`lab3-stage${shake ? ' shake' : ''}`}
        onPointerDown={onStageDown}
        onPointerMove={onStageMove}
        onPointerUp={onStageUp}
        onPointerCancel={() => {
          gesture.current = null
          setTrack(0, true)
        }}
      >
        <div className="lab3-counter">
          <span className="lab3-count-big">{counterNum}</span>
          <span className="lab3-count-of">of {hand.length}</span>
        </div>
        {fi >= 0 && (
          <div className="lab3-bignum" aria-hidden>
            {counterNum}
          </div>
        )}
        <div className="lab3-track" ref={trackRef}>
          {hand.map((card, i) => {
            const illegal = myTurn && !legalIds.has(card.id)
            return (
              <div key={card.id} data-idx={i} className={`lab3-card${i === fi ? ' focus' : ''}${i === fi && illegal ? ' illegal' : ''}`}>
                {i === fi && focusLegal && (
                  <i
                    className="lab3-aura"
                    style={{ background: `radial-gradient(closest-side, ${SUIT_INK[card.shape]}b3, ${SUIT_INK[card.shape]}00 74%)` }}
                  />
                )}
                <WhotCard card={card} muted={illegal} />
              </div>
            )
          })}
          {hand.length === 0 && <div className="lab3-empty">the pile is yours</div>}
        </div>
        {focusCard && <div className="lab3-name">{cardName(focusCard)}</div>}
        {caption && <div className={`lab3-caption ${captionTone}`}>{caption}</div>}
        {s.requestedShape && (
          <div className="lab3-requested">
            <span className="lab3-kicker">Named shape</span>
            <strong>{SHAPE_NAMES[s.requestedShape]}</strong>
          </div>
        )}
        {s.phase === 'playing' && dialOpen && focusCard?.shape === 'whot' && myTurn && (
          <div className="lab3-dial" onClick={() => setDialOpen(false)} onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()}>
            <span className="lab3-kicker red">Name a shape</span>
            <svg width={DIAL} height={DIAL} viewBox={`0 0 ${DIAL} ${DIAL}`} aria-label="Pick a shape to request">
              {SUITS.map((suit, i) => {
                const am = -90 + i * 72 + 36
                const [gx, gy] = polar(114, am)
                const [tx, ty] = polar(146, am)
                return (
                  <g key={suit} className="lab3-wedge" onClick={() => playFocused(suit)}>
                    <path d={wedgePath(i)} fill={SUIT_INK[suit]} stroke="var(--lab3-paper)" strokeWidth="2.5" />
                    <g transform={`translate(${gx - 13} ${gy - 13}) scale(0.26)`}>
                      <ShapeGlyph shape={suit} fill="#fff" />
                    </g>
                    <text x={tx} y={ty} textAnchor="middle" dominantBaseline="central" className="lab3-wedge-label">
                      {SHAPE_NAMES[suit].toUpperCase()}
                    </text>
                  </g>
                )
              })}
            </svg>
            <button type="button" className="lab3-dial-cancel" onClick={() => setDialOpen(false)}>
              never mind
            </button>
          </div>
        )}
      </main>

      <div className="lab3-actions">
        <button
          type="button"
          className="lab3-throw"
          disabled={!myTurn || !focusCard || dialOpen}
          onClick={() => playFocused()}
        >
          {focusCard?.shape === 'whot' ? 'Name a shape ↿' : 'Throw it ↿'}
        </button>
        {canCallLastCard && (
          <button type="button" className="lab3-call" onClick={() => dispatch(ME, [{ type: 'lastCard' }])}>
            Call last card
          </button>
        )}
        {pendingPickMine && s.pendingPick && (
          <span className="lab3-owed">
            you owe {s.pendingPick.amount} — no {s.pendingPick.number} to defend
          </span>
        )}
        {me?.announcedLastCard && <span className="lab3-chip">last card called</span>}
      </div>

      <footer className="lab3-foot">
        <div
          className="lab3-market"
          onClick={() => {
            if (!marketMoved.current) draw()
          }}
          onPointerDown={onMarketDown}
          onPointerMove={onMarketMove}
          onPointerUp={onMarketUp}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') draw()
          }}
          aria-label={`Market, ${s.market.length} cards. Activate to draw.`}
        >
          <span className="lab3-market-pile" aria-hidden>
            <WhotCard faceDown />
            <WhotCard faceDown />
            <WhotCard faceDown />
          </span>
          <span className="lab3-market-meta">
            <span className="lab3-kicker">Market</span>
            <span className="lab3-market-count">{s.market.length}</span>
            <span className="lab3-market-hint">swipe ↓ to draw</span>
          </span>
        </div>
        <div className="lab3-ticker" aria-live="polite">
          {lines.slice(-3).map((line, i) => (
            <span key={`${line.text}-${lines.length - i}`} className={`lab3-ticker-line ${line.tone}`}>
              {line.text}
            </span>
          ))}
        </div>
      </footer>

      {s.phase === 'roundOver' && s.lastRound && (
        <Lab3Overlay
          kicker={`Round ${s.lastRound.round} — closed`}
          title={s.lastRound.winnerId === ME ? 'You check up.' : `${nameOf(s.lastRound.winnerId)} checks up.`}
          extra={
            <div className="lab3-table">
              {s.lastRound.hands.map((row) => {
                const player = s.players.find((p) => p.id === row.playerId)
                return (
                  <div key={row.playerId} className={`lab3-row${row.playerId === s.lastRound?.winnerId ? ' winner' : ''}`}>
                    <span>{player?.id === ME ? 'You' : (player?.name ?? '—')}</span>
                    <span className="pts">
                      {row.points} pts{player?.eliminated ? ' · out' : ''}
                    </span>
                  </div>
                )
              })}
            </div>
          }
        >
          <button type="button" className="lab3-btn" onClick={nextRound}>
            Next round
          </button>
          <button type="button" className="lab3-btn ghost" onClick={restart}>
            New match
          </button>
        </Lab3Overlay>
      )}
      {s.phase === 'matchOver' && s.matchWinnerId && (
        <Lab3Overlay
          kicker="The match is settled"
          title={s.matchWinnerId === ME ? 'You win the match.' : `${nameOf(s.matchWinnerId)} wins the match.`}
        >
          <button type="button" className="lab3-btn" onClick={restart}>
            New match
          </button>
        </Lab3Overlay>
      )}
      {exitAsk && (
        <Lab3Overlay kicker="Hold the presses" title="Leave the lab?" sub="the carousel will not be saved">
          <button type="button" className="lab3-btn" onClick={() => (window.location.hash = '')}>
            Leave
          </button>
          <button type="button" className="lab3-btn ghost" onClick={() => setExitAsk(false)}>
            Keep playing
          </button>
        </Lab3Overlay>
      )}
    </div>
  )
}

/** Shared magazine panel: red kicker, Fraunces italic headline, black buttons. */
function Lab3Overlay({
  kicker,
  title,
  sub,
  extra,
  children,
}: {
  kicker: string
  title: string
  sub?: string
  extra?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="lab3-overlay">
      <div className="lab3-panel">
        <span className="lab3-kicker red">{kicker}</span>
        <h2>{title}</h2>
        {sub && <p className="sub">{sub}</p>}
        {extra}
        <div className="lab3-panel-actions">{children}</div>
      </div>
    </div>
  )
}