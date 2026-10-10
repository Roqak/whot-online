import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { describeEvent, type EventLine } from '../lib/events'
import { sortHand } from '../lib/hand'
import { playSound, setSoundEnabled, vibrate, type SoundName } from '../lib/sound'
import {
  applyAction, applyTimeout, createMatch, currentPlayer, isCatchable, playContext, seededRng,
  startNextRound, type Seat,
} from '../engine/gameEngine'
import { chooseBotMove } from '../engine/bot'
import {
  canPlayCard, isSpecial, SHAPE_NAMES, SPECIAL_NAMES, SUITS,
  type Card, type GameAction, type GameEvent, type GameState, type Suit,
} from '../types/game'
import { ShapeGlyph } from '../components/cards/shapes'
import './lab9.css'

const ME = 'me'

const SEATS: Seat[] = [
  { id: ME, name: 'P1', avatar: 'lion', isBot: false },
  { id: 'bot-1', name: 'ADA', avatar: 'elephant', isBot: true, botLevel: 'normal' },
  { id: 'bot-2', name: 'CHIDI', avatar: 'fox', isBot: true, botLevel: 'hard' },
  { id: 'bot-3', name: 'NGOZI', avatar: 'turtle', isBot: true, botLevel: 'easy' },
]

const SETTINGS = { handSize: 7, targetScore: 100, pickDefence: 'stack' as const, turnSeconds: 0 }
const STEP = 46 // conveyor card spacing

const SOUND_FOR: Partial<Record<GameEvent['type'], SoundName>> = {
  pick: 'pick', drew: 'draw', lastCard: 'lastCard', caught: 'caught',
  holdOn: 'special', suspended: 'special', shapeRequested: 'special', generalMarket: 'special',
  reshuffled: 'shuffle', roundStarted: 'shuffle',
}

