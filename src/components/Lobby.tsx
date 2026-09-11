import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import QRCode from 'qrcode'
import { Check, Copy, Crown, LogOut, Play, QrCode, Share2, UserMinus, UserPlus, WifiOff } from 'lucide-react'
import { useGameStore } from '../store/gameStore'
import { MAX_PLAYERS, MIN_PLAYERS } from '../engine/gameEngine'
import { BotLevel, SETTING_LIMITS } from '../types/game'
import { Avatar } from './Avatar'

const BOT_LEVELS: { value: BotLevel; label: string }[] = [
  { value: 'easy', label: 'Easy' },
  { value: 'normal', label: 'Normal' },
  { value: 'hard', label: 'Hard' },
]

export default function Lobby() {
  const lobby = useGameStore((s) => s.lobby)
  const session = useGameStore((s) => s.session)
  const leaveRoom = useGameStore((s) => s.leaveRoom)
  const setReady = useGameStore((s) => s.setReady)
  const addBot = useGameStore((s) => s.addBot)
  const removePlayer = useGameStore((s) => s.removePlayer)
  const updateSettings = useGameStore((s) => s.updateSettings)
  const startGame = useGameStore((s) => s.startGame)

  const [copied, setCopied] = useState(false)
  const [showQr, setShowQr] = useState(false)
  const [qr, setQr] = useState<string | null>(null)
  const [showBotMenu, setShowBotMenu] = useState(false)

  const roomUrl = lobby ? `${window.location.origin}/r/${lobby.code}` : ''

  useEffect(() => {
    if (!showQr || !roomUrl) return
    let active = true
    QRCode.toDataURL(roomUrl, { margin: 1, width: 360, color: { dark: '#2c1114', light: '#f6efe2' } })
      .then((url) => active && setQr(url))
      .catch(() => active && setQr(null))
    return () => {
      active = false
    }
  }, [showQr, roomUrl])

  if (!lobby || !session) return null

  const me = lobby.members.find((m) => m.id === session.playerId)
  const isHost = lobby.hostId === session.playerId
  const humansWaiting = lobby.members.filter((m) => !m.isBot && m.id !== lobby.hostId && !m.ready)
  const canStart = lobby.members.length >= MIN_PLAYERS && humansWaiting.length === 0

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(roomUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      setCopied(false)
    }
  }

  const share = async () => {
    const text = `Join my Whot game: ${roomUrl}`
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Whot! Online', text, url: roomUrl })
        return
      } catch {
        // Sharing cancelled: fall back to copying.
      }
    }
    void copy()
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-lg flex-col">
      <header className="flex items-center justify-between px-4 py-3 pad-safe-top">
        <button className="btn-icon" onClick={leaveRoom} aria-label="Leave room">
          <LogOut size={18} />
        </button>
        <p className="text-sm text-fg-muted">
          {lobby.members.find((m) => m.id === lobby.hostId)?.name}
          <span className="text-fg-faint">’s table</span>
        </p>
        <span className="w-10" />
      </header>

      <section className="px-4">
        <div className="panel rounded-2xl p-4">
          <p className="text-[11px] uppercase tracking-[0.2em] text-fg-faint">Room code</p>
          <div className="mt-1 flex items-center gap-3">
            <span className="font-display text-3xl font-extrabold tracking-[0.2em] text-marigold">{lobby.code}</span>
            <button className="btn-icon" onClick={copy} aria-label="Copy invite link">
              {copied ? <Check size={18} className="text-leaf" /> : <Copy size={18} />}
            </button>
          </div>
          <div className="mt-3 flex gap-2">
            <button className="btn-primary flex-1 text-sm" onClick={share}>
              <Share2 size={16} /> Share invite
            </button>
            <button className="btn-ghost text-sm" onClick={() => setShowQr((v) => !v)} aria-expanded={showQr}>
              <QrCode size={16} /> QR
            </button>
          </div>
          <AnimatePresence>
            {showQr && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="mt-3 grid place-items-center rounded-xl bg-paper p-3">
                  {qr ? (
                    <img src={qr} alt={`QR code for ${roomUrl}`} className="h-44 w-44" />
                  ) : (
                    <span className="grid h-44 w-44 place-items-center text-sm text-ink/60">Building QR…</span>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </section>

      <section className="mt-4 min-h-0 flex-1 overflow-y-auto px-4">
        <div className="flex items-center justify-between">
          <p className="text-[11px] uppercase tracking-[0.2em] text-fg-faint">
            Players {lobby.members.length}/{MAX_PLAYERS}
          </p>
          {isHost && lobby.members.length < MAX_PLAYERS && (
            <div className="relative">
              <button className="chip bg-table-800/70 text-xs text-fg-muted" onClick={() => setShowBotMenu((v) => !v)}>
                <UserPlus size={14} /> Add bot
              </button>
              <AnimatePresence>
                {showBotMenu && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    className="panel absolute right-0 z-20 mt-1 flex gap-1 rounded-xl p-1"
                  >
                    {BOT_LEVELS.map((level) => (
                      <button
                        key={level.value}
                        className="rounded-lg px-3 py-1.5 text-xs hover:bg-table-700"
                        onClick={() => {
                          addBot(level.value)
                          setShowBotMenu(false)
                        }}
                      >
                        {level.label}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>

        <ul className="mt-2 space-y-2">
          <AnimatePresence initial={false}>
            {lobby.members.map((member) => (
              <motion.li
                key={member.id}
                layout
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: 16 }}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 shadow-seat ${
                  member.ready ? 'bg-leaf/10 ring-1 ring-leaf/30' : 'bg-table-800/50 ring-1 ring-table-600/30'
                }`}
              >
                <Avatar id={member.avatar} size={38} dimmed={!member.connected} />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                    {member.name}
                    {member.id === lobby.hostId && <Crown size={13} className="shrink-0 text-marigold" />}
                    {member.isBot && (
                      <span className="chip bg-table-700 px-1.5 py-0 text-[10px] text-fg-muted">{member.botLevel}</span>
                    )}
                  </p>
                  <p className="flex items-center gap-1 text-[11px] text-fg-faint">
                    {!member.connected && <WifiOff size={11} />}
                    {member.id === lobby.hostId ? 'Host' : member.ready ? 'Ready' : 'Not ready'}
                  </p>
                </div>
                {member.id === session.playerId && !isHost ? (
                  <button
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                      member.ready ? 'bg-leaf/20 text-leaf' : 'bg-table-700 text-fg-muted'
                    }`}
                    onClick={() => setReady(!me?.ready)}
                  >
                    {member.ready ? 'Ready' : 'I’m ready'}
                  </button>
                ) : isHost && member.id !== session.playerId ? (
                  <button
                    className="btn-icon hover:text-ember"
                    onClick={() => removePlayer(member.id)}
                    aria-label={`Remove ${member.name}`}
                  >
                    <UserMinus size={16} />
                  </button>
                ) : null}
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>

        <div className="panel mt-4 rounded-2xl p-4">
          <p className="text-[11px] uppercase tracking-[0.2em] text-fg-faint">Table rules</p>
          <div className="mt-3 space-y-3">
            <Segmented
              label="Play to"
              value={lobby.settings.targetScore}
              options={SETTING_LIMITS.targetScores.map((score) => ({
                value: score,
                label: score === 0 ? 'One round' : String(score),
              }))}
              disabled={!isHost}
              onChange={(targetScore) => updateSettings({ targetScore })}
            />
            <Segmented
              label="Turn timer"
              value={lobby.settings.turnSeconds}
              options={SETTING_LIMITS.turnSeconds.map((seconds) => ({
                value: seconds,
                label: seconds === 0 ? 'Off' : `${seconds}s`,
              }))}
              disabled={!isHost}
              onChange={(turnSeconds) => updateSettings({ turnSeconds })}
            />
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-fg-muted">Cards each</span>
              <div className="flex items-center gap-1">
                <button
                  className="btn-icon"
                  disabled={!isHost || lobby.settings.handSize <= SETTING_LIMITS.handSize.min}
                  onClick={() => updateSettings({ handSize: lobby.settings.handSize - 1 })}
                  aria-label="Fewer cards"
                >
                  −
                </button>
                <span className="w-6 text-center font-display text-lg font-bold tabular-nums">{lobby.settings.handSize}</span>
                <button
                  className="btn-icon"
                  disabled={!isHost || lobby.settings.handSize >= SETTING_LIMITS.handSize.max}
                  onClick={() => updateSettings({ handSize: lobby.settings.handSize + 1 })}
                  aria-label="More cards"
                >
                  +
                </button>
              </div>
            </div>
            <label className="flex items-center justify-between gap-3 text-sm text-fg-muted">
              <span>Defend picks with 2 and 5</span>
              <input
                type="checkbox"
                className="h-5 w-5 accent-[oklch(var(--marigold))]"
                checked={lobby.settings.stackPicks}
                disabled={!isHost}
                onChange={(e) => updateSettings({ stackPicks: e.target.checked })}
              />
            </label>
          </div>
          {!isHost && <p className="mt-3 text-[11px] text-fg-faint">Only the host can change these</p>}
        </div>
      </section>

      <footer className="px-4 py-4 pad-safe-bottom">
        {isHost ? (
          <button className="btn-primary w-full py-4 text-base" disabled={!canStart} onClick={startGame}>
            <Play size={20} />
            {lobby.members.length < MIN_PLAYERS
              ? 'Add a bot or invite a friend'
              : humansWaiting.length > 0
                ? `Waiting for ${humansWaiting.map((m) => m.name).join(', ')}`
                : 'Start game'}
          </button>
        ) : (
          <p className="text-center text-sm text-fg-muted">
            {me?.ready ? 'Waiting for the host to start' : 'Tap ready when you are set'}
          </p>
        )}
      </footer>
    </div>
  )
}

function Segmented<T extends number>({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string
  value: T
  options: { value: T; label: string }[]
  disabled?: boolean
  onChange: (value: T) => void
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="shrink-0 text-sm text-fg-muted">{label}</span>
      <div className="flex flex-wrap justify-end gap-1" role="group" aria-label={label}>
        {options.map((option) => (
          <button
            key={option.value}
            disabled={disabled}
            aria-pressed={option.value === value}
            onClick={() => onChange(option.value)}
            className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
              option.value === value ? 'bg-marigold text-table-950' : 'bg-table-800/70 text-fg-muted hover:bg-table-700'
            } ${disabled ? 'opacity-60' : ''}`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}
