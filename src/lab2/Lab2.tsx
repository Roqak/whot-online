import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { describeEvent, type EventLine } from '../lib/events'
import { sortHand } from '../lib/hand'
import { AVATARS } from '../lib/avatars'
import { playSound, setSoundEnabled, unlockAudio, vibrate } from '../lib/sound'
import {
  applyAction, applyTimeout, createMatch, currentPlayer, isCatchable,
  playContext, seededRng, startNextRound, type Seat,
} from '../engine/gameEngine'
import { chooseBotMove } from '../engine/bot'
import {
  SHAPE_NAMES, SUITS, canPlayCard, isSpecial,
  type Card, type GameAction, type GameEvent, type GameState, type Suit,
} from '../types/game'
import { ShapeIcon } from '../components/cards/shapes'
import './lab2.css'

const ME = 'me'

const SEATS: Seat[] = [
  { id: ME, name: 'You', avatar: 'owl', isBot: false },
  { id: 'bot-1', name: 'Aunty Kemi', avatar: 'lion', isBot: true, botLevel: 'normal' },
  { id: 'bot-2', name: 'Bode', avatar: 'fox', isBot: true, botLevel: 'normal' },
  { id: 'bot-3', name: 'Zainab', avatar: 'parrot', isBot: true, botLevel: 'normal' },
]

const SETTINGS = { handSize: 7, targetScore: 100, pickDefence: 'stack' as const, turnSeconds: 0 }

function newMatch(): GameState {
  return createMatch(SEATS, SETTINGS, seededRng(Math.floor(Math.random() * 2 ** 31)))
}

/** Lantern inks for each suit — the ribbon and card faces borrow these. */
const SUIT_INK: Record<Suit, string> = {
  circle: '#3f7d72', triangle: '#c05a3c', cross: '#46639c', square: '#8a5fa0', star: '#c2913c',
}

/** Short captions that fit the small card face. */
const CAPTION_BY_NUMBER: Record<number, string> = {
  1: 'HOLD ON', 2: 'PICK TWO', 5: 'PICK THREE', 8: 'SUSPEND', 14: 'MARKET',
}

const PLAY_DY = 72 // px of upward travel before a flick counts
const FLICK_VY = -0.5 // px/ms upward velocity that counts as a flick
const TAP_DIST = 9 // movement under this is a tap
const RIBBON_STEP = 64 // px of horizontal travel per ribbon slot

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

interface Drag {
  cardId: string; x0: number; y0: number; dx: number; dy: number
  vx: number; vy: number; tilt: number; naming: boolean; shapeIndex: number
  t0: number; lastX: number; lastY: number; lastT: number
}

interface Refusal { cardId: string; reason: string; dy: number; tilt: number; nonce: number }

/** Ambient sounds keyed by plain event types; played/special cases branch inline. */
const SOUND_BY_EVENT: Partial<Record<GameEvent['type'], Parameters<typeof playSound>[0]>> = {
  pick: 'pick', drew: 'draw', lastCard: 'lastCard', caught: 'caught',
  holdOn: 'special', suspended: 'special', shapeRequested: 'special', generalMarket: 'special',
  reshuffled: 'shuffle', roundStarted: 'shuffle',
}
const BUZZ_BY_EVENT: Partial<Record<GameEvent['type'], number | number[]>> = {
  pick: 30, lastCard: 20, caught: [30, 40, 30],
}

/**
 * Whot Lab 2 (#/lab2) — the Swipe Deck. Cards sit in a fan like a real hand;
 * flick one up onto the pile to play it, flick the table down to draw, and a
 * Whot fans out a ribbon of shapes mid-flick for you to name. Same engine,
 * same bots, purely offline.
 */
