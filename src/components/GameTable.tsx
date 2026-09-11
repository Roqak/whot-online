import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import confetti from 'canvas-confetti'
import { ArrowDownUp, Check, Copy, HelpCircle, LogOut, Smile, Volume2, VolumeX } from 'lucide-react'
import { useGameStore } from '../store/gameStore'
import { REACTIONS } from '../net/protocol'
import {
  GameEvent,
  GameView,
  SHAPE_NAMES,
  SUITS,
  Suit,
  canPlayCard,
  cardLabel,
  isSpecial,
} from '../types/game'
import { sortHand } from '../lib/hand'
import { useCountdown, useOnChange } from '../lib/hooks'
import { playSound, vibrate } from '../lib/sound'
import { Avatar } from './Avatar'
import { ShapeIcon } from './cards/shapes'
import { Announcement, Announcer } from './game/Announcer'
import { OpponentSeat } from './game/OpponentSeat'
import { PlayerHand } from './game/PlayerHand'
import { RoundOverlay } from './game/RoundOverlay'
import { RulesSheet } from './game/RulesSheet'
import { TableCenter } from './game/TableCenter'
import { TurnRing } from './game/TurnRing'

export default function GameTable() {
  const game = useGameStore((s) => s.game)
  if (!game) return null
  return <Table view={game} />
}

