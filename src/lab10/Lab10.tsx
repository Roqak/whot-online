import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { getAvatar } from '../lib/avatars'
import { describeEvent, type EventLine } from '../lib/events'
import { sortHand } from '../lib/hand'
import { playSound, setSoundEnabled, vibrate } from '../lib/sound'
import {
  applyAction,
  applyTimeout,
  createMatch,
  currentPlayer,
  isCatchable,
  playContext,
  seededRng,
  startNextRound,
  type Seat,
} from '../engine/gameEngine'
import { chooseBotMove } from '../engine/bot'
import {
  canPlayCard,
  isSpecial,
  SHAPE_NAMES,
  SUITS,
  type Card,
  type GameAction,
  type GameEvent,
  type GameState,
  type Suit,
} from '../types/game'
import { ShapeIcon } from '../components/cards/shapes'
import './lab10.css'

const ME = 'me'

const SEATS: Seat[] = [
  { id: ME, name: 'You', avatar: 'lion', isBot: false },
  { id: 'bot-1', name: 'Kola', avatar: 'fox', isBot: true, botLevel: 'normal' },
  { id: 'bot-2', name: 'Ada', avatar: 'owl', isBot: true, botLevel: 'normal' },
  { id: 'bot-3', name: 'Tunde', avatar: 'turtle', isBot: true, botLevel: 'normal' },
]

const SETTINGS = { handSize: 7, targetScore: 100, pickDefence: 'stack' as const, turnSeconds: 0 }

const CAPTIONS: Record<number, string> = {
  1: 'HOLD ON',
  2: 'PICK 2',
  5: 'PICK 3',
  8: 'SUSPEND',
  14: 'MARKET',
}

const SHAPE_ORDER: Suit[] = SUITS

/**
 * Whot Lab 10 (#/lab10) — two-thumb zones. The left thumb owns a momentum
 * card strip; the right thumb owns a throw pad. Park with a tap, release
 * with an upward flick. Runs the engine + bots offline, touches nothing else.
 */
