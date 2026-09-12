import { Component, ReactNode, Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, Copy, Eye, LayoutGrid, Loader2, LogOut, Orbit, Rows3, UserSquare2 } from 'lucide-react'
import { toast } from 'sonner'
import { useGameStore } from '../../store/gameStore'
import { REACTIONS, watchUrl } from '../../net/protocol'
import { describeEvent } from '../../lib/events'
import { Avatar } from '../Avatar'
import { WhotCard } from '../cards/WhotCard'
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
  const [feed, setFeed] = useState<{ id: number; text: string }[]>([])
  const feedId = useRef(0)

  const [sceneStalled, setSceneStalled] = useState(false)
  const webgl = useMemo(hasWebGL, [])
  const reducedMotion = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  )

  const players = game?.players ?? []
  const nameOf = (id: string) => players.find((p) => p.id === id)?.name ?? lobby?.members.find((m) => m.id === id)?.name ?? 'Someone'

  useEffect(() => {
    if (!lastBatch) return
    const lines = lastBatch.events
      .map((event) => describeEvent(event, { nameOf: (id) => nameOf(id), myId: null, verbose: true }))
      .filter((line): line is { text: string; tone: 'neutral' | 'good' | 'bad' } => line !== null)
      .map((line) => ({ id: ++feedId.current, text: line.text }))
    if (lines.length > 0) setFeed((prev) => [...prev, ...lines].slice(-6))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastBatch])

  const copyLink = async () => {
    if (!code) return
    try {
      await navigator.clipboard.writeText(watchUrl(code))
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      toast('Copy failed. The link is in your address bar.')
    }
  }

  const sendCheer = (emoji: (typeof REACTIONS)[number]) => cheer(emoji, target ?? undefined)

  const cycleSeat = () => {
    if (players.length === 0) return
    setSeatIndex((i) => (i + 1) % players.length)
    setPreset('seat')
    setSpin(false)
  }

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
                    reducedMotion={reducedMotion}
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

          <div className="pointer-events-none absolute inset-x-0 top-2 flex justify-center">
            <span className="chip bg-table-950/80 text-xs text-fg-muted">
              {game.phase === 'playing' ? `${nameOf(game.turnPlayerId)} is playing` : 'Round over'}
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

          <ul className="pointer-events-none absolute bottom-2 left-2 max-w-[60%] space-y-1">
            <AnimatePresence initial={false}>
              {feed.slice(-4).map((line) => (
                <motion.li
                  key={line.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                  className="w-fit rounded-lg bg-table-950/75 px-2 py-1 text-[11px] text-fg-muted"
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
