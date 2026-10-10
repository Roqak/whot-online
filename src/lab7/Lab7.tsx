/**
 * Whot Lab 7 — SHAPE RACK (#/lab7)
 * A workshop pegboard: the hand lives in five vertical suit racks like a
 * rummy rack, plus a whot sleeve. Long-press (or drag) a card to lift it out
 * and carry it — racks compress and reflow while you hold it. Drop on the
 * pile to play, on another rack to re-sort your hand (pure local reorder),
 * on the market to draw. While carrying a whot, the pile sprouts five labeled
 * target rings for naming the shape. Runs the engine offline with three bots
 * and touches nothing in the online game.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import confetti from 'canvas-confetti'
import { describeEvent, type EventLine } from '../lib/events'
import { playSound, setSoundEnabled, vibrate, type SoundName } from '../lib/sound'
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
  type Shape,
  type Suit,
} from '../types/game'
import { WhotCard } from '../components/cards/WhotCard'
import { ShapeIcon } from '../components/cards/shapes'
import './lab7.css'

const ME = 'me'
const HOLD_MS = 220
type RackKey = Shape
const RACK_KEYS: RackKey[] = [...SUITS, 'whot']
const emptyOrder = (): Record<RackKey, string[]> => ({ circle: [], triangle: [], cross: [], square: [], star: [], whot: [] })

const SOUND_BY_EVENT: Record<string, SoundName> = {
  pick: 'pick',
  drew: 'draw',
  lastCard: 'lastCard',
  caught: 'caught',
  holdOn: 'special',
  suspended: 'special',
  shapeRequested: 'special',
  generalMarket: 'special',
  reshuffled: 'shuffle',
  roundStarted: 'shuffle',
}

const SEATS: Seat[] = [
  { id: ME, name: 'You', avatar: 'lion', isBot: false },
  { id: 'bot-1', name: 'Tunde', avatar: 'elephant', isBot: true, botLevel: 'normal' },
  { id: 'bot-2', name: 'Amara', avatar: 'fox', isBot: true, botLevel: 'hard' },
  { id: 'bot-3', name: 'Kelechi', avatar: 'turtle', isBot: true, botLevel: 'easy' },
]

const SETTINGS = { handSize: 7, targetScore: 100, pickDefence: 'stack' as const, turnSeconds: 0 }

function newMatch(): GameState {
  return createMatch(SEATS, SETTINGS, seededRng(Math.floor(Math.random() * 2 ** 31)))
}

export default function Lab7() {
  const [tick, setTick] = useState(0)
  const stateRef = useRef<GameState>(newMatch())
  const [batch, setBatch] = useState<{ turnId: number; events: GameEvent[] } | null>(null)
  const [lines, setLines] = useState<EventLine[]>([])
  const [soundOn, setSoundOn] = useState(true)
  const [exitAsk, setExitAsk] = useState(false)
  const [carry, setCarry] = useState<{ cardId: string; x: number; y: number } | null>(null)
  const [hoverZone, setHoverZone] = useState<string | null>(null)
  const [naming, setNaming] = useState<{ cardId: string; x: number; y: number } | null>(null)
  const [reject, setReject] = useState<string | null>(null)
  const [order, setOrder] = useState<Record<RackKey, string[]>>(emptyOrder)

  const s = stateRef.current
  const render = useCallback(() => setTick((n) => n + 1), [])

  const commit = useCallback(
    (next: GameState, events: GameEvent[]) => {
      stateRef.current = next
      setBatch({ turnId: next.turnId, events })
      render()
    },
    [render],
  )

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
      commit(state, events)
    },
    [commit],
  )

  const nameOf = useCallback((id: string) => stateRef.current.players.find((p) => p.id === id)?.name ?? 'Someone', [])

  // Hand racks: prune ids that left the hand, append fresh cards in hand order.
  useEffect(() => {
    const hand = stateRef.current.players.find((p) => p.id === ME)?.hand ?? []
    const inHand = new Set(hand.map((c) => c.id))
    setOrder((prev) => {
      const next = emptyOrder()
      const seen = new Set<string>()
      for (const key of RACK_KEYS) for (const id of prev[key]) if (inHand.has(id)) { next[key].push(id); seen.add(id) }
      for (const card of hand) if (!seen.has(card.id)) next[card.shape].push(card.id)
      return next
    })
  }, [tick])

  const nameShape = (suit: Suit) => {
    const pending = naming
    setNaming(null)
    if (pending) dispatch(ME, [{ type: 'play', cardId: pending.cardId, requestedShape: suit }])
  }

  // Bots take their turn a beat after it is dealt, with a market fallback.
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
      // A market draw with an empty market can end the round ("tender") without
      // moving turnId — commit whenever anything applied, else take the penalty.
      if (events.length === 0) {
        const timeout = applyTimeout(state, player.id)
        if (!timeout.ok) return
        commit(timeout.state, timeout.events)
      } else {
        commit(state, events)
      }
    }, 750 + Math.random() * 1100)
    return () => clearTimeout(timer)
  }, [tick, commit])

  // A bot pounces if the human sits on one card without calling last card.
  useEffect(() => {
    const state = stateRef.current
    if (state.phase !== 'playing') return
    const mine = state.players.find((p) => p.id === ME)
    if (!mine || !isCatchable(mine)) return
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
      if (event.type === 'played') {
        playSound(isSpecial(event.card) ? 'special' : 'play')
        continue
      }
      if (event.type === 'roundOver' || event.type === 'matchOver') {
        const winner = event.type === 'roundOver' ? event.result.winnerId : event.winnerId
        if (winner === ME) {
          playSound('win')
          confetti({ particleCount: event.type === 'matchOver' ? 160 : 90, spread: 85, origin: { y: 0.65 }, disableForReducedMotion: true })
        } else if (event.type === 'roundOver') {
          playSound('lose')
        }
        continue
      }
      const sound = SOUND_BY_EVENT[event.type]
      if (sound) {
        playSound(sound)
        if (event.type === 'pick') vibrate(30)
        else if (event.type === 'lastCard') vibrate(20)
        else if (event.type === 'caught') vibrate([30, 40, 30])
        else if (sound === 'special') vibrate(15)
      }
    }
  }, [batch, nameOf])

  const me = s.players.find((p) => p.id === ME)
  const turnPlayer = s.phase === 'playing' ? currentPlayer(s) : null
  const myTurn = s.phase === 'playing' && turnPlayer?.id === ME
  const ctx = useMemo(() => playContext(s), [tick]) // eslint-disable-line react-hooks/exhaustive-deps
  const legalIds = useMemo(() => {
    if (!myTurn || !me) return new Set<string>()
    return new Set(me.hand.filter((c) => canPlayCard(c, ctx)).map((c) => c.id))
  }, [myTurn, me, ctx, tick]) // eslint-disable-line react-hooks/exhaustive-deps
  const byId = useMemo(() => new Map((me?.hand ?? []).map((c) => [c.id, c as Card])), [tick, me]) // eslint-disable-line react-hooks/exhaustive-deps
  const pendingPickMine = !!s.pendingPick && myTurn && legalIds.size === 0
  const canCallLastCard = !!me && s.phase === 'playing' && !me.announcedLastCard && me.hand.length > 0 && me.hand.length <= 2

  const topCard = s.pile[s.pile.length - 1] ?? null
  const pileBehind = s.pile.slice(-4, -1)
  const opponents = s.players.filter((p) => p.id !== ME)
  const carryCard = carry ? (byId.get(carry.cardId) ?? null) : null
  const namingCard = naming ? (byId.get(naming.cardId) ?? null) : null
  const ringsOut = !!namingCard || (carryCard?.shape === 'whot' && hoverZone === 'pile' && legalIds.has(carryCard.id))

  const rejectRef = useRef<number | null>(null)
  const refuse = useCallback((why: string) => {
    setReject(why)
    playSound('error')
    vibrate([20, 30, 20])
    if (rejectRef.current) window.clearTimeout(rejectRef.current)
    rejectRef.current = window.setTimeout(() => setReject(null), 1700)
  }, [])

  // ---- carry / drop ------------------------------------------------------
  const zoneAt = (x: number, y: number): string | null =>
    document.elementFromPoint(x, y)?.closest('[data-lab7-drop]')?.getAttribute('data-lab7-drop') ?? null

  const holdRef = useRef<{ cardId: string; x: number; y: number; lifted: boolean } | null>(null)
  const holdTimer = useRef<number | null>(null)

  const lift = (cardId: string, x: number, y: number) => {
    holdRef.current = { cardId, x, y, lifted: true }
    setCarry({ cardId, x, y })
    setHoverZone(zoneAt(x, y))
    playSound('tap')
    vibrate(10)
  }

  const dropHold = () => {
    if (holdTimer.current) {
      window.clearTimeout(holdTimer.current)
      holdTimer.current = null
    }
    holdRef.current = null
    setCarry(null)
    setHoverZone(null)
  }

  const reorder = useCallback((cardId: string, suit: Suit) => {
    setOrder((prev) => {
      const next = emptyOrder()
      for (const key of RACK_KEYS) next[key] = prev[key].filter((id) => id !== cardId)
      next[suit].push(cardId)
      return next
    })
  }, [])

  const whyIllegal = useCallback(
    (): string => {
      if (s.pendingPick) {
        return s.settings.pickDefence === 'none'
          ? `pick ${s.pendingPick.amount} first — no defence allowed`
          : `throw a ${s.pendingPick.number} to defend, or take the pick`
      }
      if (s.requestedShape) return `the shape is ${SHAPE_NAMES[s.requestedShape]} — nothing else plays`
      return topCard ? `not a ${SHAPE_NAMES[topCard.shape]}, not a ${topCard.number}` : 'the table is open'
    },
    [s.pendingPick, s.requestedShape, s.settings.pickDefence, topCard],
  )

  const resolveDrop = (cardId: string, zone: string | null, x: number, y: number) => {
    const card = byId.get(cardId)
    if (!card) return
    if (zone?.startsWith('rack:')) {
      const suit = zone.slice(5) as Suit
      if (suit !== card.shape) {
        reorder(cardId, suit)
        playSound('shuffle')
        vibrate(8)
      }
      return
    }
    if (zone === 'market') {
      if (myTurn) dispatch(ME, [{ type: 'draw' }])
      else refuse(`${turnPlayer?.name ?? 'someone else'} holds the bench — not your turn`)
      return
    }
    if (zone?.startsWith('ring:')) {
      const suit = zone.slice(5) as Suit
      if (myTurn && card.shape === 'whot' && legalIds.has(cardId)) dispatch(ME, [{ type: 'play', cardId, requestedShape: suit }])
      else refuse(!myTurn ? 'not your turn' : 'that whot cannot play right now')
      return
    }
    if (zone === 'pile') {
      if (!myTurn) return refuse('not your turn — racks are just for sorting')
      if (!legalIds.has(cardId)) return refuse(whyIllegal())
      if (card.shape === 'whot') return setNaming({ cardId, x, y })
      dispatch(ME, [{ type: 'play', cardId }])
    }
    // dropped on nothing: the card goes home
  }

  const onCardDown = (cardId: string) => (e: ReactPointerEvent<HTMLElement>) => {
    if (s.phase !== 'playing' || naming) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    holdRef.current = { cardId, x: e.clientX, y: e.clientY, lifted: false }
    holdTimer.current = window.setTimeout(() => {
      const hold = holdRef.current
      if (hold && !hold.lifted) lift(hold.cardId, hold.x, hold.y)
    }, HOLD_MS)
  }

  const onCardMove = (e: ReactPointerEvent<HTMLElement>) => {
    const hold = holdRef.current
    if (!hold) return
    if (!hold.lifted) {
      if (Math.hypot(e.clientX - hold.x, e.clientY - hold.y) > 10) lift(hold.cardId, e.clientX, e.clientY)
      return
    }
    setCarry((c) => (c ? { ...c, x: e.clientX, y: e.clientY } : c))
    setHoverZone(zoneAt(e.clientX, e.clientY))
  }

  const onCardUp = (e: ReactPointerEvent<HTMLElement>) => {
    const hold = holdRef.current
    if (!hold) return
    const zone = hold.lifted ? zoneAt(e.clientX, e.clientY) : null
    const lifted = hold.lifted
    dropHold()
    if (lifted) resolveDrop(hold.cardId, zone, e.clientX, e.clientY)
  }

  const nextRound = () => {
    const { state, events } = startNextRound(stateRef.current)
    setNaming(null)
    commit(state, events)
  }
  const restart = () => {
    stateRef.current = newMatch()
    setBatch(null)
    setLines([])
    setNaming(null)
    render()
  }

  const draw = () => dispatch(ME, [{ type: 'draw' }])
  const callLastCard = () => dispatch(ME, [{ type: 'lastCard' }])
  const catchPlayer = (targetId: string) => dispatch(ME, [{ type: 'catch', targetId }])
  const zoneClass = (zone: string | null) => (carry && hoverZone === zone ? ' targeted' : '')

  return (
    <div className={`lab7${carry ? ' carrying' : ''}`}>
      <header className="lab7-top">
        <div className="lab7-wordmark">
          <span className="lab7-punch" aria-hidden />
          Whot Lab 7 — Shape Rack
          <small>drag a card out of its rack · sort by suit · throw to the bench</small>
        </div>
        <button
          type="button" className="lab7-toggle" aria-pressed={soundOn}
          onClick={() => { setSoundOn(!soundOn); setSoundEnabled(!soundOn) }}
        >
          Sound {soundOn ? 'on' : 'off'}
        </button>
        <button type="button" className="lab7-toggle lab7-exit" onClick={() => setExitAsk(true)}>
          Exit lab7
        </button>
      </header>

      <section className="lab7-bench">
        <div className="lab7-crew">
          {opponents.map((p) => (
            <div key={p.id} className={`lab7-plate${turnPlayer?.id === p.id ? ' active' : ''}`}>
              {p.announcedLastCard && <span className="lab7-stamp">LAST CARD</span>}
              {s.phase === 'playing' && isCatchable(p) && (
                <button type="button" className="lab7-stamp lab7-catch" onClick={() => catchPlayer(p.id)}>
                  CATCH!
                </button>
              )}
              <span className="lab7-plate-init" aria-hidden>{p.name.slice(0, 1)}</span>
              <span className="lab7-plate-name">{p.name}</span>
              <span className="lab7-minis" aria-label={`${p.hand.length} cards`}>
                {Array.from({ length: Math.min(p.hand.length, 10) }).map((_, i) => <i key={i} />)}
              </span>
              {turnPlayer?.id === p.id && (
                <span className="lab7-think" aria-hidden><i /><i /><i /></span>
              )}
            </div>
          ))}
        </div>

        <div className="lab7-turnline">
          <span className={`lab7-turnchip${myTurn ? ' mine' : ''}`}>
            {s.phase !== 'playing' ? 'Bench cleared' : myTurn ? 'Your bench — carry one out' : `${turnPlayer?.name} is at the bench`}
          </span>
          {s.requestedShape && (
            <span className="lab7-called">
              <ShapeIcon shape={s.requestedShape} size={12} /> {SHAPE_NAMES[s.requestedShape]} was named
            </span>
          )}
          {s.pendingPick && (
            <span className="lab7-turnchip warn">
              pick {s.pendingPick.amount} pending
              {s.settings.pickDefence !== 'none' ? ` — a ${s.pendingPick.number} defends` : ' — no defence'}
            </span>
          )}
        </div>

        <div className="lab7-table">
          <div className={`lab7-pile${zoneClass('pile')}`} data-lab7-drop="pile">
            {ringsOut && (
              <div className="lab7-rings">
                {SUITS.map((suit) => (
                  <button
                    key={suit} type="button" className={`lab7-ring${naming ? ' armed' : ''}`}
                    data-lab7-drop={`ring:${suit}`} onClick={naming ? () => nameShape(suit) : undefined}
                    style={{ ['--lab7-suit' as string]: `var(--lab7-${suit})` }}
                  >
                    <ShapeIcon shape={suit} size={15} />
                    <span>{SHAPE_NAMES[suit]}</span>
                  </button>
                ))}
              </div>
            )}
            <div className="lab7-pileback" aria-hidden>
              {pileBehind.map((card, i) => (
                <div key={card.id} style={{ transform: `translate(${(i - 1) * 5}px, ${(i - 1) * 4}px) rotate(${(i - 1) * 4}deg)` }}>
                  <WhotCard faceDown />
                </div>
              ))}
            </div>
            <motion.div className="lab7-pilecard" key={topCard?.id ?? 'empty'}>
              {topCard ? <WhotCard card={topCard} /> : <WhotCard faceDown />}
            </motion.div>
            {namingCard && <span className="lab7-pilehint">stamp a shape on the bench</span>}
            {!namingCard && carryCard?.shape === 'whot' && hoverZone === 'pile' && (
              <span className="lab7-pilehint">a whot — drop on a ring to name the shape</span>
            )}
            {naming && (
              <button type="button" className="lab7-putback" onClick={() => setNaming(null)}>
                put it back
              </button>
            )}
          </div>

          <div className={`lab7-market${zoneClass('market')}${pendingPickMine ? ' owed' : ''}`} data-lab7-drop="market">
            <button type="button" className="lab7-marketbtn" onClick={draw} disabled={!myTurn} aria-label={`Go to market, ${s.market.length} cards left`}>
              <span className="lab7-marketcards">
                <WhotCard faceDown />
                <WhotCard faceDown />
                <WhotCard faceDown />
              </span>
              <span className="lab7-marketcount">{s.market.length}</span>
              <span className="lab7-marketlabel">MARKET</span>
            </button>
            {pendingPickMine && <span className="lab7-owednote">drop here to take the {s.pendingPick?.amount}</span>}
          </div>

          {reject && <div className="lab7-reject">{reject}</div>}

          <div className="lab7-ticker" aria-live="polite">
            {lines.slice(-3).map((line, i) => (
              <motion.span
                key={`${line.text}-${lines.length - i}`}
                className={`lab7-tick${line.tone === 'neutral' ? '' : ` ${line.tone}`}`}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 0.4 + 0.6 * (i / Math.max(1, lines.slice(-3).length - 1)) }}
              >
                {line.text}
              </motion.span>
            ))}
          </div>
        </div>
      </section>

      <section className="lab7-rackrow">
        <span className="lab7-handmeta">{me?.hand.length ?? 0} in hand · round {s.round}</span>
        {canCallLastCard && (
          <button type="button" className="lab7-chip urge" onClick={callLastCard}>
            LAST CARD — call it
          </button>
        )}
        {me?.announcedLastCard && <span className="lab7-chip good">last card called</span>}
        {carry && <span className="lab7-chip">carrying — drop on pile, market or another rack</span>}

        <div className="lab7-racks">
          {RACK_KEYS.map((key) => {
            const ids = order[key]
            const targeted = carry && hoverZone === `rack:${key}`
            return (
              <div
                key={key}
                className={`lab7-rack${targeted ? ' targeted' : ''}${key === 'whot' ? ' sleeve' : ''}`}
                data-lab7-drop={`rack:${key}`}
              >
                <div className="lab7-plate" style={{ ['--lab7-suit' as string]: `var(--lab7-${key})` }}>
                  <ShapeIcon shape={key} size={11} />
                  <span>{SHAPE_NAMES[key]}</span>
                  <i className={`lab7-dot${myTurn && ids.some((id) => legalIds.has(id)) ? ' lit' : ''}`} aria-hidden />
                  <b className="lab7-count">{ids.length}</b>
                </div>
                <div className="lab7-stack">
                  {ids.map((id, i) => {
                    const card = byId.get(id)
                    if (!card) return null
                    const lifted = carry?.cardId === id
                    const legal = legalIds.has(id)
                    return (
                      <div
                        key={id}
                        className={`lab7-card${legal ? ' legal' : ''}${lifted ? ' lifted' : ''}${myTurn && !legal ? ' muted' : ''}`}
                        style={{ zIndex: i + 1, ['--lab7-suit' as string]: `var(--lab7-${key})` }}
                        onPointerDown={onCardDown(id)} onPointerMove={onCardMove}
                        onPointerUp={onCardUp} onPointerCancel={dropHold}
                      >
                        <WhotCard card={card} muted={myTurn && !legal} />
                      </div>
                    )
                  })}
                  {ids.length === 0 && <span className="lab7-empty" aria-hidden />}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {carry && carryCard && (
        <div className="lab7-ghost" style={{ left: carry.x, top: carry.y }}>
          <WhotCard card={carryCard} />
        </div>
      )}
      {naming && namingCard && (
        <div className="lab7-ghost pinned" style={{ left: naming.x, top: naming.y }}>
          <WhotCard card={namingCard} />
        </div>
      )}

      <AnimatePresence>
        {s.phase === 'roundOver' && s.lastRound && (
          <motion.div className="lab7-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="lab7-panel">
              <h2>{s.lastRound.winnerId === ME ? 'You check up' : `${nameOf(s.lastRound.winnerId)} checks up`}</h2>
              <p className="sub">round {s.lastRound.round} · winner racks the pile</p>
              <div className="lab7-points">
                {s.lastRound.hands.map((row) => {
                  const player = s.players.find((p) => p.id === row.playerId)
                  return (
                    <div key={row.playerId} className={`lab7-points-row${row.playerId === s.lastRound?.winnerId ? ' winner' : ''}`}>
                      <span>{player?.name ?? row.playerId}</span>
                      <span className="pts">{row.points} pts{player?.eliminated ? ' · out' : ''}</span>
                    </div>
                  )
                })}
              </div>
              <button type="button" className="lab7-btn" onClick={nextRound}>Next round</button>{' '}
              <button type="button" className="lab7-btn ghost" onClick={restart}>New match</button>
            </div>
          </motion.div>
        )}
        {s.phase === 'matchOver' && s.matchWinnerId && (
          <motion.div className="lab7-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="lab7-panel">
              <h2>{s.matchWinnerId === ME ? 'You win the match' : `${nameOf(s.matchWinnerId)} wins the match`}</h2>
              <p className="sub">the workshop is closed</p>
              <button type="button" className="lab7-btn" onClick={restart}>New match</button>
            </div>
          </motion.div>
        )}
        {exitAsk && (
          <motion.div className="lab7-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="lab7-panel">
              <h2>Leave the workshop?</h2>
              <p className="sub">the racks will be emptied</p>
              <button type="button" className="lab7-btn" onClick={() => (window.location.hash = '')}>Leave</button>{' '}
              <button type="button" className="lab7-btn ghost" onClick={() => setExitAsk(false)}>Keep sorting</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}