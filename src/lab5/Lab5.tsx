import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { sortHand } from '../lib/hand'
import { playSound, setSoundEnabled, vibrate, type SoundName } from '../lib/sound'
import { AVATARS } from '../lib/avatars'
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
  GENERAL_MARKET,
  HOLD_ON,
  isSpecial,
  PICK_THREE,
  PICK_TWO,
  SHAPE_NAMES,
  SPECIAL_NAMES,
  SUITS,
  SUSPENSION,
  type Card,
  type GameAction,
  type GameEvent,
  type GameState,
  type Shape,
  type Suit,
} from '../types/game'
import { WhotCard } from '../components/cards/WhotCard'
import { ShapeIcon } from '../components/cards/shapes'
import './lab5.css'

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

/** A broadcast-poster overlay panel: giant quote, headline, body. */
function Poster({ title, sub, children }: { title: string; sub: string; children: ReactNode }) {
  return (
    <motion.div className="lab5-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="lab5-panel">
        <span className="lab5-panelquote" aria-hidden>“</span>
        <h2>{title}</h2>
        <p className="sub">{sub}</p>
        {children}
      </div>
    </motion.div>
  )
}

interface Announce {
  id: number
  text: string
  tone: 'neutral' | 'good' | 'bad'
  glyph?: Shape
}

const NUM_WORDS: Record<number, string> = { 2: 'two', 3: 'three', 4: 'four', 6: 'six', 8: 'eight', 9: 'nine' }