export default function Lab2() {
  const [tick, setTick] = useState(0)
  const stateRef = useRef<GameState>(newMatch())
  if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__lab2State = stateRef
  const [batch, setBatch] = useState<{ turnId: number; events: GameEvent[] } | null>(null)
  const [lines, setLines] = useState<EventLine[]>([])
  const [soundOn, setSoundOn] = useState(true)
  const [drag, setDrag] = useState<Drag | null>(null)
  const [refuse, setRefuse] = useState<Refusal | null>(null)
  const [ribbon, setRibbon] = useState<{ cardId: string; shapeIndex: number; latched: boolean } | null>(null)
  const [dz, setDz] = useState<{ y0: number; dy: number; vy: number; t0: number; lastY: number; lastT: number } | null>(null)
  const [exitAsk, setExitAsk] = useState(false)

  const s = stateRef.current
  const render = useCallback(() => setTick((n) => n + 1), [])

  const dispatch = useCallback((playerId: string, actions: GameAction[]) => {
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
  }, [render])

  const nameOf = useCallback((id: string) => stateRef.current.players.find((p) => p.id === id)?.name ?? 'Someone', [])

  // Bots take their turn a beat after they are dealt it.
  useEffect(() => {
    const state = stateRef.current
    if (state.phase !== 'playing') return
    const player = currentPlayer(state)
    if (!player.isBot) return
    const timer = setTimeout(() => {
      const fresh = stateRef.current
      if (fresh.phase !== 'playing' || currentPlayer(fresh).id !== player.id) return
      const events: GameEvent[] = []
      let state = fresh
      for (const action of chooseBotMove(fresh, player.id, seededRng((Date.now() % 2 ** 31) | 0))) {
        const result = applyAction(state, player.id, action)
        if (!result.ok) break
        state = result.state
        events.push(...result.events)
      }
      if (events.length > 0 && state.turnId !== fresh.turnId) {
        stateRef.current = state
        setBatch({ turnId: state.turnId, events })
        render()
        return
      }
      const timeout = applyTimeout(state, player.id)
      if (!timeout.ok) return
      stateRef.current = timeout.state
      setBatch({ turnId: timeout.state.turnId, events: [...events, ...timeout.events] })
      render()
    }, 750 + Math.random() * 1100)
    return () => clearTimeout(timer)
  }, [tick, render])

  // Bots pounce on a human who forgot to call last card.
  useEffect(() => {
    const state = stateRef.current
    if (state.phase !== 'playing') return
    const me = state.players.find((p) => p.id === ME)
    if (!me || !isCatchable(me)) return
    const timer = window.setTimeout(() => {
      const fresh = stateRef.current
      const me = fresh.players.find((p) => p.id === ME)
      if (fresh.phase !== 'playing' || !me || !isCatchable(me)) return
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
      if (event.type === 'played') playSound(isSpecial(event.card) ? 'special' : 'play')
      else if (event.type === 'roundOver') playSound(event.result.winnerId === ME ? 'win' : 'lose')
      else if (event.type === 'matchOver' && event.winnerId === ME) playSound('win')
      else {
        const sound = SOUND_BY_EVENT[event.type]
        if (sound) playSound(sound)
      }
      const buzz = BUZZ_BY_EVENT[event.type]
      if (buzz) vibrate(buzz)
    }
  }, [batch, nameOf])

  const me = s.players.find((p) => p.id === ME)
  const turnPlayer = s.phase === 'playing' ? currentPlayer(s) : null
  const myTurn = s.phase === 'playing' && turnPlayer?.id === ME
  const ctx = useMemo(() => playContext(s), [tick]) // eslint-disable-line react-hooks/exhaustive-deps
  const hand = useMemo(() => (me ? sortHand(me.hand, 'shape') : []), [tick]) // eslint-disable-line react-hooks/exhaustive-deps
  const legalIds = useMemo(() => {
    if (!myTurn || !me) return new Set<string>()
    return new Set(me.hand.filter((c) => canPlayCard(c, ctx)).map((c) => c.id))
  }, [myTurn, me, ctx, tick]) // eslint-disable-line react-hooks/exhaustive-deps

  const explain = useCallback((): string => {
    if (s.pendingPick) {
      return s.settings.pickDefence === 'none'
        ? `pick ${s.pendingPick.amount} — no defence allowed`
        : `throw a ${s.pendingPick.number} to defend, or take the pick`
    }
    if (s.requestedShape) return `the shape is ${SHAPE_NAMES[s.requestedShape]} — nothing else plays`
    const top = s.pile[s.pile.length - 1]
    if (!top) return 'the table is not open yet'
    return `not a ${SHAPE_NAMES[top.shape]}, not a ${top.number}`
  }, [s.pendingPick, s.requestedShape, s.pile, s.settings.pickDefence])

  const refuseCard = useCallback((card: Card, reason: string, dy = -70, tilt = 0) => {
    playSound('error')
    vibrate(40)
    setRefuse({ cardId: card.id, reason, dy, tilt, nonce: Date.now() })
  }, [])

  const attemptPlay = useCallback((card: Card, shape?: Suit) => {
    if (!myTurn) return refuseCard(card, 'not your turn — wait for the beat')
    if (!legalIds.has(card.id)) return refuseCard(card, explain())
    dispatch(ME, [{ type: 'play', cardId: card.id, requestedShape: shape }])
  }, [myTurn, legalIds, explain, dispatch, refuseCard])

  // --- hand gestures: flick up to play, tilt follows pointer velocity -------
  const cardDown = (card: Card, e: ReactPointerEvent<HTMLDivElement>) => {
    if (s.phase !== 'playing') return
    e.currentTarget.setPointerCapture(e.pointerId)
    setRefuse(null)
    setDrag({
      cardId: card.id, x0: e.clientX, y0: e.clientY, dx: 0, dy: 0, vx: 0, vy: 0, tilt: 0,
      naming: false, shapeIndex: 2, t0: e.timeStamp, lastX: e.clientX, lastY: e.clientY, lastT: e.timeStamp,
    })
  }

  const cardMove = (card: Card, e: ReactPointerEvent<HTMLDivElement>) => {
    setDrag((d) => {
      if (!d || d.cardId !== card.id) return d
      const dt = Math.max(1, e.timeStamp - d.lastT)
      const dx = e.clientX - d.x0
      const dy = e.clientY - d.y0
      const vx = d.vx * 0.75 + ((e.clientX - d.lastX) / dt) * 0.25
      const vy = d.vy * 0.75 + ((e.clientY - d.lastY) / dt) * 0.25
      const naming = d.naming || (card.shape === 'whot' && dy < -40)
      // A Whot fans out the ribbon mid-flick: sideways travel picks the shape.
      const shapeIndex = naming ? clamp(2 + Math.round(dx / RIBBON_STEP), 0, 4) : 2
      return {
        ...d, dx, dy, vx, vy, naming, shapeIndex,
        tilt: clamp(vx * 12, -14, 14),
        lastX: e.clientX, lastY: e.clientY, lastT: e.timeStamp,
      }
    })
  }

  const cardUp = (card: Card, e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag
    setDrag(null)
    if (!d || d.cardId !== card.id || s.phase !== 'playing') return
    const flick = d.dy < -PLAY_DY && (d.vy < FLICK_VY || d.dy < -(PLAY_DY + 60))
    const tap = Math.hypot(d.dx, d.dy) < TAP_DIST && e.timeStamp - d.t0 < 350
    if (d.naming && card.shape === 'whot') {
      setRibbon(null)
      attemptPlay(card, SUITS[d.shapeIndex])
    } else if ((flick || tap) && card.shape === 'whot') {
      // A Whot always names its shape first: latch the ribbon open.
      setRibbon({ cardId: card.id, shapeIndex: 2, latched: true })
      vibrate(15)
    } else if (flick || tap) {
      attemptPlay(card)
    }
  }

  // --- draw gesture: flick down on the table, or tap it ---------------------
  const tableDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (s.phase !== 'playing') return
    e.currentTarget.setPointerCapture(e.pointerId)
    setDz({ y0: e.clientY, dy: 0, vy: 0, t0: e.timeStamp, lastY: e.clientY, lastT: e.timeStamp })
  }

  const tableMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    setDz((z) => {
      if (!z) return z
      const dt = Math.max(1, e.timeStamp - z.lastT)
      return {
        y0: z.y0, t0: z.t0, dy: e.clientY - z.y0,
        vy: z.vy * 0.75 + ((e.clientY - z.lastY) / dt) * 0.25,
        lastY: e.clientY, lastT: e.timeStamp,
      }
    })
  }

  const tableUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const z = dz
    setDz(null)
    if (!z || s.phase !== 'playing') return
    const flickDown = z.dy > 56 && z.vy > 0.35
    const tap = Math.abs(z.dy) < TAP_DIST && e.timeStamp - z.t0 < 350
    if (!flickDown && !tap) return
    if (!myTurn) {
      playSound('error')
      setLines((q) => [...q, { text: 'not your turn — wait for the beat', tone: 'bad' } as EventLine].slice(-4))
      return
    }
    dispatch(ME, [{ type: 'draw' }])
  }

  const callLastCard = () => dispatch(ME, [{ type: 'lastCard' }])
  const catchPlayer = (targetId: string) => dispatch(ME, [{ type: 'catch', targetId }])

  const nextRound = () => {
    const { state, events } = startNextRound(stateRef.current)
    stateRef.current = state
    setBatch({ turnId: state.turnId, events })
    render()
  }
  const restart = () => {
    stateRef.current = newMatch()
    setBatch(null)
    setLines([])
    setRefuse(null)
    setRibbon(null)
    render()
  }

  const topCard = s.pile[s.pile.length - 1] ?? null
  const pileBehind = s.pile.slice(-3, -1)
  const opponents = s.players.filter((p) => p.id !== ME)
  const pendingPickMine = s.pendingPick && myTurn && legalIds.size === 0
  const canCallLastCard = !!me && s.phase === 'playing' && !me.announcedLastCard && me.hand.length > 0 && me.hand.length <= 2
  const activeRibbon: { shapeIndex: number; latched: boolean } | null =
    drag?.naming ? { shapeIndex: drag.shapeIndex, latched: false } : ribbon
  const ribbonCard = ribbon ? hand.find((c) => c.id === ribbon.cardId) : null

  return (
    <div className="lab2-root" onPointerDown={() => unlockAudio()}>
      <header className="lab2-top">
        <div className="lab2-wordmark">
          <h1>Swipe Deck</h1>
          <p>flick a card up to play · flick the table down to draw</p>
        </div>
        <span className="lab2-meta">round {s.round} · {me?.hand.length ?? 0} in hand</span>
        <button
          type="button" className={`lab2-toggle${soundOn ? ' on' : ''}`} aria-pressed={soundOn}
          onClick={() => { setSoundOn(!soundOn); setSoundEnabled(!soundOn) }}
        >
          sound {soundOn ? 'on' : 'off'}
        </button>
        <button type="button" className="lab2-toggle lab2-exit" onClick={() => setExitAsk(true)}>Exit lab2</button>
      </header>

      <section className="lab2-arena">
        <div className="lab2-seats">
          {opponents.map((p) => {
            const avatar = AVATARS.find((a) => a.id === p.avatar)
            return (
              <div key={p.id} className={`lab2-seat${turnPlayer?.id === p.id ? ' active' : ''}`}>
                {p.announcedLastCard && <span className="lab2-stamp">LAST CARD</span>}
                {s.phase === 'playing' && isCatchable(p) && (
                  <button type="button" className="lab2-stamp catch" onClick={() => catchPlayer(p.id)}>CATCH!</button>
                )}
                <span className="lab2-seat-face" style={{ ['--hue' as string]: `${avatar?.hue ?? 70}` }}>
                  {avatar?.emoji ?? '🙂'}
                </span>
                <span className="lab2-seat-name">{p.name}</span>
                <span className="lab2-seat-count">{p.hand.length} cards</span>
              </div>
            )
          })}
        </div>

        <div className="lab2-center">
          <p className={`lab2-turn${myTurn ? ' mine' : ''}`}>
            {s.phase !== 'playing'
              ? 'the table has settled'
              : myTurn
                ? s.pendingPick
                  ? `the market holds ${s.pendingPick.amount} for you`
                  : 'your throw — flick a card up'
                : `${turnPlayer?.name} is deciding…`}
          </p>

          {activeRibbon && (
            <ShapeRibbon
              shapeIndex={activeRibbon.shapeIndex}
              latched={activeRibbon.latched}
              onCancel={() => setRibbon(null)}
              onPick={(i) => {
                setRibbon(null)
                if (ribbonCard) attemptPlay(ribbonCard, SUITS[i])
              }}
            />
          )}

          <div
            className={`lab2-table${dz && dz.dy > 10 ? ' pull' : ''}`}
            onPointerDown={tableDown}
            onPointerMove={tableMove}
            onPointerUp={tableUp}
            onPointerCancel={() => setDz(null)}
          >
            <div className="lab2-market">
              <span className="lab2-market-stack" aria-hidden><i /><i /><i /></span>
              <span className="lab2-market-count">{s.market.length}</span>
              <span className="lab2-market-hint">flick down to draw</span>
              {pendingPickMine && (
                <span className="lab2-must">you must pick {s.pendingPick?.amount} — or throw a {s.pendingPick?.number}</span>
              )}
            </div>
            <div className="lab2-pile">
              {s.requestedShape && (
                <span className="lab2-shape-badge">
                  <ShapeIcon shape={s.requestedShape} size={13} /> {SHAPE_NAMES[s.requestedShape]}
                </span>
              )}
              <div className="lab2-pile-under" aria-hidden>
                {pileBehind.map((card, i) => (
                  <i key={card.id} style={{ transform: `translate(${(i - 1) * 5}px, ${(i - 1) * 3}px) rotate(${(i - 1) * 5}deg)` }} />
                ))}
              </div>
              <motion.div
                className="lab2-pile-card"
                key={topCard?.id ?? 'empty'}
                initial={{ y: -26, opacity: 0, scale: 0.94 }}
                animate={{ y: 0, opacity: 1, scale: 1 }}
              >
                {topCard ? <CardFace card={topCard} legal /> : <span className="lab2-pile-empty">open table</span>}
              </motion.div>
            </div>
          </div>

          <div className="lab2-ticker" aria-live="polite">
            {lines.slice(-3).map((line, i) => (
              <motion.span
                key={`${line.text}-${lines.length - i}`}
                className={`lab2-line${line.tone === 'bad' ? ' bad' : line.tone === 'good' ? ' good' : ''}`}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 0.45 + 0.55 * (i / Math.max(1, lines.slice(-3).length - 1)) }}
              >
                {line.text}
              </motion.span>
            ))}
          </div>
        </div>
      </section>

      <section className="lab2-handzone">
        <div className="lab2-chips">
          {refuse && <span key={refuse.nonce} className="lab2-refuse">{refuse.reason}</span>}
          {canCallLastCard && (
            <button type="button" className="lab2-chip urge" onClick={callLastCard}>LAST CARD — call it</button>
          )}
          {me?.announcedLastCard && <span className="lab2-chip good">last card called</span>}
        </div>
        <div className="lab2-hand">
          {hand.map((card, i) => {
            const off = i - (hand.length - 1) / 2
            const d = s.phase === 'playing' && drag?.cardId === card.id ? drag : null
            const legal = legalIds.has(card.id)
            const dyShown = d ? (d.dy < 0 && !legal ? d.dy * 0.3 : d.dy) : 0
            const snap = refuse && refuse.cardId === card.id ? refuse : null
            return (
              <div
                key={card.id}
                className="lab2-slot"
                style={{
                  transform: `translateY(${Math.abs(off) ** 1.7 * 3}px) rotate(${off * 3.5}deg)`,
                  zIndex: d ? 60 : i,
                }}
              >
                <div
                  key={snap ? snap.nonce : 'rest'}
                  className={`lab2-card${legal ? ' legal' : ''}${d ? ' drag' : ''}${snap ? ' snap' : ''}`}
                  style={{
                    transform: d ? `translate(${d.dx}px, ${dyShown}px) rotate(${d.tilt}deg) scale(1.06)` : undefined,
                    ['--snap-y' as string]: `${snap?.dy ?? -70}px`,
                    ['--snap-tilt' as string]: `${snap?.tilt ?? 0}deg`,
                  }}
                  onPointerDown={(e) => cardDown(card, e)}
                  onPointerMove={(e) => cardMove(card, e)}
                  onPointerUp={(e) => cardUp(card, e)}
                  onPointerCancel={() => setDrag((q) => (q && q.cardId === card.id ? null : q))}
                >
                  <CardFace card={card} legal={legal} />
                </div>
              </div>
            )
          })}
        </div>
      </section>

      <AnimatePresence>
        {s.phase === 'roundOver' && s.lastRound && (
          <motion.div className="lab2-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="lab2-panel">
              <h2>{s.lastRound.winnerId === ME ? 'You check up' : `${nameOf(s.lastRound.winnerId)} checks up`}</h2>
              <p className="sub">round {s.lastRound.round} · the lanterns dim for the count</p>
              <div className="lab2-points">
                {s.lastRound.hands.map((row) => {
                  const player = s.players.find((p) => p.id === row.playerId)
                  return (
                    <div key={row.playerId} className={`lab2-points-row${row.playerId === s.lastRound?.winnerId ? ' winner' : ''}`}>
                      <span>{AVATARS.find((a) => a.id === player?.avatar)?.emoji ?? '🙂'} {player?.name ?? 'Someone'}</span>
                      <span className="pts">{row.points} pts{player?.eliminated ? ' · out' : ''}</span>
                    </div>
                  )
                })}
              </div>
              <button type="button" className="lab2-btn" onClick={nextRound}>Next round</button>{' '}
              <button type="button" className="lab2-btn ghost" onClick={restart}>New match</button>
            </div>
          </motion.div>
        )}
        {s.phase === 'matchOver' && s.matchWinnerId && (
          <motion.div className="lab2-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="lab2-panel">
              <h2>{s.matchWinnerId === ME ? 'You win the match' : `${nameOf(s.matchWinnerId)} wins the match`}</h2>
              <p className="sub">the last lantern goes out</p>
              <button type="button" className="lab2-btn" onClick={restart}>New match</button>
            </div>
          </motion.div>
        )}
        {exitAsk && (
          <motion.div className="lab2-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="lab2-panel">
              <h2>Leave the Swipe Deck?</h2>
              <p className="sub">the night market will not be saved</p>
              <button type="button" className="lab2-btn" onClick={() => (window.location.hash = '')}>Leave</button>{' '}
              <button type="button" className="lab2-btn ghost" onClick={() => setExitAsk(false)}>Keep playing</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/** The night-market card face: cream stock, suit ink, gold edge when legal. */
function CardFace({ card, legal }: { card: Card; legal: boolean }) {
  const whot = card.shape === 'whot'
  const { shape } = card
  const ink = shape === 'whot' ? '#e0b45c' : SUIT_INK[shape]
  const caption = whot ? null : CAPTION_BY_NUMBER[card.number]
  const index = whot ? '20' : String(card.number)
  return (
    <span className={`lab2-face${whot ? ' whot' : ''}${legal ? '' : ' muted'}`} style={{ color: ink }}>
      <i className="lab2-ix">{index}</i>
      <i className="lab2-mid"><ShapeIcon shape={card.shape} size={whot ? 46 : 42} /></i>
      {caption && <i className="lab2-cap">{caption}</i>}
      <i className="lab2-ix flip">{index}</i>
    </span>
  )
}

/** Five suit glyphs in a row — swiped through mid-flick or tapped when latched. */
function ShapeRibbon({ shapeIndex, latched, onPick, onCancel }: {
  shapeIndex: number
  latched: boolean
  onPick: (index: number) => void
  onCancel: () => void
}) {
  return (
    <div className="lab2-ribbon-wrap">
      {latched && <button type="button" className="lab2-ribbon-backdrop" aria-label="cancel naming" onClick={onCancel} />}
      <div className={`lab2-ribbon${latched ? ' latched' : ''}`}>
        {SUITS.map((suit, i) => (
          <button
            key={suit}
            type="button"
            className={`lab2-glyph${i === shapeIndex ? ' on' : ''}`}
            style={{ ['--glyph' as string]: SUIT_INK[suit] }}
            onClick={latched ? () => onPick(i) : undefined}
            tabIndex={latched ? 0 : -1}
          >
            <ShapeIcon shape={suit} size={30} />
            <span>{SHAPE_NAMES[suit]}</span>
          </button>
        ))}
      </div>
      <p className="lab2-ribbon-hint">{latched ? 'tap a shape to name it' : 'swipe sideways, release to name'}</p>
    </div>
  )
}