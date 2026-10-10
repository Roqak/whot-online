import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import confetti from 'canvas-confetti'
import { Volume2, VolumeX } from 'lucide-react'
import { AVATARS } from '../lib/avatars'
import { describeEvent, type EventLine } from '../lib/events'
import { sortHand } from '../lib/hand'
import { useCountdown } from '../lib/hooks'
import { playSound, setSoundEnabled, vibrate } from '../lib/sound'
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
  type Card,
  type GameAction,
  type GameEvent,
  type GameState,
  type Suit,
  SUSPENSION,
} from '../types/game'
import { WhotCard } from '../components/cards/WhotCard'
import { ShapeIcon } from '../components/cards/shapes'
import { LabHand, type DragReport, type OutcomeChip } from './LabHand'
import { suitColor } from './suit'
import './lab.css'

const ME = 'me'

const SEATS: Seat[] = [
  { id: ME, name: 'You', avatar: 'lion', isBot: false },
  { id: 'bot-1', name: 'Ada', avatar: 'elephant', isBot: true, botLevel: 'normal' },
  { id: 'bot-2', name: 'Chidi', avatar: 'fox', isBot: true, botLevel: 'hard' },
  { id: 'bot-3', name: 'Ngozi', avatar: 'turtle', isBot: true, botLevel: 'easy' },
]

const SETTINGS = { handSize: 7, targetScore: 100, pickDefence: 'stack' as const, turnSeconds: 0 }
const TURN_MS = 30_000

function newMatch(): GameState {
  return createMatch(SEATS, SETTINGS, seededRng(Math.floor(Math.random() * 2 ** 31)))
}

/**
 * Whot Lab (#/lab) — an experiment in card handling on a riso-print table.
 * It runs the same engine and bots directly, offline, and touches nothing
 * in the online game: no store, no connection, no engine changes.
 */