export default function Lab10() {
  const [tick, setTick] = useState(0)
  const stateRef = useRef<GameState>(
    createMatch(SEATS, SETTINGS, seededRng(Math.floor(Math.random() * 2 ** 31))),
  )
  const [batch, setBatch] = useState<{ turnId: number; events: GameEvent[] } | null>(null)
  const [lines, setLines] = useState<EventLine[]>([])
  const [soundOn, setSoundOn] = useState(true)
  const [exitAsk, setExitAsk] = useState(false)
  const [parkedId, setParkedId] = useState<string | null>(null)
  const [requested, setRequested] = useState<Suit | null>(null)
  const [lift, setLift] = useState(0)
  const [nudge, setNudge] = useState<'park' | 'shape' | null>(null)
  const nudgeTimer = useRef<number | null>(null)

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

  const nameOf = useCallback(
    (id: string) => stateRef.current.players.find((p) => p.id === id)?.name ?? 'Someone',
    [],
  )

  const showNudge = useCallback((kind: 'park' | 'shape') => {
    setNudge(kind)
    if (nudgeTimer.current) window.clearTimeout(nudgeTimer.current)
    nudgeTimer.current = window.setTimeout(() => setNudge(null), 1100)
  }, [])

  // Bots take their turn a beat after being dealt it, with a market fallback.
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
        render()
        return
      }
      stateRef.current = state
      setBatch({ turnId: state.turnId, events })
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
      const meNow = fresh.players.find((p) => p.id === ME)
      if (fresh.phase !== 'playing' || !meNow || !isCatchable(meNow)) return
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
          playSound(event.result.winnerId === ME ? 'win' : 'lose')
          break
        case 'matchOver':
          if (event.winnerId === ME) playSound('win')
          break
      }
    }
  }, [batch, nameOf])

  const me = s.players.find((p) => p.id === ME)
  const turnPlayer = s.phase === 'playing' ? currentPlayer(s) : null
  const myTurn = s.phase === 'playing' && turnPlayer?.id === ME
  const hand = useMemo(() => (me ? sortHand(me.hand, 'shape') : []), [tick]) // eslint-disable-line react-hooks/exhaustive-deps
  const ctx = useMemo(() => playContext(s), [tick]) // eslint-disable-line react-hooks/exhaustive-deps
  const legalIds = useMemo(() => {
    if (!myTurn || !me) return new Set<string>()
    return new Set(me.hand.filter((c) => canPlayCard(c, ctx)).map((c) => c.id))
  }, [myTurn, me, ctx, tick]) // eslint-disable-line react-hooks/exhaustive-deps

  const parked = parkedId ? (hand.find((c) => c.id === parkedId) ?? null) : null
  const parkedLegal = !!parked && legalIds.has(parked.id)
  const pagerOpen = !!parked && parked.shape === 'whot'

  // Drop the park as soon as its card leaves the hand.
  useEffect(() => {
    if (parkedId && !hand.some((c) => c.id === parkedId)) {
      setParkedId(null)
      setRequested(null)
    }
  }, [hand, parkedId])

  const pendingPickMine = s.pendingPick && myTurn && legalIds.size === 0
  const canCallLastCard = !!me && s.phase === 'playing' && !me.announcedLastCard && me.hand.length > 0 && me.hand.length <= 2
  const topCard = s.pile[s.pile.length - 1] ?? null
  const opponents = s.players.filter((p) => p.id !== ME)

  const park = (card: Card) => {
    if (!myTurn) return
    if (parkedId !== card.id) setRequested(null)
    setParkedId(card.id)
    playSound('tap')
    vibrate(12)
  }

  const draw = () => {
    if (!myTurn) return
    dispatch(ME, [{ type: 'draw' }])
  }

  const throwPark = () => {
    if (!myTurn) {
      playSound('error')
      return
    }
    if (!parked) {
      showNudge('park')
      playSound('error')
      return
    }
    if (parked.shape === 'whot' && !requested) {
      showNudge('shape')
      playSound('error')
      vibrate(40)
      return
    }
    dispatch(ME, [
      { type: 'play', cardId: parked.id, requestedShape: parked.shape === 'whot' ? requested ?? undefined : undefined },
    ])
    setRequested(null)
  }

  // Right thumb: flick up on the pad releases the parked card.
  const padGesture = useRef<{ y: number; t: number } | null>(null)
  const onPadDown = (e: React.PointerEvent<HTMLElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    padGesture.current = { y: e.clientY, t: performance.now() }
  }
  const onPadMove = (e: React.PointerEvent<HTMLElement>) => {
    if (!padGesture.current) return
    const dy = e.clientY - padGesture.current.y
    setLift(dy < 0 ? Math.min(18, -dy / 4) : 0)
  }
  const onPadUp = (e: React.PointerEvent<HTMLElement>) => {
    const g = padGesture.current
    padGesture.current = null
    setLift(0)
    if (!g) return
    const dy = e.clientY - g.y
    const dt = performance.now() - g.t
    if (dy < -36 && dt < 900) {
      throwPark()
    } else if (Math.abs(dy) < 14) {
      // A plain tap: take a pending pick if one waits, else nudge.
      if (pendingPickMine) draw()
      else throwPark()
    }
  }

  // Left thumb: flick down on the strip sends a card to market.
  const stripGesture = useRef<{ x: number; y: number; t: number } | null>(null)
  const onStripDown = (e: React.PointerEvent<HTMLElement>) => {
    stripGesture.current = { x: e.clientX, y: e.clientY, t: performance.now() }
  }
  const onStripUp = (e: React.PointerEvent<HTMLElement>) => {
    const g = stripGesture.current
    stripGesture.current = null
    if (!g) return
    const dy = e.clientY - g.y
    const dx = Math.abs(e.clientX - g.x)
    const dt = performance.now() - g.t
    if (dy > 48 && dx < 90 && dt < 700) {
      if (myTurn) draw()
      else playSound('error')
    }
  }

  // A tap (not a flick) on a strip card parks it.
  const cardTap = useRef<{ id: string; x: number; y: number } | null>(null)
  const onCardDown = (card: Card) => (e: React.PointerEvent<HTMLElement>) => {
    cardTap.current = { id: card.id, x: e.clientX, y: e.clientY }
  }
  const onCardUp = (card: Card) => (e: React.PointerEvent<HTMLElement>) => {
    const g = cardTap.current
    cardTap.current = null
    if (!g || g.id !== card.id) return
    if (Math.abs(e.clientY - g.y) < 14 && Math.abs(e.clientX - g.x) < 10) park(card)
  }

  const callLastCard = () => {
    dispatch(ME, [{ type: 'lastCard' }])
    setParkedId(null)
    setRequested(null)
  }

  const nextRound = () => {
    const { state, events } = startNextRound(stateRef.current)
    stateRef.current = state
    setParkedId(null)
    setRequested(null)
    setBatch({ turnId: state.turnId, events })
    render()
  }
  const restart = () => {
    stateRef.current = createMatch(SEATS, SETTINGS, seededRng(Math.floor(Math.random() * 2 ** 31)))
    setParkedId(null)
    setRequested(null)
    setBatch(null)
    setLines([])
    render()
  }

  const latest = lines[lines.length - 1]
  const zoneHint = parked ? (parkedLegal ? 'ok' : 'bad') : 'idle'

  return (
    <div className="lab10-root">
      <header className="lab10-top">
        <div className="lab10-wordmark">
          <span className="lab10-roundel">W10</span>
          <div>
            <strong>TWO-THUMB ZONES</strong>
            <small>park · flick · throw — lab 10</small>
          </div>
        </div>
        <button
          type="button"
          className={`lab10-chip small${soundOn ? ' on' : ''}`}
          onClick={() => {
            setSoundOn(!soundOn)
            setSoundEnabled(!soundOn)
          }}
        >
          {soundOn ? 'SND ON' : 'SND OFF'}
        </button>
        <button type="button" className="lab10-chip small danger" onClick={() => setExitAsk(true)}>
          Exit lab10
        </button>
      </header>

      <div className="lab10-rail" role="list">
        {opponents.map((p) => {
          const avatar = getAvatar(p.avatar)
          const active = turnPlayer?.id === p.id
          return (
            <div key={p.id} className={`lab10-seat${active ? ' active' : ''}`} role="listitem">
              <span className="lab10-seat-face">{avatar.emoji}</span>
              <span className="lab10-seat-name">{p.name}</span>
              <span className="lab10-seat-count">{p.hand.length}</span>
              {p.announcedLastCard && <span className="lab10-stamp">LAST</span>}
              {s.phase === 'playing' && isCatchable(p) && (
                <button type="button" className="lab10-stamp catch" onClick={() => dispatch(ME, [{ type: 'catch', targetId: p.id }])}>
                  CATCH
                </button>
              )}
            </div>
          )
        })}
      </div>

      <div className="lab10-status">
        <span className={`lab10-status-pill${myTurn ? ' mine' : ''}`}>
          {s.phase !== 'playing'
            ? 'SERVICE CHANGE — ROUND SETTLED'
            : myTurn
              ? pendingPickMine
                ? `TAKE ${s.pendingPick?.amount} — no defence in hand`
                : me?.announcedLastCard
                  ? 'LAST CARD CALLED — THROW IT'
                  : 'YOU ARE UP — PARK THEN FLICK'
              : `${turnPlayer?.name.toUpperCase()} IS DRIVING`}
        </span>
        {latest && <span className={`lab10-ticker ${latest.tone}`}>» {latest.text}</span>}
      </div>

      <section className="lab10-zones">
        <div className="lab10-zoneA" onPointerDown={onStripDown} onPointerUp={onStripUp} onPointerCancel={() => (stripGesture.current = null)}>
          <div className={`lab10-zoneTag ${zoneHint}`}>
            <i className="lab10-zoneKey">A</i> CARD STRIP
            <small>{parked ? (parkedLegal ? 'PARKED — LEGAL' : 'PARKED — NOT LEGAL') : 'tap to park · flick ↓ = market'}</small>
          </div>
          <div className={`lab10-strip${myTurn ? ' live' : ''}`}>
            {hand.map((card) => (
              <button
                key={card.id}
                type="button"
                className={`lab10-cardBtn${parkedId === card.id ? ' parked' : ''}${legalIds.has(card.id) ? ' legal' : ''}`}
                onPointerDown={onCardDown(card)}
                onPointerUp={onCardUp(card)}
                onPointerCancel={() => (cardTap.current = null)}
                aria-label={`${SHAPE_NAMES[card.shape]} ${card.number}`}
              >
                <TransitCard card={card} />
              </button>
            ))}
            {hand.length === 0 && <span className="lab10-empty">hand cleared</span>}
          </div>
          <div className="lab10-stripMeta">
            {hand.length} in hand · round {s.round} · market {s.market.length}
            {s.requestedShape && (
              <span className="lab10-req">
                named: <ShapeIcon shape={s.requestedShape} size={12} /> {SHAPE_NAMES[s.requestedShape]}
              </span>
            )}
          </div>
        </div>

        <div className="lab10-zoneB">
          <div className={`lab10-zoneTag ${zoneHint}`}>
            <i className="lab10-zoneKey">B</i> THROW PAD
            <small>{pagerOpen ? 'NAME A SHAPE BELOW' : parked ? 'FLICK ↑ TO THROW' : 'PARK A CARD FIRST'}</small>
          </div>
          <div
            className={`lab10-throw ${parked ? (parkedLegal ? ' ok' : ' bad') : ''}${nudge === 'park' ? ' nudge' : ''}`}
            style={{ ['--lift' as string]: `${-lift}px` }}
            onPointerDown={onPadDown}
            onPointerMove={onPadMove}
            onPointerUp={onPadUp}
            onPointerCancel={() => {
              padGesture.current = null
              setLift(0)
            }}
            role="button"
            aria-label="Throw target"
          >
            <div className="lab10-throw-back" aria-hidden>
              {topCard && <TransitCard card={topCard} small />}
              {!topCard && <span className="lab10-throw-empty">OPEN</span>}
            </div>
            {parked && (
              <motion.div className="lab10-throw-card" key={parked.id} initial={{ scale: 0.5, y: 70, opacity: 0.6 }} animate={{ scale: 1, y: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 420, damping: 24 }}>
                <TransitCard card={parked} />
              </motion.div>
            )}
            <span className="lab10-throw-label">{parked ? (lift > 0 ? 'RELEASE!' : 'FLICK ↑') : 'THROW'}</span>
          </div>

          <AnimatePresence>
            {pagerOpen && (
              <motion.div className="lab10-pager" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 14 }} role="radiogroup" aria-label="Name a shape">
                {SHAPE_ORDER.map((shape) => (
                  <button
                    key={shape}
                    type="button"
                    role="radio"
                    aria-checked={requested === shape}
                    className={`lab10-pagerBtn ${shape}${requested === shape ? ' on' : ''}${nudge === 'shape' ? ' nudge' : ''}`}
                    onClick={() => {
                      setRequested(shape)
                      playSound('tap')
                      vibrate(12)
                    }}
                  >
                    <ShapeIcon shape={shape} size={20} />
                    <span>{SHAPE_NAMES[shape]}</span>
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          <div className="lab10-padRow">
            <button type="button" className={`lab10-chip${pendingPickMine ? ' urgent' : ''}`} onClick={draw} disabled={!myTurn}>
              MARKET ↓ {s.market.length}
            </button>
            {canCallLastCard && (
              <button type="button" className="lab10-chip lime" onClick={callLastCard}>
                CALL LAST CARD
              </button>
            )}
            {me?.announcedLastCard && <span className="lab10-chip done">CALLED</span>}
          </div>
        </div>
      </section>

      <AnimatePresence>
        {s.phase === 'roundOver' && s.lastRound && (
          <motion.div className="lab10-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="lab10-panel">
              <span className="lab10-panel-bar" />
              <h2>{s.lastRound.winnerId === ME ? 'You check up' : `${nameOf(s.lastRound.winnerId)} checks up`}</h2>
              <p className="lab10-sub">round {s.lastRound.round} · winner takes the pile</p>
              <div className="lab10-points">
                {s.lastRound.hands.map((row) => {
                  const player = s.players.find((p) => p.id === row.playerId)
                  return (
                    <div key={row.playerId} className={`lab10-points-row${row.playerId === s.lastRound?.winnerId ? ' winner' : ''}`}>
                      <span>
                        {getAvatar(player?.avatar ?? 'robot').emoji} {player?.name ?? '—'}
                      </span>
                      <span className="pts">
                        {row.points} pts{player?.eliminated ? ' · out' : ''}
                      </span>
                    </div>
                  )
                })}
              </div>
              <div className="lab10-panel-btns">
                <button type="button" className="lab10-btn" onClick={nextRound}>
                  Next round
                </button>
                <button type="button" className="lab10-btn ghost" onClick={restart}>
                  New match
                </button>
              </div>
            </div>
          </motion.div>
        )}
        {s.phase === 'matchOver' && s.matchWinnerId && (
          <motion.div className="lab10-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="lab10-panel">
              <span className="lab10-panel-bar" />
              <h2>{s.matchWinnerId === ME ? 'You win the match' : `${nameOf(s.matchWinnerId)} wins the match`}</h2>
              <p className="lab10-sub">end of the line — that is the whole match</p>
              <div className="lab10-panel-btns">
                <button type="button" className="lab10-btn" onClick={restart}>
                  New match
                </button>
              </div>
            </div>
          </motion.div>
        )}
        {exitAsk && (
          <motion.div className="lab10-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="lab10-panel">
              <span className="lab10-panel-bar" />
              <h2>Leave lab10?</h2>
              <p className="lab10-sub">the two-thumb experiment will not be saved</p>
              <div className="lab10-panel-btns">
                <button type="button" className="lab10-btn" onClick={() => (window.location.hash = '')}>
                  Leave
                </button>
                <button type="button" className="lab10-btn ghost" onClick={() => setExitAsk(false)}>
                  Keep playing
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/** Transit-ticket card rendering: navy stock, a line colour per shape. */
function TransitCard({ card, small }: { card: Card; small?: boolean }) {
  if (card.shape === 'whot') {
    return (
      <span className={`lab10-card whot${small ? ' small' : ''}`}>
        <span className="lab10-card-whotmark">WHOT</span>
        <span className="lab10-card-num">20</span>
      </span>
    )
  }
  return (
    <span className={`lab10-card${small ? ' small' : ''}`} data-shape={card.shape}>
      <span className="lab10-card-num">{card.number}</span>
      <ShapeIcon shape={card.shape} size={small ? 14 : 20} className="lab10-card-shape" />
      {!small && isSpecial(card) && <span className="lab10-card-cap">{CAPTIONS[card.number]}</span>}
    </span>
  )
}