function newMatch(): GameState {
  return createMatch(SEATS, SETTINGS, seededRng(Math.floor(Math.random() * 2 ** 31)))
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function PixCard({ card }: { card: Card }) {
  return (
    <div className={`lab9-card${card.shape === 'whot' ? ' whot' : ''}`}>
      <span className="lab9-card-num">{card.shape === 'whot' ? '20' : card.number}</span>
      <svg viewBox="0 0 100 100" className="lab9-card-glyph" aria-hidden><ShapeGlyph shape={card.shape} /></svg>
      <span className="lab9-card-tag">{card.shape === 'whot' ? 'WHOT' : SPECIAL_NAMES[card.number] ?? ''}</span>
    </div>
  )
}

/**
 * Lab 9 (#/lab9) — ARCADE D-PAD. A CRT cabinet: the hand rides a conveyor under a
 * fixed cursor driven by a d-pad (also arrow keys / WASD). A throws, B draws,
 * START calls last card, UP opens the whot shape frames. Same engine and bots as
 * the online table, offline, touching nothing outside this folder.
 */
export default function Lab9() {
  const [tick, setTick] = useState(0)
  const stateRef = useRef<GameState>(newMatch())
  const [batch, setBatch] = useState<{ turnId: number; events: GameEvent[] } | null>(null)
  const [lines, setLines] = useState<EventLine[]>([])
  const [cursor, setCursor] = useState(0)
  const [shapeSel, setShapeSel] = useState<number | null>(null)
  const [denied, setDenied] = useState<{ reason: string; key: number } | null>(null)
  const [exitAsk, setExitAsk] = useState(false)
  const [soundOn, setSoundOn] = useState(true)

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

  const nameOf = useCallback((id: string) => stateRef.current.players.find((p) => p.id === id)?.name ?? 'CPU', [])

  // Bots play a beat after they are dealt the turn; if their move went nowhere,
  // the engine's timeout path sends them to market.
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

  // A bot pounces if the human forgets to call last card.
  useEffect(() => {
    const state = stateRef.current
    if (state.phase !== 'playing') return
    const me = state.players.find((p) => p.id === ME)
    if (!me || !isCatchable(me)) return
    const timer = window.setTimeout(() => {
      const fresh = stateRef.current
      const mine = fresh.players.find((p) => p.id === ME)
      if (fresh.phase !== 'playing' || !mine || !isCatchable(mine)) return
      dispatch('bot-2', [{ type: 'catch', targetId: ME }])
    }, 2600 + Math.random() * 2600)
    return () => window.clearTimeout(timer)
  }, [tick, dispatch])

  // Sounds + combo ticker for whatever just happened.
  useEffect(() => {
    if (!batch) return
    for (const event of batch.events) {
      const line = describeEvent(event, { nameOf, myId: ME, verbose: true })
      if (line) setLines((q) => [...q, line].slice(-4))
      if (event.type === 'played') playSound(isSpecial(event.card) ? 'special' : 'play')
      else if (event.type === 'roundOver') playSound(event.result.winnerId === ME ? 'win' : 'lose')
      else if (event.type === 'matchOver') playSound(event.winnerId === ME ? 'win' : 'lose')
      else {
        const sound = SOUND_FOR[event.type]
        if (sound) playSound(sound)
      }
      if (event.type === 'pick') vibrate(30)
      else if (event.type === 'lastCard') vibrate(20)
      else if (event.type === 'caught') vibrate([30, 40, 30])
    }
  }, [batch, nameOf])

  // DENIED stamp fades after its moment.
  useEffect(() => {
    if (!denied) return
    const timer = window.setTimeout(() => setDenied(null), 1400)
    return () => window.clearTimeout(timer)
  }, [denied])

  const me = s.players.find((p) => p.id === ME)
  const turnPlayer = s.phase === 'playing' ? currentPlayer(s) : null
  const myTurn = s.phase === 'playing' && turnPlayer?.id === ME
  const ctx = useMemo(() => playContext(s), [tick]) // eslint-disable-line react-hooks/exhaustive-deps
  const hand = useMemo(() => (me ? sortHand(me.hand, 'shape') : []), [tick]) // eslint-disable-line react-hooks/exhaustive-deps
  const legalIds = useMemo(() => {
    if (!myTurn || !me) return new Set<string>()
    return new Set(me.hand.filter((c) => canPlayCard(c, ctx)).map((c) => c.id))
  }, [myTurn, me, ctx, tick]) // eslint-disable-line react-hooks/exhaustive-deps

  const topCard = s.pile[s.pile.length - 1] ?? null
  // Keep the cursor on a real card as the belt shifts underneath it.
  const cur = hand.length === 0 ? 0 : Math.min(cursor, hand.length - 1)
  const selected = hand[cur] ?? null
  const selectedLegal = !!selected && legalIds.has(selected.id)

  // The shape frames only exist while a WHOT still sits under the cursor.
  useEffect(() => {
    if (shapeSel === null) return
    const sel = hand[cur] ?? null
    if (s.phase !== 'playing' || !sel || sel.shape !== 'whot') setShapeSel(null)
  }, [tick, shapeSel, hand.length, cur]) // eslint-disable-line react-hooks/exhaustive-deps

  const deny = useCallback((button: string, reason: string) => {
    setDenied({ reason: `${button} — ${reason}`, key: Date.now() })
    setLines((q) => [...q, { text: `DENIED: ${button} — ${reason}`, tone: 'bad' as const }].slice(-4))
    playSound('error')
    vibrate(60)
  }, [])

  const explain = useCallback(
    (): string => {
      if (s.pendingPick) {
        return s.settings.pickDefence === 'none'
          ? `pick ${s.pendingPick.amount} — no defence allowed`
          : `pick ${s.pendingPick.amount} — throw a ${s.pendingPick.number} or press B`
      }
      if (s.requestedShape) return `shape is ${SHAPE_NAMES[s.requestedShape]} — nothing else plays`
      if (topCard) return `not a ${SHAPE_NAMES[topCard.shape]}, not a ${topCard.number}`
      return 'no move'
    },
    [s.pendingPick, s.requestedShape, s.settings.pickDefence, topCard],
  )

  const play = useCallback(
    (cardId: string, shape?: Suit) => dispatch(ME, [{ type: 'play', cardId, requestedShape: shape }]),
    [dispatch],
  )

  const move = useCallback(
    (dir: number) => {
      if (s.phase !== 'playing') return
      if (shapeSel !== null) setShapeSel((i) => ((i ?? 0) + dir + SUITS.length) % SUITS.length)
      else if (hand.length > 0) setCursor((c) => (c + dir + hand.length) % hand.length)
      else return
      playSound('tap')
    },
    [hand.length, s.phase, shapeSel],
  )

  const denyTurn = useCallback(
    (button: string) => deny(button, turnPlayer ? `${turnPlayer.name} is playing` : 'table is settling'),
    [deny, turnPlayer],
  )

  const pressA = useCallback(() => {
    if (s.phase !== 'playing' || exitAsk) return
    if (shapeSel !== null) {
      const card = selected
      setShapeSel(null)
      if (card && legalIds.has(card.id)) play(card.id, SUITS[shapeSel])
      return
    }
    if (!myTurn) return denyTurn('A')
    if (!selected) return deny('A', 'hand is empty — press B to draw')
    if (!legalIds.has(selected.id)) return deny('A', explain())
    if (selected.shape === 'whot') {
      setShapeSel(0)
      playSound('tap')
      return
    }
    play(selected.id)
  }, [deny, denyTurn, explain, exitAsk, legalIds, myTurn, play, s.phase, selected, shapeSel])

  const pressB = useCallback(() => {
    if (s.phase !== 'playing' || exitAsk) return
    if (shapeSel !== null) {
      setShapeSel(null)
      playSound('tap')
      return
    }
    if (!myTurn) return denyTurn('B')
    dispatch(ME, [{ type: 'draw' }])
  }, [denyTurn, dispatch, exitAsk, myTurn, s.phase, shapeSel])

  const pressUp = useCallback(() => {
    if (s.phase !== 'playing' || exitAsk || !myTurn || !selected) return
    if (selected.shape !== 'whot') return deny('UP', 'shape frames open only for a WHOT')
    setShapeSel((i) => (i === null ? 0 : i))
    playSound('tap')
  }, [deny, exitAsk, myTurn, s.phase, selected])

  const pressStart = useCallback(() => {
    if (s.phase !== 'playing' || exitAsk || !me) return
    if (me.announcedLastCard) return deny('START', 'last card already called')
    if (me.hand.length === 0 || me.hand.length > 2) return deny('START', 'callable at two cards or fewer')
    dispatch(ME, [{ type: 'lastCard' }])
  }, [deny, dispatch, exitAsk, me, s.phase])

  // Keyboard: arrows + WASD for the d-pad, Z/Space = A, X = B, Enter = START.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return
      const k = e.key.toLowerCase()
      if (k === 'arrowleft' || k === 'a') { e.preventDefault(); move(-1) }
      else if (k === 'arrowright' || k === 'd') { e.preventDefault(); move(1) }
      else if (k === 'arrowup' || k === 'w') { e.preventDefault(); pressUp() }
      else if (k === 'arrowdown' || k === 's') { e.preventDefault(); if (shapeSel !== null) setShapeSel(null) }
      else if (k === ' ' || k === 'z') { e.preventDefault(); pressA() }
      else if (k === 'x') { e.preventDefault(); pressB() }
      else if (k === 'enter') { e.preventDefault(); pressStart() }
      else if (k === 'escape') setExitAsk((v) => !v)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [move, pressA, pressB, pressStart, pressUp, shapeSel])

  const nextRound = () => {
    const { state, events } = startNextRound(stateRef.current)
    stateRef.current = state
    setBatch({ turnId: state.turnId, events })
    setShapeSel(null)
    render()
  }
  const restart = () => {
    stateRef.current = newMatch()
    setBatch(null)
    setLines([])
    setCursor(0)
    setShapeSel(null)
    render()
  }

  const pendingPickMine = s.pendingPick && myTurn && legalIds.size === 0
  const opponents = s.players.filter((p) => p.id !== ME)

  return (
    <div className="lab9">
      <div className="lab9-cab">
        <div className="lab9-marquee">
          WHOT★CABINET
          <small>LAB9 · D-PAD EXPERIMENT · INSERT COIN (FREE PLAY)</small>
        </div>

        <div className="lab9-screen">
          <div className="lab9-hud">
            <span>ROUND <b>{pad2(s.round)}</b></span>
            <span>MARKET <b className="lab9-credit">{pad2(s.market.length)}</b></span>
            <span>CREDITS <b className="lab9-credit">∞</b></span>
            <span className="lab9-hud-spacer" />
            <button type="button" className="lab9-mini-btn" onClick={() => { setSoundOn(!soundOn); setSoundEnabled(!soundOn) }}>
              SOUND {soundOn ? 'ON' : 'OFF'}
            </button>
            <button type="button" className="lab9-mini-btn exit" onClick={() => setExitAsk(true)}>EXIT LAB9</button>
          </div>

          <div className="lab9-scores">
            <span className={`lab9-score-row${myTurn ? ' active' : ''}`}>
              1UP YOU
              <span className="lab9-pips">{Array.from({ length: Math.min(me?.hand.length ?? 0, 10) }).map((_, i) => <i key={i} />)}</span>
            </span>
            {opponents.map((p) => (
              <span key={p.id} className={`lab9-score-row${!myTurn && s.phase === 'playing' && turnPlayer?.id === p.id ? ' active' : ''}`}>
                {p.name}
                <span className="lab9-pips">{Array.from({ length: Math.min(p.hand.length, 10) }).map((_, i) => <i key={i} />)}</span>
                {p.announcedLastCard && <span className="lab9-stamp-last">LAST CARD</span>}
                {s.phase === 'playing' && isCatchable(p) && (
                  <button type="button" className="lab9-catch" onClick={() => dispatch(ME, [{ type: 'catch', targetId: p.id }])}>CATCH</button>
                )}
              </span>
            ))}
          </div>

          <div className={`lab9-banner${myTurn ? ' mine' : ''}`}>
            {s.phase !== 'playing' ? 'GAME OVER — PRESS A BUTTON'
              : pendingPickMine ? <span className="lab9-warn">PICK {s.pendingPick?.amount} — B TO TAKE IT</span>
              : myTurn ? 'YOUR MOVE'
              : `${turnPlayer?.name} PLAYING…`}
          </div>

          <div className="lab9-table">
            <div className="lab9-slot">
              {s.requestedShape && (
                <span className="lab9-slot-badge">
                  <svg viewBox="0 0 100 100" width={10} height={10} aria-hidden><ShapeGlyph shape={s.requestedShape} /></svg>
                  {SHAPE_NAMES[s.requestedShape].toUpperCase()}
                </span>
              )}
              <div className="lab9-pixel lab9-slot">
                {topCard ? <PixCard card={topCard} /> : <div className="lab9-card lab9-card-down" />}
              </div>
              <span className="lab9-pile-count">{s.pile.length} PLAYED</span>
            </div>
            <button type="button" className="lab9-market-btn" disabled={!myTurn} aria-label={`Market, ${s.market.length} cards — B to draw`} onClick={pressB}>
              <span className="lab9-market-stack">
                <span><div className="lab9-card lab9-card-down" /></span>
                <span><div className="lab9-card lab9-card-down" /></span>
                <span><div className="lab9-card lab9-card-down" /></span>
              </span>
              <span className="lab9-market-count">B·DRAW</span>
            </button>
          </div>

          <div className="lab9-belt-zone">
            <div className={`lab9-cursor${selected && !selectedLegal ? ' bad' : ''}${hand.length === 0 ? ' hidden' : ''}`} />
            <div className="lab9-belt">
              {hand.map((card, i) => (
                <div
                  key={card.id}
                  className={`lab9-belt-card${i === cur ? ' sel' : ''}${myTurn && !legalIds.has(card.id) ? ' illegal' : ''}`}
                  style={{ transform: `translateX(${(i - cur) * STEP}px)` }}
                >
                  <PixCard card={card} />
                </div>
              ))}
              {hand.length === 0 && <span className="lab9-belt-empty">BELT EMPTY</span>}
            </div>
            {shapeSel !== null && (
              <>
                <div className="lab9-shapes">
                  {SUITS.map((suit, i) => (
                    <button
                      key={suit}
                      type="button"
                      className={`lab9-shape-frame${i === shapeSel ? ' sel' : ''}`}
                      data-suit={suit}
                      aria-label={`Name ${SHAPE_NAMES[suit]}`}
                      onClick={() => { setShapeSel(i); playSound('tap') }}
                    >
                      <svg viewBox="0 0 100 100" aria-hidden><ShapeGlyph shape={suit} /></svg>
                    </button>
                  ))}
                </div>
                <div className="lab9-shape-hint">◀ ▶ MOVE · A THROW · ▼ CANCEL</div>
              </>
            )}
          </div>

          {denied && (
            <div className="lab9-denied" key={denied.key}>
              DENIED
              <small>{denied.reason}</small>
            </div>
          )}

          <div className="lab9-ticker" aria-live="polite">
            {lines.slice(-3).map((line, i) => (
              <span key={`${line.text}-${lines.length - i}`} className={line.tone}>▸ {line.text}</span>
            ))}
          </div>

          <div className="lab9-deck">
            <div className="lab9-dpad">
              <button type="button" className="lab9-pad-btn lab9-pad-up" onPointerDown={(e) => { e.preventDefault(); pressUp() }} aria-label="Up: whot shapes">▲</button>
              <button type="button" className="lab9-pad-btn lab9-pad-left" onPointerDown={(e) => { e.preventDefault(); move(-1) }} aria-label="Left">◀</button>
              <button type="button" className="lab9-pad-btn lab9-pad-down" onPointerDown={(e) => { e.preventDefault(); if (shapeSel !== null) setShapeSel(null) }} aria-label="Down: cancel">▼</button>
              <button type="button" className="lab9-pad-btn lab9-pad-right" onPointerDown={(e) => { e.preventDefault(); move(1) }} aria-label="Right">▶</button>
            </div>
            <div className="lab9-round-btns">
              <button type="button" className="lab9-ab lab9-ab-b" onPointerDown={(e) => { e.preventDefault(); pressB() }} aria-label="B: draw">B<small>DRAW</small></button>
              <button type="button" className="lab9-ab lab9-ab-a" onPointerDown={(e) => { e.preventDefault(); pressA() }} aria-label="A: play">A<small>PLAY</small></button>
            </div>
            <button type="button" className="lab9-start" onPointerDown={(e) => { e.preventDefault(); pressStart() }}>▮START</button>
          </div>
          <div className="lab9-keymap">← →/A D MOVE · ↑/W SHAPES · Z/SPACE PLAY · X DRAW · ENTER LAST CARD</div>

          <div className="lab9-scan" aria-hidden />
          <div className="lab9-glow" aria-hidden />
        </div>
      </div>

      <AnimatePresence>
        {s.phase === 'roundOver' && s.lastRound && (
          <motion.div className="lab9-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="lab9-panel lab9-pixel">
              <h2>ROUND {pad2(s.lastRound.round)} OVER</h2>
              <p className="lab9-sub">{s.lastRound.winnerId === ME ? 'PLAYER 1 CHECKS UP' : `${nameOf(s.lastRound.winnerId)} CHECKS UP`}</p>
              <div className="lab9-points">
                {s.lastRound.hands.map((row) => (
                  <div key={row.playerId} className={`lab9-points-row${row.playerId === s.lastRound?.winnerId ? ' winner' : ''}`}>
                    <span>{nameOf(row.playerId)}</span>
                    <span>{row.points} PTS</span>
                  </div>
                ))}
              </div>
              <button type="button" className="lab9-btn" onClick={nextRound}>NEXT ROUND</button>{' '}
              <button type="button" className="lab9-btn ghost" onClick={restart}>NEW MATCH</button>
            </div>
          </motion.div>
        )}
        {s.phase === 'matchOver' && s.matchWinnerId && (
          <motion.div className="lab9-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="lab9-panel lab9-pixel">
              <h2>{s.matchWinnerId === ME ? 'YOU WIN THE MATCH' : `${nameOf(s.matchWinnerId)} WINS`}</h2>
              <p className="lab9-sub">NEW CHAMPION REGISTERED</p>
              <button type="button" className="lab9-btn" onClick={restart}>NEW MATCH</button>
            </div>
          </motion.div>
        )}
        {exitAsk && (
          <motion.div className="lab9-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="lab9-panel lab9-pixel">
              <h2>LEAVE CABINET?</h2>
              <p className="lab9-sub">THE HIGH SCORE WILL NOT BE SAVED</p>
              <button type="button" className="lab9-btn" onClick={() => (window.location.hash = '')}>LEAVE</button>{' '}
              <button type="button" className="lab9-btn ghost" onClick={() => setExitAsk(false)}>CONTINUE</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}