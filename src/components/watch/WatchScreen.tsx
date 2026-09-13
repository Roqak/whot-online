import { Component, ReactNode, Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import confetti from 'canvas-confetti'
import { Check, Copy, Eye, LayoutGrid, Loader2, LogOut, Orbit, Rows3, Share2, Trophy, UserSquare2 } from 'lucide-react'
import QRCode from 'qrcode'
import { toast } from 'sonner'
import { useGameStore } from '../../store/gameStore'
import { REACTIONS, watchUrl } from '../../net/protocol'
import { describeEvent } from '../../lib/events'
import { copyText, shareOrCopy } from '../../lib/share'
import { useCountdown } from '../../lib/hooks'
import { playSound, setSoundEnabled } from '../../lib/sound'
import { Avatar } from '../Avatar'
import { WhotCard } from '../cards/WhotCard'
import { fromEvents, splashFor, splashTone } from './highlights'
import type { Highlight } from './highlights'
import type { CameraPreset } from './Table3D'

const Table3D = lazy(() => import('./Table3D'))

/** If the 3D scene fails to load or start on this device, keep the game watchable. */
class SceneBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    console.error('[whot] the 3D table could not start', error)
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

function hasWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas')
    return !!(canvas.getContext('webgl2') ?? canvas.getContext('webgl'))
  } catch {
    return false
  }
}

interface FeedLine {
  id: number
  text: string
  tone: 'neutral' | 'good' | 'bad'
}

