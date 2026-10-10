import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { describeEvent, type EventLine } from '../lib/events'
import { playSound, setSoundEnabled, unlockAudio, vibrate } from '../lib/sound'
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
  type GameAction,
  type GameEvent,
  type GameState,
  type Shape,
  type Suit,
} from '../types/game'
import './lab11.css'

const ME = 'me'

const SEATS: Seat[] = [
  { id: ME, name: 'ALPHA', avatar: 'lion', isBot: false },
  { id: 'bot-1', name: 'BRAVO', avatar: 'elephant', isBot: true, botLevel: 'normal' },
  { id: 'bot-2', name: 'CHARLIE', avatar: 'fox', isBot: true, botLevel: 'hard' },
  { id: 'bot-3', name: 'DELTA', avatar: 'turtle', isBot: true, botLevel: 'easy' },
]

const SETTINGS = { handSize: 7, targetScore: 100, pickDefence: 'stack' as const, turnSeconds: 0 }
const BOT_ORBITS = [95, 215, 335]

/** Wraps into [0, m) — shared by the aim math so every call site agrees. */
const mod = (n: number, m: number) => ((n % m) + m) % m

const SHAPE_ORDER: Shape[] = ['circle', 'triangle', 'cross', 'square', 'star', 'whot']

function Glyph({ shape, size = 20 }: { shape: Shape; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'currentColor',
    'aria-hidden': true as const,
  }
  switch (shape) {
    case 'circle':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8" />
        </svg>
      )
    case 'triangle':
      return (
        <svg {...common}>
          <path d="M12 3.5 21.5 20.5H2.5Z" />
        </svg>
      )
    case 'cross':
      return (
        <svg {...common}>
          <path d="M9 2h6v7h7v6h-7v7H9v-7H2V9h7Z" />
        </svg>
      )
    case 'square':
      return (
        <svg {...common}>
          <rect x="4" y="4" width="16" height="16" rx="2.5" />
        </svg>
      )
    case 'star':
      return (
        <svg {...common}>
          <path d="M12 2l2.7 6.4 6.9.6-5.2 4.5 1.6 6.7L12 16.6l-6 3.6 1.6-6.7L2.4 9l6.9-.6Z" />
        </svg>
      )
    case 'whot':
      return (
        <svg {...common}>
          <path d="M12 1l1.8 7.2L21 6.4l-4.9 5.6 4.9 5.6-7.2-1.8L12 23l-1.8-7.2L3 17.6l4.9-5.6L3 6.4l7.2 1.8Z" />
        </svg>
      )
  }
}

/**
 * Whot Radar (#/lab11) — the table is one sonar dial. The pile sits at the
 * center, the hand is a ring around it: rotate the ring until the card you
 * want clips the top pip, then press the core to fire. It runs the same
 * engine and bots offline and touches nothing in the online game.
 */