export default function Lab() {
  const [tick, setTick] = useState(0)
  const stateRef = useRef<GameState>(newMatch())
  if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__labState = stateRef
  const [batch, setBatch] = useState<{ turnId: number; events: GameEvent[] } | null>(null)
  const [lines, setLines] = useState<EventLine[]>([])
  const [hintOn, setHintOn] = useState(false)
  const [timerOn, setTimerOn] = useState(false)
  const [soundOn, setSoundOn] = useState(true)
  const [deadline, setDeadline] = useState<number | null>(null)
  const [dragReport, setDragReport] = useState<DragReport | null>(null)
  const [pileEl, setPileEl] = useState<HTMLElement | null>(null)
  const [exitAsk, setExitAsk] = useState(false)

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
        render()
        return
      }
      stateRef.current = state
      setBatch({ turnId: state.turnId, events })
      render()
    }, 750 + Math.random() * 1100)
    return () => clearTimeout(timer)
  }, [tick, render])

  // Bots pounce on a human who forgot to call last card — softer timings
  // than the online table so the lab stays playful.
  useEffect(() => {
    const state = stateRef.current
    if (state.phase !== 'playing') return
    if (!isCatchable(state.players.find((p) => p.id === ME)!)) return
    const timer = window.setTimeout(() => {
      const fresh = stateRef.current
      const me = fresh.players.find((p) => p.id === ME)
      if (fresh.phase !== 'playing' || !me || !isCatchable(me)) return
      dispatch('bot-2', [{ type: 'catch', targetId: ME }])
    }, 2600 + Math.random() * 2600)
    return () => window.clearTimeout(timer)
  }, [tick, dispatch])

  // Optional turn timer for the human seat.
  useEffect(() => {
    const state = stateRef.current
    if (!timerOn || state.phase !== 'playing' || currentPlayer(state).isBot) {
      setDeadline(null)
      return
    }
    setDeadline(Date.now() + TURN_MS)
  }, [tick, timerOn])

  useEffect(() => {
    if (!deadline) return
    const timer = setTimeout(() => {
      const state = stateRef.current
      if (state.phase !== 'playing') return
      const player = currentPlayer(state)
      if (player.isBot) return
      dispatch(player.id, [{ type: 'draw' }])
    }, Math.max(0, deadline - Date.now()))
    return () => clearTimeout(timer)
  }, [deadline, dispatch])

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
          if (event.result.winnerId === ME) celebrate()
          break
        case 'matchOver':
          if (event.winnerId === ME) {
            celebrate(true)
            playSound('win')
          }
          break
      }
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

  const countdown = useCountdown(deadline, `${s.turnId}-${timerOn}`)

  const topCard = s.pile[s.pile.length - 1] ?? null
  const pileBehind = s.pile.slice(-4, -1)
  const opponents = s.players.filter((p) => p.id !== ME)
  const pendingPickMine = s.pendingPick && myTurn && legalIds.size === 0
  const canCallLastCard = !!me && s.phase === 'playing' && !me.announcedLastCard && me.hand.length > 0 && me.hand.length <= 2

  const hintId = useMemo(() => {
    if (!hintOn || !myTurn) return null
    const moves = chooseBotMove(stateRef.current, ME, seededRng(7))
    const play = moves.find((m) => m.type === 'play')
    return play && play.type === 'play' ? play.cardId : null
  }, [hintOn, myTurn, tick]) // eslint-disable-line react-hooks/exhaustive-deps

  const explain = useCallback(
    (card: Card): string | null => {
      if (legalIds.has(card.id)) return null
      if (s.pendingPick) {
        return s.settings.pickDefence === 'none'
          ? `pick ${s.pendingPick.amount} — no defence allowed`
          : `throw a ${s.pendingPick.number} to defend, or take the pick`
      }
      if (s.requestedShape) return `the shape is ${SHAPE_NAMES[s.requestedShape]} — nothing else plays`
      const top = s.pile[s.pile.length - 1] ?? null
      if (!top) return null
      return `not a ${SHAPE_NAMES[top.shape]}, not a ${top.number}`
    },
    [legalIds, s.pendingPick, s.requestedShape, s.pile, s.settings.pickDefence],
  )

  const preview = useCallback(
    (card: Card): OutcomeChip[] => {
      const chips: OutcomeChip[] = []
      const next = s.players[nextActiveIndex(s.players, s.turnIndex)]
      if (card.shape === 'whot') chips.push({ text: 'name the shape', tone: 'neutral' })
      else if (card.number === HOLD_ON) chips.push({ text: 'you throw again', tone: 'good' })
      else if (card.number === PICK_TWO) chips.push({ text: `${next?.name} picks 2`, tone: 'bad' })
      else if (card.number === PICK_THREE) chips.push({ text: `${next?.name} picks 3`, tone: 'bad' })
      else if (card.number === SUSPENSION) chips.push({ text: `${next?.name} sits out`, tone: 'neutral' })
      else if (card.number === GENERAL_MARKET) chips.push({ text: 'everybody to market', tone: 'bad' })
      const rest = (me?.hand.length ?? 0) - 1
      if (rest === 1) chips.push({ text: 'then call LAST CARD', tone: 'good' })
      if (rest === 0) chips.push({ text: 'that checks up', tone: 'good' })
      return chips.slice(0, 3)
    },
    [s, me?.hand.length],
  )

  const onDragReport = useCallback((report: DragReport | null) => setDragReport(report), [])

  const play = (cardId: string, shape?: Suit) => dispatch(ME, [{ type: 'play', cardId, requestedShape: shape }])
  const draw = () => dispatch(ME, [{ type: 'draw' }])
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
    setDragReport(null)
    render()
  }

  const handWidth = 74
  const ringClass = dragReport
    ? dragReport.overPile
      ? dragReport.legal
        ? ' hot'
        : ' bad'
      : ' open'
    : ''

  return (
    <div className="lab">
      <header className="lab-top">
        <div className="lab-wordmark">
          <span className="lab-reg" aria-hidden />
          Whot Lab
          <small>an experiment in card handling · press · throw · call</small>
        </div>
        <button type="button" className="lab-toggle" aria-pressed={hintOn} onClick={() => setHintOn(!hintOn)}>
          <span className="dot" /> Best-move hint
        </button>
        <button type="button" className="lab-toggle" aria-pressed={timerOn} onClick={() => setTimerOn(!timerOn)}>
          <span className="dot" /> 30s turn timer
        </button>
        <button
          type="button"
          className="lab-toggle"
          aria-pressed={soundOn}
          onClick={() => {
            setSoundOn(!soundOn)
            setSoundEnabled(!soundOn)
          }}
        >
          {soundOn ? <Volume2 size={13} /> : <VolumeX size={13} />} Sound
        </button>
        <button type="button" className="lab-toggle lab-exit" onClick={() => setExitAsk(true)}>
          Exit lab
        </button>
      </header>

      <section className="lab-arena">
        <div className="lab-halftone" aria-hidden />

        <div className="lab-opponents">
          {opponents.map((p) => {
            const avatar = AVATARS.find((a) => a.id === p.avatar)
            return (
              <div key={p.id} className={`lab-seat${turnPlayer?.id === p.id ? ' active' : ''}`}>
                {p.announcedLastCard && <span className="lab-stamp">LAST CARD</span>}
                {s.phase === 'playing' && isCatchable(p) && (
                  <button type="button" className="lab-stamp" onClick={() => catchPlayer(p.id)}>
                    CATCH!
                  </button>
                )}
                <div className="lab-seat-face" style={{ ['--seat-hue' as string]: `${avatar?.hue ?? 70}` }}>
                  {avatar?.emoji ?? '🙂'}
                </div>
                <span className="lab-seat-name">{p.name}</span>
                <span className="lab-seat-minis" aria-label={`${p.hand.length} cards`}>
                  {Array.from({ length: Math.min(p.hand.length, 10) }).map((_, i) => (
                    <i key={i} className="lab-mini" />
                  ))}
                </span>
                {turnPlayer?.id === p.id && (
                  <span className="lab-think" aria-label="thinking">
                    <i />
                    <i />
                    <i />
                  </span>
                )}
              </div>
            )
          })}
        </div>

        <div className="lab-center">
          <div className="lab-turn">
            <span className={`lab-turn-chip${myTurn ? ' mine' : ''}`}>
              {s.phase !== 'playing'
                ? 'Table settled'
                : myTurn
                  ? timerOn && countdown.fraction < 0.25
                    ? 'Last seconds…'
                    : 'You’re up — throw one'
                  : `${turnPlayer?.name} is thinking`}
            </span>
            {deadline && myTurn && (
              <span className="lab-turn-bar" aria-hidden>
                <i style={{ width: `${Math.round(countdown.fraction * 100)}%` }} />
              </span>
            )}
          </div>

          <div className="lab-pile" ref={setPileEl}>
            <div
              className={`lab-pile-ring${ringClass}`}
              style={
                dragReport?.overPile && dragReport.legal ? { ['--target-ink' as string]: suitColor(dragReport.shape) } : undefined
              }
              aria-hidden
            />
            {s.requestedShape && (
              <span className="lab-shape-badge">
                <ShapeIcon shape={s.requestedShape} size={13} /> {SHAPE_NAMES[s.requestedShape]}
              </span>
            )}
            <div className="lab-pile-stack" aria-hidden>
              {pileBehind.map((card, i) => (
                <div key={card.id} style={{ transform: `translate(${(i - 1) * 4}px, ${(i - 1) * 3}px) rotate(${(i - 1) * 4}deg)` }}>
                  <WhotCard faceDown />
                </div>
              ))}
            </div>
            <motion.div className="lab-pile-card" key={topCard?.id ?? 'empty'}>
              {topCard ? <WhotCard card={topCard} /> : <WhotCard faceDown />}
            </motion.div>
            {dragReport?.overPile && !dragReport.legal && (
              <span className="lab-pile-hint bad">{dragReport.reason ?? 'not playable'}</span>
            )}
            {dragReport?.overPile && dragReport.legal && dragReport.shape === 'whot' && (
              <span className="lab-pile-hint">now pick a shape</span>
            )}
            <span className="lab-pile-hint" style={{ opacity: dragReport ? 0 : 1 }}>
              {topCard ? `${s.pile.length} played` : 'the table is open'}
            </span>
          </div>

          <div className="lab-market">
            {pendingPickMine && (
              <span className="lab-must-pick">
                you must pick {s.pendingPick?.amount} — no {s.pendingPick?.number} in hand
              </span>
            )}
            <button type="button" onClick={draw} disabled={!myTurn} aria-label={`Go to market, ${s.market.length} cards left`}>
              <span className="lab-market-card">
                <WhotCard faceDown />
              </span>
              <span className="lab-market-card">
                <WhotCard faceDown />
              </span>
              <span className="lab-market-card">
                <WhotCard faceDown />
              </span>
            </button>
            <span className="lab-market-count">{s.market.length}</span>
          </div>
        </div>

        <div className="lab-ticker" aria-live="polite">
          {lines.slice(-3).map((line, i) => (
            <motion.span
              key={`${line.text}-${lines.length - i}`}
              className={`lab-ticker-line${line.tone === 'neutral' ? '' : ` ${line.tone}`}`}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 0.45 + 0.55 * (i / Math.max(1, lines.slice(-3).length - 1)) }}
            >
              {line.text}
            </motion.span>
          ))}
        </div>
      </section>

      <section className="lab-handzone">
        <div className="lab-chips-row">
          {canCallLastCard && (
            <button type="button" className="lab-chip urge" onClick={callLastCard}>
              LAST CARD — call it
            </button>
          )}
          {me?.announcedLastCard && <span className="lab-chip good">last card called</span>}
          {hand.length > 0 && !myTurn && s.phase === 'playing' && <span className="lab-chip">{turnPlayer?.name} is playing…</span>}
        </div>
        <span className="lab-hand-meta">
          {hand.length} in hand · round {s.round}
        </span>
        <LabHand
          cards={hand}
          legalIds={legalIds}
          myTurn={myTurn}
          cardWidth={handWidth}
          pileEl={pileEl}
          explain={explain}
          preview={preview}
          onPlay={play}
          hintId={hintId}
          onDragReport={onDragReport}
        />
      </section>

      <AnimatePresence>
        {s.phase === 'roundOver' && s.lastRound && (
          <motion.div className="lab-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="lab-panel">
              <h2>{s.lastRound.winnerId === ME ? 'You check up' : `${nameOf(s.lastRound.winnerId)} checks up`}</h2>
              <p className="sub">round {s.lastRound.round} · winner takes the pile</p>
              <div className="lab-points">
                {s.lastRound.hands.map((row) => {
                  const player = s.players.find((p) => p.id === row.playerId)
                  const emoji = AVATARS.find((a) => a.id === player?.avatar)?.emoji ?? '🙂'
                  return (
                    <div key={row.playerId} className={`lab-points-row${row.playerId === s.lastRound?.winnerId ? ' winner' : ''}`}>
                      <span>
                        {emoji} {player?.name}
                      </span>
                      <span className="pts">
                        {row.points} pts{player?.eliminated ? ' · out' : ''}
                      </span>
                    </div>
                  )
                })}
              </div>
              <button type="button" className="lab-btn" onClick={nextRound}>
                Next round
              </button>{' '}
              <button type="button" className="lab-btn ghost" onClick={restart}>
                New match
              </button>
            </div>
          </motion.div>
        )}
        {s.phase === 'matchOver' && s.matchWinnerId && (
          <motion.div className="lab-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="lab-panel">
              <h2>{s.matchWinnerId === ME ? 'You win the match' : `${nameOf(s.matchWinnerId)} wins the match`}</h2>
              <p className="sub">that is the whole match</p>
              <button type="button" className="lab-btn" onClick={restart}>
                New match
              </button>
            </div>
          </motion.div>
        )}
        {exitAsk && (
          <motion.div className="lab-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="lab-panel">
              <h2>Leave the lab?</h2>
              <p className="sub">the experiment table will not be saved</p>
              <button type="button" className="lab-btn" onClick={() => (window.location.hash = '')}>
                Leave
              </button>{' '}
              <button type="button" className="lab-btn ghost" onClick={() => setExitAsk(false)}>
                Keep playing
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function celebrate(big = false) {
  confetti({
    particleCount: big ? 160 : 60,
    spread: big ? 100 : 55,
    origin: { y: 0.7 },
    colors: ['#2a2622', '#e2a72e', '#c8542f', '#4f7d5b', '#5a4a9c'],
  })
}