export default function WatchScreen() {
  const code = useGameStore((s) => s.watching)
  const lobby = useGameStore((s) => s.lobby)
  const game = useGameStore((s) => s.game)
  const lastBatch = useGameStore((s) => s.lastBatch)
  const cheers = useGameStore((s) => s.cheers)
  const cheer = useGameStore((s) => s.cheer)
  const leaveRoom = useGameStore((s) => s.leaveRoom)
  const status = useGameStore((s) => s.status)

  const [preset, setPreset] = useState<CameraPreset>('table')
  const [spin, setSpin] = useState(true)
  const [seatIndex, setSeatIndex] = useState(0)
  const [target, setTarget] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [feed, setFeed] = useState<FeedLine[]>([])
  const feedId = useRef(0)
  const [highlights, setHighlights] = useState<Highlight[]>([])
  const highlightId = useRef(0)
  const [showQr, setShowQr] = useState(false)
  const [qrData, setQrData] = useState<string | null>(null)
  const [muted, setMuted] = useState(false)

  const [sceneStalled, setSceneStalled] = useState(false)
  const webgl = useMemo(hasWebGL, [])
  const reducedMotion = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  )

  const players = useMemo(() => game?.players ?? [], [game?.players])
  const nameOf = useCallback(
    (id: string) => players.find((p) => p.id === id)?.name ?? lobby?.members.find((m) => m.id === id)?.name ?? 'Someone',
    [players, lobby],
  )

  useEffect(() => {
    if (!lastBatch) return
    const lines = lastBatch.events
      .map((event) => describeEvent(event, { nameOf, myId: null, verbose: true }))
      .filter((line): line is { text: string; tone: 'neutral' | 'good' | 'bad' } => line !== null)
      .map((line) => ({ id: ++feedId.current, text: line.text, tone: line.tone }))
    if (lines.length > 0) setFeed((prev) => [...prev, ...lines].slice(-14))
    setHighlights((prev) => [...prev, ...fromEvents(lastBatch.events, highlightId.current)].slice(-12))
    // Watch mode gets the same sound bed as the table, driven purely by events.
    for (const event of lastBatch.events) {
      switch (event.type) {
        case 'played':
          playSound('play')
          break
        case 'pick':
          playSound('pick')
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
        case 'reshuffled':
        case 'roundStarted':
          playSound('shuffle')
          break
        case 'roundOver':
          playSound('win')
          break
        case 'matchOver':
          playSound('win')
          break
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastBatch])

  const copyLink = async () => {
    if (!code) return
    const ok = await copyText(watchUrl(code))
    setCopied(ok)
    if (ok) setTimeout(() => setCopied(false), 1800)
    else toast('Copy failed. The link is in your address bar.')
  }

  const shareLink = async () => {
    if (!code) return
    await shareOrCopy('Watch this Whot table live in 3D', watchUrl(code))
  }

  useEffect(() => {
    if (!showQr || !code) return
    let alive = true
    QRCode.toDataURL(watchUrl(code), { margin: 1, width: 320, color: { dark: '#14162e', light: '#f6efe2' } })
      .then((url) => {
        if (alive) setQrData(url)
      })
      .catch(() => setQrData(null))
    return () => {
      alive = false
    }
  }, [showQr, code])

  const toggleMute = () => {
    setMuted((m) => {
      setSoundEnabled(m) // unmuting when m was true
      if (!m) return true
      // Play a tick on the way back up, after sound is re-enabled.
      setTimeout(() => playSound('tap'), 0)
      return false
    })
  }

  const sendCheer = (emoji: (typeof REACTIONS)[number]) => {
    if (muted) {
      setMuted(false)
      setSoundEnabled(true)
    }
    cheer(emoji, target ?? undefined)
  }

  const cycleSeat = () => {
    if (players.length === 0) return
    setSeatIndex((i) => (i + 1) % players.length)
    setPreset('seat')
    setSpin(false)
  }

  const countdown = useCountdown(game?.deadline ?? null, game ? `${game.phase}-${game.turnId}` : 'idle')
  const winnerId = game?.phase === 'matchOver' ? game.matchWinnerId : game?.lastRound?.winnerId ?? null
  // The centre callout derives from the latest one-shot highlight.
  const latest = highlights[highlights.length - 1]
  const splash = useMemo(() => {
    if (!latest) return null
    const text = splashFor(latest)
    return text ? { text, tone: splashTone(latest), seq: latest.id } : null
  }, [latest])

  // Presentation moment: the champion gets confetti, always.
  const celebrated = useRef<string | null>(null)
  useEffect(() => {
    if (!winnerId || game?.phase === 'playing') return
    if (celebrated.current === `${game?.round}:${winnerId}`) return
    celebrated.current = `${game?.round}:${winnerId}`
    if (!reducedMotion) {
      confetti({
        particleCount: 160,
        spread: 110,
        origin: { y: 0.55 },
        colors: ['#f2c14e', '#e2725b', '#f6efe2', '#6c7ae0'],
        disableForReducedMotion: true,
      })
    }
  }, [winnerId, game?.round, game?.phase, reducedMotion])

  const momentum = useMemo(() => {
    if (!game) return []
    const totals = new Map<string, number>()
    for (const h of highlights) {
      if (!h.playerId) continue
      const weight = h.kind === 'played' ? 1 : h.kind === 'special' ? 2 : h.kind === 'pick' || h.kind === 'caught' ? 2 : 0
      if (weight === 0) continue
      totals.set(h.playerId, (totals.get(h.playerId) ?? 0) + weight)
    }
    const active = game.players.filter((p) => !p.eliminated && !p.left)
    if (active.length < 2) return []
    const max = Math.max(1, ...active.map((p) => totals.get(p.id) ?? 0))
    return active
      .map((p) => ({ id: p.id, name: p.name, avatar: p.avatar, weight: (totals.get(p.id) ?? 0) / max }))
      .sort((a, b) => b.weight - a.weight)
  }, [highlights, game])

  if (!code || (!lobby && !game)) {
    return (
      <div className="grid h-full place-items-center gap-3 px-6 text-center">
        <Loader2 className="mx-auto animate-spin text-fg-faint" size={22} />
        <p className="text-sm text-fg-muted">
          {status === 'reconnecting' ? 'Reconnecting to the table' : 'Finding the table'}
        </p>
      </div>
    )
  }

  return (
    <div className="relative flex h-full w-full flex-col">
      <header className="z-20 flex shrink-0 items-center justify-between gap-2 px-3 py-2 pad-safe-top">
        <span className="chip bg-ember/20 text-[11px] font-semibold uppercase tracking-wider text-ember">
          <Eye size={13} /> Watching
        </span>
        <div className="flex items-center gap-2">
          <button className="chip bg-table-800/70 text-[11px] text-fg-muted" onClick={copyLink}>
            {copied ? <Check size={13} className="text-leaf" /> : <Copy size={13} />}
            {code}
          </button>
          <button className="btn-icon" onClick={shareLink} aria-label="Share the watch link">
            <Share2 size={16} />
          </button>
          <button className="btn-icon" onClick={() => setShowQr((v) => !v)} aria-label="Show watch QR code">
            <LayoutGrid size={16} />
          </button>
          {lobby && lobby.watchers > 1 && (
            <span className="chip bg-table-800/70 text-[11px] text-fg-faint">{lobby.watchers} watching</span>
          )}
          <button className="btn-icon" onClick={leaveRoom} aria-label="Stop watching">
            <LogOut size={17} />
          </button>
        </div>
      </header>

      {game ? (
        <div className="relative min-h-0 flex-1">
          {/* Champion banner while the round/match result stands. */}
          <AnimatePresence>
            {game.phase !== 'playing' && winnerId && (
              <motion.div
                key="watch-winner"
                initial={{ opacity: 0, y: 14, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3, ease: [0.25, 1, 0.5, 1] }}
                className="pointer-events-none absolute inset-x-0 bottom-16 z-30 flex justify-center px-4"
              >
                <div className="flex items-center gap-3 rounded-2xl bg-table-950/90 px-4 py-3 shadow-card ring-1 ring-marigold/50">
                  <Trophy className="text-marigold" size={22} />
                  <div>
                    <p className="font-display text-lg font-bold leading-tight">
                      {nameOf(winnerId)} {game.phase === 'matchOver' ? 'wins the match' : 'checks up'}
                    </p>
                    <p className="text-[11px] text-fg-faint">
                      {game.phase === 'matchOver' ? 'Final table' : `Round ${game.lastRound?.round ?? game.round}`}
                    </p>
                  </div>
                  <Avatar id={game.players.find((p) => p.id === winnerId)?.avatar ?? 'lion'} size={36} />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          {/* A concrete box: a flex parent can measure as zero height on first paint, which leaves the scene blank. */}
          <div className="absolute inset-0">
            {webgl && !sceneStalled ? (
              <SceneBoundary fallback={<FlatFallback reason="unsupported" />}>
                <Suspense
                  fallback={
                    <div className="grid h-full place-items-center gap-2 text-center">
                      <Loader2 className="mx-auto animate-spin text-fg-faint" size={20} />
                      <p className="text-sm text-fg-muted">Setting the table</p>
                    </div>
                  }
                >
                  <div className="h-full w-full">
                    <Table3D
                      view={game}
                      cheers={cheers}
                      preset={preset}
                      spin={spin}
                      seatIndex={seatIndex}
                      selectedSeat={target}
                      onSelectSeat={(id) => setTarget((current) => (current === id ? null : id))}
                      reducedMotion={reducedMotion || muted}
                      highlights={highlights}
                      splash={splash}
                      deadline={game.deadline}
                      onStall={() => setSceneStalled(true)}
                    />
                  </div>
                </Suspense>
              </SceneBoundary>
            ) : (
              <div className="relative h-full">
                <FlatFallback reason={webgl ? 'chosen' : 'unsupported'} />
                {sceneStalled && (
                  <button
                    className="btn-ghost absolute bottom-4 left-1/2 -translate-x-1/2 text-xs"
                    onClick={() => setSceneStalled(false)}
                  >
                    Try the 3D table again
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Turn strip: whose turn, how long, what is owed. */}
          <div className="pointer-events-none absolute inset-x-0 top-2 flex justify-center">
            <span className="chip gap-2 bg-table-950/85 px-3 text-xs text-fg-muted">
              {game.phase === 'playing' ? (
                <>
                  <Avatar id={game.players.find((p) => p.id === game.turnPlayerId)?.avatar ?? 'lion'} size={16} />
                  <span className="text-fg">{nameOf(game.turnPlayerId)}</span>
                  {game.pendingPick && <span className="font-bold text-ember">owes {game.pendingPick.amount}</span>}
                  {game.deadline && (
                    <span className={`tabular-nums ${countdown.remainingMs < 6000 ? 'text-ember' : 'text-fg-faint'}`}>
                      {Math.ceil(countdown.remainingMs / 1000)}s
                    </span>
                  )}
                </>
              ) : (
                'Round over'
              )}
              <span className="text-fg-faint">· round {game.round}</span>
            </span>
          </div>

          <div className="absolute left-2 top-12 flex flex-col gap-1">
            <CameraButton active={preset === 'table' && !spin} onClick={() => { setPreset('table'); setSpin(false) }} label="Table view">
              <Rows3 size={16} />
            </CameraButton>
            <CameraButton active={spin} onClick={() => { setSpin((v) => !v); setPreset('table') }} label="Auto spin">
              <Orbit size={16} />
            </CameraButton>
            <CameraButton active={preset === 'seat'} onClick={cycleSeat} label="Next seat view">
              <UserSquare2 size={16} />
            </CameraButton>
            <CameraButton active={sceneStalled} onClick={() => setSceneStalled(true)} label="Flat view">
              <LayoutGrid size={16} />
            </CameraButton>
          </div>

          {/* Right rail: pile + market counts and a mute toggle. */}
          <div className="absolute right-2 top-12 flex flex-col items-end gap-1">
            <button className="chip bg-table-950/80 text-[11px] text-fg-muted" onClick={toggleMute}>
              {muted ? <span aria-hidden="true">🔇</span> : <span aria-hidden="true">🔊</span>}
              <span className="tabular-nums">{game.pileCount}</span>
              <span className="text-fg-faint">pile</span>
            </button>
            <span className="chip bg-table-950/80 text-[11px] text-fg-faint">
              <span className="tabular-nums">{game.marketCount}</span>
              <span>market</span>
            </span>
          </div>

          <ul className="pointer-events-none absolute bottom-2 left-2 max-w-[60%] space-y-1">
            <AnimatePresence initial={false}>
              {feed.slice(-4).map((line) => (
                <motion.li
                  key={line.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                  className={`w-fit rounded-lg px-2 py-1 text-[11px] ${
                    line.tone === 'good'
                      ? 'bg-marigold/90 font-semibold text-table-950'
                      : line.tone === 'bad'
                        ? 'bg-ember/85 font-semibold text-table-950'
                        : 'bg-table-950/75 text-fg-muted'
                  }`}
                >
                  {line.text}
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        </div>
      ) : (
        <PreGame />
      )}

      <footer className="shrink-0 px-3 py-2 pad-safe-bottom">
        <MomentumBar momentum={momentum} />
        <div className="mb-1.5 flex items-center gap-1 overflow-x-auto scrollbar-hide">
          <button
            onClick={() => setTarget(null)}
            className={`chip shrink-0 text-[11px] ${target === null ? 'bg-marigold text-table-950' : 'bg-table-800/70 text-fg-muted'}`}
          >
            Whole table
          </button>
          {players.map((player) => (
            <button
              key={player.id}
              onClick={() => setTarget(player.id)}
              className={`chip shrink-0 text-[11px] ${
                target === player.id ? 'bg-marigold text-table-950' : 'bg-table-800/70 text-fg-muted'
              }`}
            >
              <Avatar id={player.avatar} size={16} /> {player.name}
            </button>
          ))}
        </div>
        <div className="flex items-center justify-between gap-1">
          {REACTIONS.map((emoji) => (
            <button
              key={emoji}
              onClick={() => sendCheer(emoji)}
              className="flex-1 rounded-xl bg-table-800/70 py-2 text-xl transition-transform active:scale-95 hover:bg-table-700"
              aria-label={`Cheer ${emoji}`}
            >
              {emoji}
            </button>
          ))}
        </div>
        <p className="mt-1 text-center text-[10px] text-fg-faint">
          You are watching, so you cannot play a card. Cheers reach the table.
        </p>
      </footer>

      <AnimatePresence>
        {showQr && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-40 grid place-items-center bg-table-950/85 px-6"
            onClick={() => setShowQr(false)}
          >
            <div className="panel rounded-2xl p-4 text-center" onClick={(e) => e.stopPropagation()}>
              <p className="mb-2 text-xs uppercase tracking-[0.2em] text-fg-faint">Scan to watch</p>
              {qrData ? (
                <img src={qrData} alt="Watch link QR code" className="mx-auto h-56 w-56 rounded-xl" />
              ) : (
                <Loader2 className="mx-auto h-56 w-56 animate-spin p-16 text-fg-faint" size={40} />
              )}
              <p className="mt-2 font-display text-2xl font-bold tracking-[0.3em]">{code}</p>
              <button className="btn-ghost mt-3 w-full" onClick={() => setShowQr(false)}>
                Done
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/** Thin stacked bar showing who is driving the game right now. */
function MomentumBar({ momentum }: { momentum: { id: string; name: string; avatar: string; weight: number }[] }) {
  if (momentum.length === 0) return null
  return (
    <div className="mb-1.5 flex h-1 w-full gap-0.5" aria-hidden="true">
      {momentum.map((m) => (
        <div
          key={m.id}
          className="h-full rounded-full bg-marigold transition-all duration-700"
          style={{ flex: Math.max(m.weight, 0.06), opacity: 0.25 + m.weight * 0.75 }}
          title={`${m.name} ${Math.round(m.weight * 100)}%`}
        />
      ))}
    </div>
  )
}

function CameraButton({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean
  onClick: () => void
  label: string
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={`grid h-9 w-9 place-items-center rounded-lg transition-colors ${
        active ? 'bg-marigold text-table-950' : 'bg-table-950/70 text-fg-muted hover:text-fg'
      }`}
    >
      {children}
    </button>
  )
}

function PreGame() {
  const lobby = useGameStore((s) => s.lobby)
  if (!lobby) return null
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="flex -space-x-3">
        {[0, 1, 2].map((i) => (
          <span key={i} className="w-14 rotate-[-6deg] first:rotate-[-14deg] last:rotate-[6deg]">
            <WhotCard faceDown />
          </span>
        ))}
      </div>
      <div>
        <h1 className="font-display text-2xl font-bold">The table is still filling up</h1>
        <p className="mt-1 text-sm text-fg-muted">
          {lobby.members.length} seated. The game starts when the host says so.
        </p>
      </div>
      <ul className="flex flex-wrap justify-center gap-2">
        {lobby.members.map((member) => (
          <li key={member.id} className="chip bg-table-800/60 text-xs text-fg-muted">
            <Avatar id={member.avatar} size={18} /> {member.name}
          </li>
        ))}
      </ul>
    </div>
  )
}

function FlatFallback({ reason }: { reason: 'unsupported' | 'chosen' }) {
  const game = useGameStore((s) => s.game)
  if (!game) return null
  const top = game.pile[game.pile.length - 1]
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-6">
      <p className="text-xs text-fg-faint">
        {reason === 'chosen' ? 'Flat view of the table.' : '3D is not available here, so this is the flat view.'}
      </p>
      <div className="w-24">{top && <WhotCard card={top} />}</div>
      <ul className="flex flex-wrap justify-center gap-2">
        {game.players.map((player) => (
          <li
            key={player.id}
            className={`chip text-xs ${
              player.id === game.turnPlayerId ? 'bg-marigold text-table-950' : 'bg-table-800/60 text-fg-muted'
            }`}
          >
            <Avatar id={player.avatar} size={18} /> {player.name} · {player.handCount}
          </li>
        ))}
      </ul>
    </div>
  )
}