function Table({ view }: { view: GameView }) {
  const pendingCardId = useGameStore((s) => s.pendingCardId)
  const handSort = useGameStore((s) => s.handSort)
  const soundOn = useGameStore((s) => s.soundOn)
  const lastBatch = useGameStore((s) => s.lastBatch)
  const reactions = useGameStore((s) => s.reactions)
  const hostId = useGameStore((s) => s.lobby?.hostId)
  const playCard = useGameStore((s) => s.playCard)
  const drawCard = useGameStore((s) => s.drawCard)
  const callLastCard = useGameStore((s) => s.callLastCard)
  const catchPlayer = useGameStore((s) => s.catchPlayer)
  const nextRound = useGameStore((s) => s.nextRound)
  const backToLobby = useGameStore((s) => s.backToLobby)
  const leaveRoom = useGameStore((s) => s.leaveRoom)
  const react = useGameStore((s) => s.react)
  const cycleHandSort = useGameStore((s) => s.cycleHandSort)
  const toggleSound = useGameStore((s) => s.toggleSound)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [shapeFor, setShapeFor] = useState<string | null>(null)
  const [shakeId, setShakeId] = useState<string | null>(null)
  const [showRules, setShowRules] = useState(false)
  const [showReactions, setShowReactions] = useState(false)
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [copied, setCopied] = useState(false)
  const [queue, setQueue] = useState<Announcement[]>([])
  const announcementId = useRef(0)
  const [size, setSize] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }))

  useEffect(() => {
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const me = view.players.find((p) => p.id === view.myId)
  const opponents = useMemo(() => view.players.filter((p) => p.id !== view.myId), [view.players, view.myId])
  const isMyTurn = view.phase === 'playing' && view.turnPlayerId === view.myId
  const interactive = isMyTurn && !pendingCardId

  const hand = useMemo(
    () => sortHand(view.myHand.filter((c) => c.id !== pendingCardId), handSort),
    [view.myHand, pendingCardId, handSort],
  )
  const pile = useMemo(() => {
    const optimistic = pendingCardId ? view.myHand.find((c) => c.id === pendingCardId) : null
    return optimistic ? [...view.pile, optimistic] : view.pile
  }, [view.pile, view.myHand, pendingCardId])

  const playableIds = useMemo(() => {
    if (!interactive) return new Set<string>()
    const ctx = {
      topCard: pile[pile.length - 1] ?? null,
      requestedShape: view.requestedShape,
      pendingPick: view.pendingPick,
      stackPicks: view.settings.stackPicks,
    }
    return new Set(hand.filter((c) => canPlayCard(c, ctx)).map((c) => c.id))
  }, [interactive, hand, pile, view.requestedShape, view.pendingPick, view.settings.stackPicks])

  const countdown = useCountdown(view.deadline, `${view.phase}-${view.turnId}`)
  // The hand gets a fixed slice of the screen, and cards are sized to fit inside it.
  const handAreaHeight = Math.round(Math.min(208, Math.max(118, size.h * 0.24)))
  const cardWidth = Math.round(Math.max(52, Math.min(96, size.w / 5.4, (handAreaHeight - 28) / 1.4)))
  const pileWidth = Math.round(cardWidth * 1.3)

  const nameOf = useCallback(
    (id: string) => view.players.find((p) => p.id === id)?.name ?? 'Someone',
    [view.players],
  )

  const announce = useCallback((text: string, tone: Announcement['tone'] = 'neutral') => {
    setQueue((q) => [...q, { id: ++announcementId.current, text, tone }].slice(-5))
  }, [])

  // Drain announcements one at a time.
  useEffect(() => {
    if (queue.length === 0) return
    const timer = setTimeout(() => setQueue((q) => q.slice(1)), queue.length > 2 ? 850 : 1500)
    return () => clearTimeout(timer)
  }, [queue])

  // Turn into sound, vibration and words whatever just happened.
  useEffect(() => {
    if (!lastBatch) return
    const mine = (id: string) => id === view.myId
    for (const event of lastBatch.events as GameEvent[]) {
      switch (event.type) {
        case 'played':
          playSound(isSpecial(event.card) ? 'special' : 'play')
          break
        case 'shapeRequested':
          announce(`${nameOf(event.playerId)} asks for ${SHAPE_NAMES[event.shape]}`)
          break
        case 'holdOn':
          announce(`${nameOf(event.playerId)} holds on`)
          break
        case 'suspended':
          announce(mine(event.targetId) ? 'You are suspended' : `${nameOf(event.targetId)} is suspended`, 'bad')
          break
        case 'pick':
          playSound('pick')
          announce(mine(event.targetId) ? `Pick ${event.amount}!` : `${nameOf(event.targetId)} picks ${event.amount}`, mine(event.targetId) ? 'bad' : 'neutral')
          break
        case 'generalMarket':
          announce('General market: everybody picks one', 'bad')
          break
        case 'drew':
          playSound('draw')
          if (event.reason === 'timeout') announce(`${nameOf(event.playerId)} ran out of time`)
          break
        case 'lastCard':
          playSound('lastCard')
          announce(`${mine(event.playerId) ? 'You' : nameOf(event.playerId)}: last card!`, 'good')
          if (!mine(event.playerId)) vibrate(20)
          break
        case 'caught':
          playSound('caught')
          vibrate([30, 40, 30])
          announce(`${nameOf(event.byId)} caught ${mine(event.targetId) ? 'you' : nameOf(event.targetId)}`, mine(event.targetId) ? 'bad' : 'good')
          break
        case 'reshuffled':
          playSound('shuffle')
          announce('Market reshuffled')
          break
        case 'playerLeft':
          announce(`${nameOf(event.playerId)} left the table`)
          break
        case 'roundStarted':
          playSound('shuffle')
          announce(`Round ${event.round}`)
          break
        case 'roundOver':
          playSound(mine(event.result.winnerId) ? 'win' : 'lose')
          if (mine(event.result.winnerId)) celebrate()
          break
        case 'matchOver':
          if (mine(event.winnerId)) {
            celebrate(true)
            playSound('win')
          }
          break
      }
    }
  }, [lastBatch, nameOf, announce, view.myId])

  useOnChange(view.turnId, () => {
    setSelectedId(null)
    setShapeFor(null)
    if (view.turnPlayerId === view.myId && view.phase === 'playing') {
      playSound('turn')
      vibrate(25)
    }
  })

  const activate = (cardId: string) => {
    if (!interactive) return
    if (!playableIds.has(cardId)) {
      playSound('error')
      setShakeId(cardId)
      setTimeout(() => setShakeId(null), 400)
      return
    }
    if (selectedId !== cardId) {
      setSelectedId(cardId)
      playSound('tap')
      return
    }
    const card = hand.find((c) => c.id === cardId)
    if (!card) return
    if (card.shape === 'whot') {
      setShapeFor(cardId)
      return
    }
    playCard(cardId)
    setSelectedId(null)
  }

  const chooseShape = (shape: Suit) => {
    if (!shapeFor) return
    playCard(shapeFor, shape)
    setShapeFor(null)
    setSelectedId(null)
  }

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/r/${codeFromUrl()}`)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      // Clipboard blocked: the code is on screen anyway.
    }
  }

  const entryOffset = useMemo(() => {
    if (pendingCardId) return { x: 0, y: 150 }
    const played = [...(lastBatch?.events ?? [])].reverse().find((e) => e.type === 'played')
    if (!played || played.type !== 'played') return { x: 0, y: -120 }
    if (played.playerId === view.myId) return { x: 0, y: 150 }
    const index = opponents.findIndex((p) => p.id === played.playerId)
    return { x: (index - (opponents.length - 1) / 2) * 110, y: -140 }
  }, [lastBatch, pendingCardId, opponents, view.myId])

  const myCount = hand.length
  const canCallLastCard = !!me && view.phase === 'playing' && !me.eliminated && myCount <= 2 && myCount > 0 && !me.announcedLastCard
  const nudgeMarket = interactive && playableIds.size === 0
  const selectedCard = hand.find((c) => c.id === selectedId) ?? null
  const roundSeconds = Math.ceil(countdown.remainingMs / 1000)

  return (
    <div className="relative mx-auto flex h-full w-full max-w-3xl flex-col overflow-hidden">
      <header className="z-20 flex shrink-0 items-center justify-between gap-2 px-3 py-2 pad-safe-top">
        <div className="flex items-center gap-1">
          {confirmLeave ? (
            <div className="flex items-center gap-1 rounded-lg bg-table-900 p-1 text-xs">
              <span className="px-1 text-fg-muted">Leave game?</span>
              <button className="rounded-md bg-ember px-2 py-1 font-semibold text-table-950" onClick={leaveRoom}>
                Leave
              </button>
              <button className="rounded-md px-2 py-1 text-fg-muted" onClick={() => setConfirmLeave(false)}>
                Stay
              </button>
            </div>
          ) : (
            <>
              <button className="btn-icon" onClick={() => setConfirmLeave(true)} aria-label="Leave game">
                <LogOut size={18} />
              </button>
              <button
                className="chip text-xs text-fg-faint hover:text-fg"
                onClick={copyCode}
                aria-label="Copy the room link"
              >
                {copied ? <Check size={13} className="text-leaf" /> : <Copy size={13} />}
                {codeFromUrl()}
              </button>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="chip bg-table-800/70 text-[11px] text-fg-muted">
            Round {view.round}
            {view.settings.targetScore > 0 && <span className="text-fg-faint">· to {view.settings.targetScore}</span>}
          </span>
          <button className="btn-icon" onClick={toggleSound} aria-label={soundOn ? 'Mute sound' : 'Unmute sound'}>
            {soundOn ? <Volume2 size={17} /> : <VolumeX size={17} />}
          </button>
          <button className="btn-icon" onClick={() => setShowRules(true)} aria-label="How to play">
            <HelpCircle size={17} />
          </button>
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1 flex-col">
        <Announcer item={queue[0] ?? null} />

        <div className="flex shrink-0 flex-wrap items-start justify-center gap-1 px-2">
          {opponents.map((player) => (
            <OpponentSeat
              key={player.id}
              player={player}
              onTurn={view.turnPlayerId === player.id && view.phase === 'playing'}
              fraction={view.turnPlayerId === player.id ? countdown.fraction : 0}
              urgent={countdown.remainingMs > 0 && countdown.remainingMs < 6000}
              catchable={
                view.phase === 'playing' && !player.eliminated && player.handCount === 1 && !player.announcedLastCard
              }
              onCatch={() => catchPlayer(player.id)}
            />
          ))}
        </div>

        <div className="relative flex min-h-0 flex-1 items-center justify-center px-3">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-4 top-1/2 -translate-y-1/2 rounded-[50%] border border-fg/[0.06] bg-fg/[0.015]"
            style={{ height: 'min(62%, 340px)' }}
          />
          <TableCenter
            pile={pile}
            marketCount={view.marketCount}
            requestedShape={view.requestedShape}
            pendingPick={view.pendingPick}
            canDraw={interactive}
            nudgeMarket={nudgeMarket}
            onDraw={() => {
              setSelectedId(null)
              drawCard()
            }}
            entryOffset={entryOffset}
            cardWidth={pileWidth}
          />
        </div>

        <ReactionBubbles reactions={reactions} nameOf={nameOf} />

        <AnimatePresence>
          {view.phase !== 'playing' && (
            <RoundOverlay
              view={view}
              isHost={hostId === view.myId}
              secondsLeft={view.phase === 'roundOver' ? roundSeconds : 0}
              onNextRound={nextRound}
              onBackToLobby={backToLobby}
              onLeave={leaveRoom}
            />
          )}
        </AnimatePresence>
      </div>

      <div className="z-10 shrink-0 px-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <div className="relative" style={{ width: 34, height: 34 }}>
              <Avatar id={me?.avatar ?? 'lion'} size={34} />
              <TurnRing size={34} fraction={countdown.fraction} active={isMyTurn} urgent={countdown.remainingMs < 6000} />
            </div>
            <p className={`truncate text-xs ${isMyTurn ? 'font-semibold text-marigold' : 'text-fg-faint'}`}>
              {view.phase !== 'playing'
                ? 'Round over'
                : isMyTurn
                  ? view.pendingPick
                    ? `Defend or pick ${view.pendingPick.amount}`
                    : nudgeMarket
                      ? 'No match: go to market'
                      : 'Your turn'
                  : `${nameOf(view.turnPlayerId)} is playing`}
            </p>
          </div>

          <div className="flex items-center gap-1">
            {canCallLastCard && (
              <motion.button
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                onClick={() => {
                  callLastCard()
                  playSound('lastCard')
                }}
                className="rounded-full bg-marigold px-3 py-1.5 text-xs font-bold text-table-950"
              >
                Last card
              </motion.button>
            )}
            <button className="btn-icon" onClick={cycleHandSort} aria-label={`Sort hand by ${handSort}`} title={`Sort: ${handSort}`}>
              <ArrowDownUp size={16} />
            </button>
            <button className="btn-icon" onClick={() => setShowReactions((v) => !v)} aria-label="Send a reaction">
              <Smile size={17} />
            </button>
          </div>
        </div>

        <AnimatePresence>
          {showReactions && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              className="mt-1 flex justify-end gap-1"
            >
              {REACTIONS.map((emoji) => (
                <button
                  key={emoji}
                  className="rounded-lg bg-table-800/80 px-2 py-1 text-lg"
                  onClick={() => {
                    react(emoji)
                    setShowReactions(false)
                  }}
                >
                  {emoji}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {shapeFor ? (
            <motion.div
              key="shapes"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              className="mt-2 flex items-center justify-center gap-2 rounded-2xl bg-table-900/90 p-2 ring-1 ring-table-600/60"
            >
              <span className="pl-1 text-xs text-fg-muted">Ask for</span>
              {SUITS.map((shape) => (
                <button
                  key={shape}
                  onClick={() => chooseShape(shape)}
                  className="grid h-11 w-11 place-items-center rounded-xl bg-paper text-ink transition-transform active:scale-95"
                  aria-label={SHAPE_NAMES[shape]}
                >
                  <ShapeIcon shape={shape} size={20} />
                </button>
              ))}
              <button className="btn-icon" onClick={() => setShapeFor(null)} aria-label="Cancel">
                ✕
              </button>
            </motion.div>
          ) : selectedCard ? (
            <motion.p
              key="hint"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="mt-2 text-center text-[11px] text-fg-faint"
            >
              Tap {cardLabel(selectedCard)} again, or flick it up, to play
            </motion.p>
          ) : null}
        </AnimatePresence>
      </div>

      <div className="shrink-0 px-2 pad-safe-bottom" style={{ height: handAreaHeight }}>
        <PlayerHand
          cards={hand}
          playableIds={playableIds}
          selectedId={selectedId}
          shakeId={shakeId}
          interactive={interactive}
          cardWidth={cardWidth}
          onActivate={activate}
        />
      </div>

      <RulesSheet open={showRules} onClose={() => setShowRules(false)} settings={view.settings} />
    </div>
  )
}

function ReactionBubbles({
  reactions,
  nameOf,
}: {
  reactions: { key: number; playerId: string; emoji: string }[]
  nameOf: (id: string) => string
}) {
  return (
    <div className="pointer-events-none absolute bottom-2 left-1/2 z-20 -translate-x-1/2">
      {reactions.map((reaction, i) => (
        <span
          key={reaction.key}
          className="absolute bottom-0 left-0 flex animate-rise items-center gap-1 whitespace-nowrap rounded-full bg-table-900/80 px-2 py-1 text-sm"
          style={{ transform: `translateX(${(i % 3) * 40 - 40}px)` }}
        >
          {reaction.emoji}
          <span className="text-[10px] text-fg-faint">{nameOf(reaction.playerId)}</span>
        </span>
      ))}
    </div>
  )
}

function codeFromUrl(): string {
  return window.location.pathname.replace('/r/', '').toUpperCase()
}

function celebrate(big = false) {
  const count = big ? 160 : 70
  confetti({
    particleCount: count,
    spread: big ? 100 : 70,
    origin: { y: 0.65 },
    colors: ['#f2c14e', '#e2725b', '#f6efe2', '#6c7ae0'],
    disableForReducedMotion: true,
  })
}