const EV_SOUNDS: Partial<Record<GameEvent['type'], SoundName>> = {
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

/**
 * Whot Lab 5 (#/lab5) — THE ANNOUNCEMENT DESK.
 * Play is declarative: tap a card onto center stage, then commit with a verb.
 * Every action hits the broadcast banner. Same engine and bots as the table,
 * run directly and offline; no store, no connection, no engine changes.
 */
export default function Lab5() {
  const [tick, setTick] = useState(0)
  const stateRef = useRef<GameState>(newMatch())
  const lineId = useRef(0)
  const [lines, setLines] = useState<Announce[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [soundOn, setSoundOn] = useState(true)
  const [exitAsk, setExitAsk] = useState(false)

  const s = stateRef.current
  const render = useCallback(() => setTick((n) => n + 1), [])

  const nameOf = useCallback((id: string) => stateRef.current.players.find((p) => p.id === id)?.name ?? 'Someone', [])

  // The broadcast copy: every engine event becomes one headline line.
  const announce = useCallback(
    (events: GameEvent[]) => {
      const fresh: Announce[] = []
      const who = (id: string) => (id === ME ? 'You' : nameOf(id))
      const mine = (id: string) => id === ME
      for (const ev of events) {
        let line: Omit<Announce, 'id'> | null = null
        switch (ev.type) {
          case 'played': {
            const m = mine(ev.playerId)
            if (ev.card.shape === 'whot')
              line = { text: `${who(ev.playerId)} ${m ? 'throw' : 'throws'} WHOT`, tone: 'good', glyph: 'whot' }
            else {
              const special = SPECIAL_NAMES[ev.card.number]
              line = {
                text: `${who(ev.playerId)} ${m ? 'throw' : 'throws'} ${ev.card.number} ${SHAPE_NAMES[ev.card.shape]}${special ? ` — ${special}` : ''}`,
                tone: 'neutral',
                glyph: ev.card.shape,
              }
            }
            break
          }
          case 'shapeRequested':
            line = { text: `${who(ev.playerId)} ${mine(ev.playerId) ? 'name' : 'names'} ${SHAPE_NAMES[ev.shape]}`, tone: 'neutral', glyph: ev.shape }
            break
          case 'holdOn':
            line = { text: `${who(ev.playerId)} ${mine(ev.playerId) ? 'hold' : 'holds'} on`, tone: 'good' }
            break
          case 'suspended':
            line = { text: `${mine(ev.targetId) ? 'You are' : `${nameOf(ev.targetId)} is`} suspended`, tone: 'bad' }
            break
          case 'pick':
            line = {
              text: mine(ev.targetId) ? `You pick ${NUM_WORDS[ev.amount] ?? String(ev.amount)}` : `${nameOf(ev.targetId)} picks ${NUM_WORDS[ev.amount] ?? String(ev.amount)}`,
              tone: mine(ev.targetId) ? 'bad' : 'neutral',
            }
            break
          case 'generalMarket':
            line = { text: 'GENERAL MARKET — everyone to the stalls', tone: 'bad' }
            break
          case 'drew':
            if (ev.reason === 'market')
              line = { text: `${who(ev.playerId)} ${mine(ev.playerId) ? 'go' : 'goes'} to market`, tone: 'neutral' }
            else if (ev.reason === 'timeout') line = { text: `${who(ev.playerId)} ran out of time`, tone: 'neutral' }
            break
          case 'lastCard':
            line = { text: `LAST CARD — ${who(ev.playerId)} call${mine(ev.playerId) ? '' : 's'} it`, tone: 'good' }
            break
          case 'caught':
            line = {
              text: `${who(ev.byId)} ${mine(ev.byId) ? 'catch' : 'catches'} ${mine(ev.targetId) ? 'you' : nameOf(ev.targetId)}`,
              tone: mine(ev.targetId) ? 'bad' : 'good',
            }
            break
          case 'reshuffled':
            line = { text: 'Market reshuffled', tone: 'neutral' }
            break
          case 'roundStarted':
            line = { text: `ROUND ${ev.round} — ON AIR`, tone: 'neutral' }
            break
          case 'roundOver':
            line = {
              text: `${who(ev.result.winnerId)} ${mine(ev.result.winnerId) ? 'check' : 'checks'} up`,
              tone: mine(ev.result.winnerId) ? 'good' : 'neutral',
            }
            break
          case 'matchOver':
            line = { text: `${who(ev.winnerId)} ${mine(ev.winnerId) ? 'win' : 'wins'} the match`, tone: mine(ev.winnerId) ? 'good' : 'neutral' }
            break
          default:
            line = null
        }
        if (line) fresh.push({ ...line, id: ++lineId.current })
      }
      if (fresh.length > 0) setLines((q) => [...q, ...fresh].slice(-3))
    },
    [nameOf],
  )

  // Sounds + haptics for the same events the banner covers.
  const soundFor = useCallback((events: GameEvent[]) => {
    for (const ev of events) {
      if (ev.type === 'played') playSound(ev.card.shape === 'whot' || isSpecial(ev.card) ? 'special' : 'play')
      else if (ev.type === 'roundOver') playSound(ev.result.winnerId === ME ? 'win' : 'lose')
      else if (ev.type === 'matchOver') playSound(ev.winnerId === ME ? 'win' : 'lose')
      else {
        const snd = EV_SOUNDS[ev.type]
        if (!snd) continue
        playSound(snd)
        if (ev.type === 'pick') vibrate(30)
        if (ev.type === 'lastCard') vibrate(20)
        if (ev.type === 'caught') vibrate([30, 40, 30])
      }
    }
  }, [])

  const commit = useCallback(
    (state: GameState, events: GameEvent[]) => {
      stateRef.current = state
      soundFor(events)
      announce(events)
      render()
    },
    [announce, render, soundFor],
  )

  const dispatch = useCallback(
    (playerId: string, actions: GameAction[]) => {
      const prev = stateRef.current
      if (prev.phase !== 'playing') return
      let state = prev
      const events: GameEvent[] = []
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

  // Bots take the microphone a beat after their turn is dealt, with the same
  // "if the move went nowhere, go to market" fallback the online table uses.
  useEffect(() => {
    const state = stateRef.current
    if (state.phase !== 'playing') return
    const player = currentPlayer(state)
    if (!player.isBot) return
    const timer = setTimeout(() => {
      const fresh = stateRef.current
      if (fresh.phase !== 'playing' || currentPlayer(fresh).id !== player.id) return
      let state = fresh
      const events: GameEvent[] = []
      for (const action of chooseBotMove(fresh, player.id, seededRng((Date.now() % 2 ** 31) | 0))) {
        const result = applyAction(state, player.id, action)
        if (!result.ok) break
        state = result.state
        events.push(...result.events)
      }
      // A bot that produced nothing (or failed its move) goes to market.
      // Round-ending plays have events but may not bump the turn, so they commit above.
      if (events.length === 0) {
        const timeout = applyTimeout(state, player.id)
        if (!timeout.ok) return
        commit(timeout.state, timeout.events)
        return
      }
      commit(state, events)
    }, 750 + Math.random() * 1100)
    return () => clearTimeout(timer)
  }, [tick, commit])

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

  const me = s.players.find((p) => p.id === ME)
  const turnPlayer = s.phase === 'playing' ? currentPlayer(s) : null
  const myTurn = s.phase === 'playing' && turnPlayer?.id === ME
  const ctx = playContext(s)
  const hand = me ? sortHand(me.hand, 'shape') : []
  const legalIds = new Set(myTurn && me ? me.hand.filter((c) => canPlayCard(c, ctx)).map((c) => c.id) : [])
  const pendingPickMine = s.pendingPick && myTurn && legalIds.size === 0
  const canCallLastCard = !!me && s.phase === 'playing' && !me.announcedLastCard && me.hand.length > 0 && me.hand.length <= 2

  const selectedCard = me?.hand.find((c) => c.id === selectedId) ?? null
  const selectedLegal = selectedCard ? legalIds.has(selectedCard.id) : false
  const topCard = s.pile[s.pile.length - 1] ?? null
  const opponents = s.players.filter((p) => p.id !== ME)
  const nextName = s.players[(s.turnIndex + 1) % s.players.length]?.name ?? 'next up'

  // Hand back the microphone whenever the turn moves on.
  useEffect(() => {
    if (!myTurn) setSelectedId(null)
  }, [myTurn, s.turnId])

  const pickCard = (card: Card) => {
    if (!myTurn) return
    playSound('tap')
    setSelectedId(card.id)
  }

  const throwCard = () => {
    if (!selectedCard || !myTurn) return
    dispatch(ME, [{ type: 'play', cardId: selectedCard.id }])
    setSelectedId(null)
  }

  const whotCall = (shape: Suit) => {
    if (!selectedCard || !myTurn) return
    dispatch(ME, [{ type: 'play', cardId: selectedCard.id, requestedShape: shape }])
    setSelectedId(null)
  }

  const drawAction = () => {
    if (!myTurn) return
    setSelectedId(null)
    dispatch(ME, [{ type: 'draw' }])
  }

  const callLastCard = () => dispatch(ME, [{ type: 'lastCard' }])
  const catchPlayer = (targetId: string) => dispatch(ME, [{ type: 'catch', targetId }])

  const nextRound = () => {
    const { state, events } = startNextRound(stateRef.current)
    commit(state, events)
  }
  const restart = () => {
    stateRef.current = newMatch()
    setLines([])
    setSelectedId(null)
    render()
  }

  // One-line consequence forecast under the verb row, before you confirm.
  const forecast = (card: Card | null): string | null => {
    if (!myTurn) return turnPlayer ? `${turnPlayer.name} is on the microphone…` : null
    if (s.pendingPick) {
      if (pendingPickMine) return `no ${s.pendingPick.number} to defend — take ${s.pendingPick.amount} from the market`
      return `defend with a ${s.pendingPick.number}, or take the pick`
    }
    if (!card) return 'tap a card — make it news'
    if (!selectedLegal) {
      if (s.requestedShape) return `off air — only ${SHAPE_NAMES[s.requestedShape]} plays`
      return topCard ? `off air — not a ${SHAPE_NAMES[topCard.shape]}, not a ${topCard.number}` : null
    }
    const bits: string[] = []
    if (card.shape === 'whot') bits.push('you call the shape')
    else if (card.number === HOLD_ON) bits.push('hold on — you throw again')
    else if (card.number === PICK_TWO) bits.push(`${nextName} picks two`)
    else if (card.number === PICK_THREE) bits.push(`${nextName} picks three`)
    else if (card.number === SUSPENSION) bits.push(`${nextName} sits out`)
    else if (card.number === GENERAL_MARKET) bits.push('general market — everyone picks')
    const rest = (me?.hand.length ?? 0) - 1
    if (rest === 1) bits.push('then call LAST CARD')
    if (rest === 0) bits.push('that checks up')
    return bits.length > 0 ? bits.join(' · ') : 'clean throw — no strings'
  }

  return (
    <div className="lab5">
      <header className="lab5-mast">
        <span className="lab5-onair">
          <i className="lab5-dot" aria-hidden /> ON AIR
        </span>
        <span className="lab5-mast-title">
          THE ANNOUNCEMENT DESK <small>WHOT · LAB 5</small>
        </span>
        <button
          type="button"
          className="lab5-mastbtn"
          aria-pressed={soundOn}
          onClick={() => {
            setSoundOn(!soundOn)
            setSoundEnabled(!soundOn)
          }}
        >
          {soundOn ? 'SND ✓' : 'SND ✕'}
        </button>
        <button type="button" className="lab5-mastbtn exit" onClick={() => setExitAsk(true)}>
          EXIT LAB5
        </button>
      </header>

      <section className="lab5-transcript" aria-live="polite">
        <span className="lab5-quote" aria-hidden>“</span>
        <div className="lab5-lines">
          {lines.length === 0 && <div className="lab5-line rank-0 idle">The desk is live — throw the first headline</div>}
          {lines.map((line, i, arr) => {
            const rank = arr.length - 1 - i
            return (
              <motion.div
                key={line.id}
                className={`lab5-line rank-${Math.min(rank, 2)} ${line.tone}`}
                initial={{ opacity: 0, y: 16, scale: 0.97 }}
                animate={{ opacity: rank === 0 ? 1 : rank === 1 ? 0.55 : 0.3, y: 0, scale: 1 }}
                transition={{ type: 'spring', stiffness: 260, damping: 24 }}
              >
                <span className="lab5-linetext">{line.text}</span>
                {line.glyph && <ShapeIcon shape={line.glyph} size={rank === 0 ? 26 : 15} className="lab5-lineglyph" />}
              </motion.div>
            )
          })}
        </div>
      </section>

      <section className="lab5-roster">
        {opponents.map((p) => {
          const avatar = AVATARS.find((a) => a.id === p.avatar)
          return (
            <div key={p.id} className={`lab5-seat${turnPlayer?.id === p.id ? ' active' : ''}${p.eliminated ? ' out' : ''}`}>
              {s.phase === 'playing' && isCatchable(p) && myTurn && (
                <button type="button" className="lab5-stamp catch" onClick={() => catchPlayer(p.id)}>
                  CATCH!
                </button>
              )}
              {p.announcedLastCard && <span className="lab5-stamp">LAST CARD</span>}
              <span className="lab5-seat-face" aria-hidden>
                {avatar?.emoji ?? '🙂'}
              </span>
              <span className="lab5-seat-name">{p.name}</span>
              <span className="lab5-seat-count">{p.hand.length}</span>
            </div>
          )
        })}
        {me && (
          <div className={`lab5-seat me${myTurn ? ' active' : ''}`}>
            <span className="lab5-seat-face" aria-hidden>
              {AVATARS.find((a) => a.id === me.avatar)?.emoji ?? '🙂'}
            </span>
            <span className="lab5-seat-name">You</span>
            <span className="lab5-seat-count">{me.hand.length}</span>
          </div>
        )}
      </section>

      <section className="lab5-stage">
        <div className="lab5-table">
          <div className="lab5-pile">
            <span className="lab5-label">ON THE WIRE</span>
            <div className="lab5-pilecard">{topCard ? <WhotCard card={topCard} /> : <WhotCard faceDown />}</div>
            {s.requestedShape && (
              <span className="lab5-callout">
                <ShapeIcon shape={s.requestedShape} size={13} /> {SHAPE_NAMES[s.requestedShape].toUpperCase()} CALLED
              </span>
            )}
          </div>

          <button
            type="button"
            className={`lab5-market${pendingPickMine ? ' owe' : ''}`}
            onClick={drawAction}
            disabled={!myTurn}
            aria-label={`Market, ${s.market.length} cards left`}
          >
            <span className="lab5-label">MARKET</span>
            <span className="lab5-marketstack" aria-hidden>
              <i />
              <i />
              <i />
            </span>
            <span className="lab5-marketcount">{s.market.length}</span>
            {pendingPickMine && <span className="lab5-stamp owe">PICK {s.pendingPick?.amount}</span>}
          </button>

          <div className="lab5-tray">
            <span className="lab5-label">CENTER STAGE</span>
            {selectedCard ? (
              <motion.div
                key={selectedCard.id}
                className={`lab5-traycard${selectedLegal ? '' : ' dead'}`}
                initial={{ y: 70, rotate: -8, scale: 0.7, opacity: 0 }}
                animate={{ y: 0, rotate: 0, scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 300, damping: 22 }}
              >
                <WhotCard card={selectedCard} />
                {!selectedLegal && <span className="lab5-stamp offair">OFF AIR</span>}
              </motion.div>
            ) : (
              <div className="lab5-tray-empty">
                {myTurn ? (
                  <>
                    <span className="big">TAP A CARD</span>
                    <span className="small">make it news</span>
                  </>
                ) : (
                  <span className="small">{turnPlayer?.name ?? 'The desk'} is on the microphone…</span>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="lab5-verbs">
          {selectedCard && selectedCard.shape === 'whot' && selectedLegal && myTurn ? (
            <>
              {SUITS.map((shape) => (
                <button key={shape} type="button" className="lab5-verb shape" onClick={() => whotCall(shape)}>
                  <ShapeIcon shape={shape} size={18} /> CALL {SHAPE_NAMES[shape].toUpperCase()}
                </button>
              ))}
              <button type="button" className="lab5-verb draw" onClick={drawAction}>
                ↩ SEND BACK
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="lab5-verb throw"
                onClick={throwCard}
                disabled={!selectedCard || !selectedLegal || !myTurn}
              >
                ▶ THROW
                {selectedCard && selectedLegal
                  ? ` — ${selectedCard.shape === 'whot' ? 'WHOT' : `${selectedCard.number} ${SHAPE_NAMES[selectedCard.shape]}`}`
                  : ''}
              </button>
              <button type="button" className="lab5-verb draw" onClick={drawAction} disabled={!myTurn}>
                ↩ DRAW{selectedCard ? ' — SEND BACK' : ' FROM MARKET'}
              </button>
            </>
          )}
          {canCallLastCard && (
            <button type="button" className="lab5-verb call" onClick={callLastCard}>
              ★ CALL LAST CARD
            </button>
          )}
        </div>
        <p className={`lab5-forecast${selectedCard && !selectedLegal && myTurn ? ' warn' : ''}`}>{forecast(selectedCard) ?? ''}</p>
      </section>

      <section className="lab5-handstrip" aria-label="Your hand">
        {hand.map((card) => {
          const legal = legalIds.has(card.id)
          return (
            <motion.button
              key={card.id}
              type="button"
              className={`lab5-handcard${selectedId === card.id ? ' picked' : ''}${myTurn && !legal ? ' muted' : ''}`}
              onClick={() => pickCard(card)}
              whileTap={{ scale: 0.94 }}
              aria-label={card.shape === 'whot' ? 'Whot 20' : `${card.number} of ${SHAPE_NAMES[card.shape]}`}
            >
              <WhotCard card={card} muted={myTurn && !legal} />
            </motion.button>
          )
        })}
      </section>

      <AnimatePresence>
        {s.phase === 'roundOver' && s.lastRound && (
          <Poster
            title={s.lastRound.winnerId === ME ? 'YOU CHECK UP' : `${nameOf(s.lastRound.winnerId).toUpperCase()} CHECKS UP`}
            sub={`round ${s.lastRound.round} — winner takes the wire`}
          >
            <div className="lab5-points">
              {s.lastRound.hands.map((row) => {
                const player = s.players.find((p) => p.id === row.playerId)
                return (
                  <div key={row.playerId} className={`lab5-points-row${row.playerId === s.lastRound?.winnerId ? ' winner' : ''}`}>
                    <span>
                      {AVATARS.find((a) => a.id === player?.avatar)?.emoji ?? '🙂'} {player?.name}
                    </span>
                    <span className="pts">
                      {row.points} pts{player?.eliminated ? ' · out' : ''}
                    </span>
                  </div>
                )
              })}
            </div>
            <div className="lab5-panelbtns">
              <button type="button" className="lab5-verb throw" onClick={nextRound}>
                ▶ NEXT ROUND
              </button>
              <button type="button" className="lab5-verb draw" onClick={restart}>
                ↻ NEW MATCH
              </button>
            </div>
          </Poster>
        )}
        {s.phase === 'matchOver' && s.matchWinnerId && (
          <Poster
            title={s.matchWinnerId === ME ? 'YOU WIN THE MATCH' : `${nameOf(s.matchWinnerId).toUpperCase()} WINS THE MATCH`}
            sub="that is the whole broadcast"
          >
            <div className="lab5-panelbtns">
              <button type="button" className="lab5-verb throw" onClick={restart}>
                ↻ NEW MATCH
              </button>
            </div>
          </Poster>
        )}
        {exitAsk && (
          <Poster title="END THE BROADCAST?" sub="the desk will not be saved">
            <div className="lab5-panelbtns">
              <button type="button" className="lab5-verb throw" onClick={() => (window.location.hash = '')}>
                LEAVE
              </button>
              <button type="button" className="lab5-verb draw" onClick={() => setExitAsk(false)}>
                KEEP TALKING
              </button>
            </div>
          </Poster>
        )}
      </AnimatePresence>
    </div>
  )
}