export default function Lab11() {
  const [tick, setTick] = useState(0)
  const stateRef = useRef<GameState>(
    createMatch(SEATS, SETTINGS, seededRng(Math.floor(Math.random() * 2 ** 31))),
  )
  const [batch, setBatch] = useState<{ turnId: number; events: GameEvent[] } | null>(null)
  const [lines, setLines] = useState<EventLine[]>([])
  const [soundOn, setSoundOn] = useState(true)
  const [exitAsk, setExitAsk] = useState(false)
  const [rot, setRot] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [naming, setNaming] = useState(false)
  const [deny, setDeny] = useState(false)
  const [size, setSize] = useState(0)

  const dialRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<{ id: number; start: number; startRot: number } | null>(null)
  const rotRef = useRef(0)

  const s = stateRef.current
  const render = useCallback(() => setTick((n) => n + 1), [])

  const applyRot = useCallback((v: number) => {
    rotRef.current = v
    setRot(v)
  }, [])

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
    (id: string) => stateRef.current.players.find((p) => p.id === id)?.name ?? 'SOMEONE',
    [],
  )

  // Bots take their turn a beat after they are dealt it, falling back to
  // the market the same way the online table does.
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
      let moved = false
      for (const action of chooseBotMove(fresh, player.id, seededRng((Date.now() % 2 ** 31) | 0))) {
        const result = applyAction(state, player.id, action)
        if (!result.ok) break
        state = result.state
        moved = true
        events.push(...result.events)
      }
      // Nothing played (no legal card): go to market. A round-ending move
      // leaves turnId untouched, so it must still be committed here.
      if (!moved) {
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

  // A bot pounces when the human forgets to call last card.
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
          if (event.result.winnerId === ME) vibrate([30, 60, 30])
          break
        case 'matchOver':
          playSound(event.winnerId === ME ? 'win' : 'lose')
          break
      }
    }
  }, [batch, nameOf])

  // The dial reports its size so orbits can be laid out in pixels.
  useEffect(() => {
    const el = dialRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width
      if (w) setSize(w)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const me = s.players.find((p) => p.id === ME)
  const turnPlayer = s.phase === 'playing' ? currentPlayer(s) : null
  const myTurn = s.phase === 'playing' && turnPlayer?.id === ME
  const ctx = useMemo(() => playContext(s), [tick]) // eslint-disable-line react-hooks/exhaustive-deps
  const hand = useMemo(
    () =>
      me
        ? [...me.hand].sort(
            (a, b) => SHAPE_ORDER.indexOf(a.shape) - SHAPE_ORDER.indexOf(b.shape) || a.number - b.number,
          )
        : [],
    [tick], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const legalIds = useMemo(() => {
    if (!myTurn || !me) return new Set<string>()
    return new Set(me.hand.filter((c) => canPlayCard(c, ctx)).map((c) => c.id))
  }, [myTurn, me, ctx, tick]) // eslint-disable-line react-hooks/exhaustive-deps

  const handLen = hand.length
  const step = handLen > 0 ? 360 / handLen : 360
  const aimedIndex = handLen > 0 ? mod(Math.round(mod(-rot, 360) / step), handLen) : -1
  const aimedCard = aimedIndex >= 0 ? hand[aimedIndex] : null
  const aimedLegal = !!aimedCard && legalIds.has(aimedCard.id)

  // Keep a card parked exactly under the pip whenever the hand size changes.
  useEffect(() => {
    if (handLen === 0) return
    const stp = 360 / handLen
    const cur = rotRef.current
    const idx = mod(Math.round(mod(-cur, 360) / stp), handLen)
    const base = -idx * stp
    applyRot(base + Math.round((cur - base) / 360) * 360)
  }, [handLen, applyRot])

  // Naming a shape clears as soon as the turn moves on.
  useEffect(() => {
    setNaming(false)
  }, [s.turnId])

  const topCard = s.pile[s.pile.length - 1] ?? null
  const opponents = s.players.filter((p) => p.id !== ME)
  const pendingPickMine = !!s.pendingPick && myTurn && legalIds.size === 0
  const canCallLastCard = !!me && s.phase === 'playing' && !me.announcedLastCard && me.hand.length > 0 && me.hand.length <= 2

  const handR = size * 0.335
  const whotR = size * 0.27

  const angleAt = (clientX: number, clientY: number): number => {
    const el = dialRef.current
    if (!el) return 0
    const r = el.getBoundingClientRect()
    const deg = (Math.atan2(clientY - (r.top + r.height / 2), clientX - (r.left + r.width / 2)) * 180) / Math.PI
    return deg + 90
  }

  const onDialDown = (e: React.PointerEvent<HTMLDivElement>) => {
    unlockAudio()
    if (s.phase !== 'playing') return
    if (naming) {
      setNaming(false)
      return
    }
    const el = dialRef.current
    if (!el) return
    dragRef.current = { id: e.pointerId, start: angleAt(e.clientX, e.clientY), startRot: rotRef.current }
    el.setPointerCapture(e.pointerId)
    setDragging(true)
  }

  const onDialMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current
    if (!d || e.pointerId !== d.id) return
    const delta = mod(angleAt(e.clientX, e.clientY) - d.start + 180, 360) - 180
    applyRot(d.startRot + delta)
  }

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current
    if (!d || e.pointerId !== d.id) return
    dragRef.current = null
    setDragging(false)
    if (handLen > 0) {
      const cur = rotRef.current
      const idx = mod(Math.round(mod(-cur, 360) / step), handLen)
      const base = -idx * step
      applyRot(base + Math.round((cur - base) / 360) * 360)
    }
  }

  const flashDeny = () => {
    playSound('error')
    vibrate(40)
    setDeny(true)
    window.setTimeout(() => setDeny(false), 430)
  }

  const fire = () => {
    if (s.phase !== 'playing' || !myTurn) return
    if (naming) {
      setNaming(false)
      return
    }
    if (!aimedCard) return
    if (!aimedLegal) {
      flashDeny()
      return
    }
    if (aimedCard.shape === 'whot') {
      setNaming(true)
      playSound('tap')
      return
    }
    dispatch(ME, [{ type: 'play', cardId: aimedCard.id }])
  }

  const nameShape = (shape: Suit) => {
    if (!aimedCard) return
    setNaming(false)
    dispatch(ME, [{ type: 'play', cardId: aimedCard.id, requestedShape: shape }])
  }

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
    stateRef.current = createMatch(SEATS, SETTINGS, seededRng(Math.floor(Math.random() * 2 ** 31)))
    setBatch(null)
    setLines([])
    setNaming(false)
    applyRot(0)
    render()
  }

  const statusText =
    s.phase === 'roundOver'
      ? 'ROUND SETTLED'
      : s.phase === 'matchOver'
        ? 'MATCH SETTLED'
        : myTurn
          ? s.pendingPick && pendingPickMine
            ? `TAKE ${s.pendingPick.amount} — TAP MARKET`
            : 'YOUR MOVE — ROTATE · FIRE'
          : `${turnPlayer?.name ?? 'TABLE'} MOVING…`

  const dialClass = ['lab11-dial', dragging ? 'dragging' : '', naming ? 'naming' : '', handLen > 10 ? 'crowded' : '']
    .filter(Boolean)
    .join(' ')

  return (
    <div className="lab11">
      <header className="lab11-top">
        <div className="lab11-mark">
          WHOT·RADAR
          <small>lab11 · rotate the ring · fire at the pip</small>
        </div>
        <span className={`lab11-status${myTurn ? ' mine' : ''}`}>{statusText}</span>
        <div className="lab11-actions">
          <button
            type="button"
            className="lab11-toggle"
            aria-pressed={soundOn}
            onClick={() => {
              setSoundOn(!soundOn)
              setSoundEnabled(!soundOn)
            }}
          >
            {soundOn ? 'SND ON' : 'SND OFF'}
          </button>
          <button type="button" className="lab11-toggle exit" onClick={() => setExitAsk(true)}>
            EXIT LAB11
          </button>
        </div>
      </header>

      <section className="lab11-stage">
        <div
          className={dialClass}
          ref={dialRef}
          onPointerDown={onDialDown}
          onPointerMove={onDialMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <span className="lab11-sweep" aria-hidden />
          <span className="lab11-ring r1" aria-hidden />
          <span className="lab11-ring r2" aria-hidden />
          <span className="lab11-ring r3" aria-hidden />
          <span className="lab11-axis lab11-axis-h" aria-hidden />
          <span className="lab11-axis lab11-axis-v" aria-hidden />
          {s.phase === 'playing' && <span key={`ping-${s.turnId}`} className="lab11-ping" aria-hidden />}
          <span className="lab11-aim" aria-hidden />

          {opponents.map((p, i) => {
            const r = size * (0.16 + 0.07 * (Math.min(p.hand.length, 10) / 10))
            const a = BOT_ORBITS[i % BOT_ORBITS.length]
            const catchable = s.phase === 'playing' && isCatchable(p)
            return (
              <button
                key={p.id}
                type="button"
                className={`lab11-bot${turnPlayer?.id === p.id ? ' active' : ''}${catchable ? ' catchable' : ''}`}
                style={{
                  transform: `translate(-50%,-50%) rotate(${a}deg) translateY(-${r}px) rotate(${-a}deg)`,
                }}
                onPointerDown={(e) => {
                  e.stopPropagation()
                  if (catchable) catchPlayer(p.id)
                }}
              >
                <span className="lab11-bot-dot" />
                <span className="lab11-bot-tag">
                  {p.name}·{p.hand.length}
                  {p.announcedLastCard ? '·LC' : ''}
                </span>
              </button>
            )
          })}

          {hand.map((card, i) => {
            const a = i * step + rot
            const cls = [
              'lab11-hcard',
              legalIds.has(card.id) ? 'legal' : 'off',
              i === aimedIndex ? 'aimed' : '',
            ]
              .filter(Boolean)
              .join(' ')
            return (
              <div
                key={card.id}
                className={cls}
                style={{
                  transform: `translate(-50%,-50%) rotate(${a}deg) translateY(-${handR}px) rotate(${-a}deg)${
                    i === aimedIndex ? ' scale(1.16)' : ''
                  }`,
                }}
              >
                <span className="lab11-cnum">{card.number}</span>
                <Glyph shape={card.shape} size={card.shape === 'whot' ? 15 : 20} />
                {card.shape === 'whot' && <span className="lab11-cw">WHOT</span>}
              </div>
            )
          })}

          <button
            type="button"
            className={`lab11-core${myTurn && aimedLegal ? ' ready' : ''}${deny ? ' deny' : ''}`}
            disabled={s.phase !== 'playing' || !myTurn}
            onPointerDown={(e) => {
              e.stopPropagation()
              fire()
            }}
            aria-label="Fire the aimed card"
          >
            {topCard ? (
              <>
                <Glyph shape={topCard.shape} size={24} />
                <span className="lab11-core-num">{topCard.number}</span>
              </>
            ) : (
              <span className="lab11-core-num">OPEN</span>
            )}
            <span className="lab11-core-pile">{s.pile.length}</span>
          </button>

          {naming && aimedCard?.shape === 'whot' && (
            <span className="lab11-req">NAME THE SHAPE</span>
          )}
          {naming &&
            aimedCard?.shape === 'whot' &&
            SUITS.map((shape, i) => {
              const a = i * 72 - 90
              return (
                <button
                  key={shape}
                  type="button"
                  className="lab11-blip"
                  style={{
                    transform: `translate(-50%,-50%) rotate(${a}deg) translateY(-${whotR}px) rotate(${-a}deg)`,
                  }}
                  onPointerDown={(e) => {
                    e.stopPropagation()
                    nameShape(shape)
                  }}
                >
                  <Glyph shape={shape} size={14} />
                  <span>{SHAPE_NAMES[shape].toUpperCase().slice(0, 3)}</span>
                </button>
              )
            })}

          {s.requestedShape && (
            <span className="lab11-req">LOCK ▸ {SHAPE_NAMES[s.requestedShape].toUpperCase()}</span>
          )}

          <button
            type="button"
            className={`lab11-market${pendingPickMine ? ' urge' : ''}`}
            disabled={!myTurn}
            onPointerDown={(e) => {
              e.stopPropagation()
              draw()
            }}
            aria-label="Go to market"
          >
            <span>MARKET {s.market.length}</span>
            {s.pendingPick && pendingPickMine && <span className="lab11-take">TAKE {s.pendingPick.amount}</span>}
          </button>
        </div>

        <div className="lab11-readout">
          {`TRK ▸ ${
            aimedCard ? `${SHAPE_NAMES[aimedCard.shape].toUpperCase()}·${aimedCard.number}` : '——'
          } · ${aimedLegal ? 'FIRE READY' : 'NO PLAY'}`}
        </div>
      </section>

      <footer className="lab11-foot">
        <div className="lab11-ticker" aria-live="polite">
          {lines.slice(-3).map((line, i) => (
            <span key={`${line.text}-${lines.length - i}`} className={`lab11-line ${line.tone}`}>
              {line.text}
            </span>
          ))}
        </div>
        <div className="lab11-meta">
          {canCallLastCard && (
            <button type="button" className="lab11-chip" onClick={callLastCard}>
              CALL LAST CARD
            </button>
          )}
          <span>
            HAND {handLen} · RD {s.round}
          </span>
        </div>
      </footer>

      {s.phase === 'roundOver' && s.lastRound && (
        <div className="lab11-overlay">
          <div className="lab11-panel">
            <h2>{s.lastRound.winnerId === ME ? 'YOU CHECK UP' : `${nameOf(s.lastRound.winnerId)} CHECKS UP`}</h2>
            <p className="sub">round {s.lastRound.round} · pile swept</p>
            <div className="lab11-rows">
              {s.lastRound.hands.map((row) => {
                const player = s.players.find((q) => q.id === row.playerId)
                return (
                  <div
                    key={row.playerId}
                    className={`lab11-row${row.playerId === s.lastRound?.winnerId ? ' win' : ''}`}
                  >
                    <span>{player?.name ?? row.playerId}</span>
                    <span>
                      {row.points} PTS{player?.eliminated ? ' · OUT' : ''}
                    </span>
                  </div>
                )
              })}
            </div>
            <div className="lab11-btns">
              <button type="button" className="lab11-btn" onClick={nextRound}>
                NEXT ROUND
              </button>
              <button type="button" className="lab11-btn ghost" onClick={restart}>
                NEW MATCH
              </button>
            </div>
          </div>
        </div>
      )}

      {s.phase === 'matchOver' && s.matchWinnerId && (
        <div className="lab11-overlay">
          <div className="lab11-panel">
            <h2>{s.matchWinnerId === ME ? 'YOU WIN THE MATCH' : `${nameOf(s.matchWinnerId)} WINS THE MATCH`}</h2>
            <p className="sub">signal lost · match settled</p>
            <div className="lab11-btns">
              <button type="button" className="lab11-btn" onClick={restart}>
                NEW MATCH
              </button>
            </div>
          </div>
        </div>
      )}

      {exitAsk && (
        <div className="lab11-overlay">
          <div className="lab11-panel">
            <h2>LEAVE THE CONSOLE?</h2>
            <p className="sub">the experiment table will not be saved</p>
            <div className="lab11-btns">
              <button type="button" className="lab11-btn" onClick={() => (window.location.hash = '')}>
                LEAVE
              </button>
              <button type="button" className="lab11-btn ghost" onClick={() => setExitAsk(false)}>
                KEEP PLAYING
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}