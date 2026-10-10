import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
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
import './lab8.css'

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

/**
 * Whot Lab 8 (#/lab8) — the storybook table. The match is told as letterpress
 * prose; every legal move is an inline choice inside the paragraph. It runs
 * the same engine and bots directly, offline, and touches nothing else.
 */

/** An inline story token: a small pill naming one card. */
function Token({ card, ink }: { card: Card; ink?: boolean }) {
  return (
    <span className={`lab8-token${ink ? ' ink' : ''}`}>
      {card.shape === 'whot' ? 'Whot' : card.number}
      <ShapeIcon shape={card.shape} size={11} />
    </span>
  )
}

export default function Lab8() {
  const [tick, setTick] = useState(0)
  const stateRef = useRef<GameState>(newMatch())
  const [batch, setBatch] = useState<{ events: GameEvent[] } | null>(null)
  const [lines, setLines] = useState<EventLine[]>([])
  const [soundOn, setSoundOn] = useState(true)
  const [exitAsk, setExitAsk] = useState(false)
  const [focusId, setFocusId] = useState<string | null>(null)
  const [whotPath, setWhotPath] = useState(false)

  const s = stateRef.current
  if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__lab8State = stateRef
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
      setBatch({ events })
      render()
    },
    [render],
  )

  const nameOf = useCallback((id: string) => stateRef.current.players.find((p) => p.id === id)?.name ?? 'Someone', [])

  // Bots narrate their turn a beat after they are dealt it, with the same
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
        setBatch({ events: [...events, ...timeout.events] })
        render()
        return
      }
      stateRef.current = state
      setBatch({ events })
      render()
    }, 750 + Math.random() * 1100)
    return () => clearTimeout(timer)
  }, [tick, render])

  // Chidi pounces on a storyteller who forgot to call last card.
  useEffect(() => {
    const state = stateRef.current
    if (state.phase !== 'playing') return
    const mePlayer = state.players.find((p) => p.id === ME)
    if (!mePlayer || !isCatchable(mePlayer)) return
    const timer = window.setTimeout(() => {
      const fresh = stateRef.current
      const mePlayer = fresh.players.find((p) => p.id === ME)
      if (fresh.phase !== 'playing' || !mePlayer || !isCatchable(mePlayer)) return
      dispatch('bot-2', [{ type: 'catch', targetId: ME }])
    }, 2600 + Math.random() * 2600)
    return () => window.clearTimeout(timer)
  }, [tick, dispatch])

  // Sound and commentary for whatever the last page told.
  useEffect(() => {
    if (!batch) return
    for (const event of batch.events) {
      const line = describeEvent(event, { nameOf, myId: ME, verbose: true })
      if (line) setLines((q) => [...q, line].slice(-3))
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
          break
        case 'caught':
          playSound('caught')
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
          playSound('win')
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

  const topCard = s.pile[s.pile.length - 1] ?? null
  const bots = s.players.filter((p) => p.isBot)
  const canCallLastCard = !!me && s.phase === 'playing' && !me.announcedLastCard && me.hand.length > 0 && me.hand.length <= 2
  const playChoices = hand.filter((c) => legalIds.has(c.id))
  const shownChoices = playChoices.slice(0, 6)
  const hiddenCount = playChoices.length - shownChoices.length
  const whotCard = whotPath && myTurn ? playChoices.find((c) => c.shape === 'whot') ?? null : null
  const focus = focusId ? hand.find((c) => c.id === focusId) ?? null : null
  const lastLine = lines[lines.length - 1] ?? null
  const lastRound = s.phase === 'roundOver' ? s.lastRound : null
  const matchWinnerId = s.phase === 'matchOver' ? s.matchWinnerId : null

  const play = (cardId: string, shape?: Suit) => {
    setWhotPath(false)
    setFocusId(null)
    dispatch(ME, [{ type: 'play', cardId, requestedShape: shape }])
  }
  const draw = () => dispatch(ME, [{ type: 'draw' }])
  const callLastCard = () => dispatch(ME, [{ type: 'lastCard' }])
  const catchPlayer = (targetId: string) => dispatch(ME, [{ type: 'catch', targetId }])
  const nextRound = () => {
    const { state, events } = startNextRound(stateRef.current)
    stateRef.current = state
    setBatch({ events })
    setFocusId(null)
    setWhotPath(false)
    render()
  }
  const restart = () => {
    stateRef.current = newMatch()
    setBatch(null)
    setLines([])
    setFocusId(null)
    setWhotPath(false)
    render()
  }

  const taleOn = topCard ? (
    <>
      the <Token card={topCard} ink />
    </>
  ) : (
    'an open page'
  )

  return (
    <div className="lab8">
      <header className="lab8-top">
        <span className="lab8-mark">
          Whot Storybook <em>lab eight · a tale in five suits</em>
        </span>
        <span className="lab8-top-actions">
          <button
            type="button"
            className="lab8-toggle"
            aria-pressed={soundOn}
            onClick={() => {
              setSoundOn(!soundOn)
              setSoundEnabled(!soundOn)
            }}
          >
            sound {soundOn ? 'on' : 'off'}
          </button>
          <button type="button" className="lab8-toggle lab8-exit" onClick={() => setExitAsk(true)}>
            Exit lab8
          </button>
        </span>
      </header>

      <main className="lab8-book">
        {/* A keyed remount (enter-only page turn) instead of AnimatePresence:
            mode="wait" froze the page on a stale turn when turns changed faster
            than the exit animation. */}
        <motion.article
          key={s.turnId}
          className="lab8-page"
          initial={{ rotateY: -14, opacity: 0, x: -48 }}
          animate={{ rotateY: 0, opacity: 1, x: 0 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          aria-live="polite"
        >
          {s.phase !== 'playing' && (
            <p className="lab8-lead">The chapter closes and the book rests. Turn the page when you are ready.</p>
          )}

          {s.phase === 'playing' && !myTurn && (
            <p className="lab8-lead">
              {turnPlayer?.name} takes the quill. The tale rests on {taleOn}.
              {s.requestedShape && (
                <> Only <b>{SHAPE_NAMES[s.requestedShape]}</b> may follow the last word.</>
              )}
              {turnPlayer?.announcedLastCard && ' Their last page is showing — the ending nears.'}
            </p>
          )}

          {s.phase === 'playing' && myTurn && (
            <p className="lab8-lead">
              You are up. The tale rests on {taleOn}.
              {s.requestedShape && (
                <> The story runs on <b>{SHAPE_NAMES[s.requestedShape]}</b> — nothing else plays.</>
              )}
              {s.pendingPick && (
                <>
                  {' '}A debt of <b>{s.pendingPick.amount}</b> hangs over you: throw a <b>{s.pendingPick.number}</b> to
                  push it on, or go to market.
                </>
              )}
              {me?.announcedLastCard && ' One page remains in your hand — the ending is yours to write.'}
            </p>
          )}

          {lastLine && <p className="lab8-note">❧ {lastLine.text}</p>}

          {s.phase === 'playing' && myTurn && whotCard && (
            <p className="lab8-path">
              You hold <Token card={whotCard} ink /> — name the next chapter:{' '}
              {SUITS.map((shape, i) => (
                <span key={shape}>
                  {i > 0 && ' · '}
                  <button
                    type="button"
                    className="lab8-choice"
                    onClick={() => whotCard && play(whotCard.id, shape)}
                  >
                    <ShapeIcon shape={shape} size={12} /> {SHAPE_NAMES[shape]}
                  </button>
                </span>
              ))}{' '}
              ·{' '}
              <button type="button" className="lab8-choice muted" onClick={() => setWhotPath(false)}>
                never mind
              </button>
            </p>
          )}

          {s.phase === 'playing' && myTurn && !whotCard && (
            <div className="lab8-choices">
              {focus && (
                <p className="lab8-focus">
                  Your finger rests on <Token card={focus} ink />
                  {legalIds.has(focus.id) ? (
                    <>
                      {' — '}
                      <button
                        type="button"
                        className="lab8-choice strong"
                        onClick={() => focusId && play(focusId)}
                      >
                        play it
                      </button>
                    </>
                  ) : (
                    <span className="lab8-stale"> — it will not follow this tale.</span>
                  )}
                </p>
              )}
              <p>
                {playChoices.length > 0 ? 'Your paths: ' : 'No page in your hand will play. '}
                {shownChoices.map((card) => (
                  <button
                    key={card.id}
                    type="button"
                    className="lab8-choice"
                    onClick={() => (card.shape === 'whot' ? setWhotPath(true) : play(card.id))}
                  >
                    play <Token card={card} ink />
                  </button>
                ))}
                {hiddenCount > 0 && <span className="lab8-more"> …and {hiddenCount} more below</span>}
                {playChoices.length > 0 && ' · '}
                <button type="button" className="lab8-choice" onClick={draw}>
                  draw from the market <span className="lab8-count">({s.market.length})</span>
                </button>
                {canCallLastCard && (
                  <>
                    {' · '}
                    <button type="button" className="lab8-choice strong" onClick={callLastCard}>
                      call LAST CARD
                    </button>
                  </>
                )}
                {s.phase === 'playing' &&
                  bots
                    .filter((p) => isCatchable(p))
                    .map((p) => (
                      <span key={p.id}>
                        {' · '}
                        <button type="button" className="lab8-choice strong" onClick={() => catchPlayer(p.id)}>
                          catch {p.name}
                        </button>
                      </span>
                    ))}
              </p>
              {s.pendingPick && playChoices.length === 0 && (
                <p className="lab8-note">No {s.pendingPick.number} to defend with — the market it is.</p>
              )}
            </div>
          )}

          {s.phase === 'playing' && !myTurn && (
            <p className="lab8-wait">You wait and watch the page turn…</p>
          )}
        </motion.article>

        <aside className="lab8-margin">
          <h3>The Company</h3>
          {bots.map((p) => (
            <div key={p.id} className={`lab8-seat${turnPlayer?.id === p.id ? ' up' : ''}`}>
              <span className="lab8-seat-name">
                {turnPlayer?.id === p.id && (
                  <span className="lab8-quiv" aria-hidden>
                    ❧
                  </span>
                )}
                {p.name}
              </span>
              <span className="lab8-seat-cards">
                {p.hand.length} {p.hand.length === 1 ? 'page' : 'pages'}
                {p.announcedLastCard && <em className="lab8-stamp">last card</em>}
              </span>
            </div>
          ))}
          <p className="lab8-round">
            round {s.round} · {s.market.length} in the market
          </p>
        </aside>
      </main>

      <footer className="lab8-filmstrip" aria-label="Your pages">
        {hand.map((card) => (
          <button
            key={card.id}
            type="button"
            className={`lab8-cell${focus?.id === card.id ? ' focus' : ''}${myTurn && !legalIds.has(card.id) ? ' dim' : ''}`}
            onClick={() => setFocusId(focus?.id === card.id ? null : card.id)}
          >
            <span>{card.shape === 'whot' ? 'Whot' : card.number}</span>
            <ShapeIcon shape={card.shape} size={16} />
          </button>
        ))}
        {hand.length === 0 && <span className="lab8-wait">your hand is empty</span>}
      </footer>

      <AnimatePresence>
        {lastRound && (
          <motion.div className="lab8-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="lab8-panel">
              <p className="lab8-chapter">chapter {lastRound.round}, closed</p>
              <h2>{lastRound.winnerId === ME ? 'You check up' : `${nameOf(lastRound.winnerId)} checks up`}</h2>
              <ul className="lab8-points">
                {lastRound.hands.map((row) => {
                  const player = s.players.find((p) => p.id === row.playerId)
                  return (
                    <li key={row.playerId} className={row.playerId === lastRound.winnerId ? ' winner' : ''}>
                      <span>{player?.name ?? 'Someone'}</span>
                      <span className="pts">
                        {row.points} pts{player?.eliminated ? ' · out' : ''}
                      </span>
                    </li>
                  )
                })}
              </ul>
              <div className="lab8-panel-actions">
                <button type="button" className="lab8-btn" onClick={nextRound}>
                  Begin the next chapter
                </button>
                <button type="button" className="lab8-btn ghost" onClick={restart}>
                  Start a new story
                </button>
              </div>
            </div>
          </motion.div>
        )}
        {matchWinnerId && (
          <motion.div className="lab8-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="lab8-panel">
              <p className="lab8-chapter">the whole story, told</p>
              <h2>{matchWinnerId === ME ? 'You win the story' : `${nameOf(matchWinnerId)} wins the story`}</h2>
              <div className="lab8-panel-actions">
                <button type="button" className="lab8-btn" onClick={restart}>
                  Start a new story
                </button>
              </div>
            </div>
          </motion.div>
        )}
        {exitAsk && (
          <motion.div className="lab8-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="lab8-panel">
              <h2>Close the book?</h2>
              <p className="lab8-chapter">the tale will not be saved</p>
              <div className="lab8-panel-actions">
                <button type="button" className="lab8-btn" onClick={() => (window.location.hash = '')}>
                  Leave
                </button>
                <button type="button" className="lab8-btn ghost" onClick={() => setExitAsk(false)}>
                  Keep reading
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}