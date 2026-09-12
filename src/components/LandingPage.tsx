import { useState } from 'react'
import { motion } from 'framer-motion'
import { Bot, Loader2, Play, Users } from 'lucide-react'
import { useGameStore } from '../store/gameStore'
import { AVATARS } from '../lib/avatars'
import { MAX_NAME_LENGTH } from '../net/protocol'
import { Avatar } from './Avatar'
import { WhotCard } from './cards/WhotCard'

const FAN = [
  { card: { id: 'circle-14', shape: 'circle' as const, number: 14 }, rotate: -14, x: -58 },
  { card: { id: 'whot-1', shape: 'whot' as const, number: 20 }, rotate: 0, x: 0 },
  { card: { id: 'star-5', shape: 'star' as const, number: 5 }, rotate: 14, x: 58 },
]

export default function LandingPage() {
  const profile = useGameStore((s) => s.profile)
  const setProfile = useGameStore((s) => s.setProfile)
  const createRoom = useGameStore((s) => s.createRoom)
  const joinRoom = useGameStore((s) => s.joinRoom)
  const busy = useGameStore((s) => s.busy)
  const formError = useGameStore((s) => s.formError)
  const inviteCode = useGameStore((s) => s.inviteCode)
  const isLocal = useGameStore((s) => s.isLocal)

  const [code, setCode] = useState(inviteCode ?? '')
  const [showJoin, setShowJoin] = useState(!!inviteCode)

  const nameOk = profile.name.trim().length > 0
  const codeOk = code.trim().length >= 4

  return (
    <div className="mx-auto flex h-full w-full max-w-md flex-col justify-center gap-6 px-5 py-6">
      <header className="text-center">
        <div className="relative mx-auto mb-5 h-24 w-44">
          {FAN.map((item, i) => (
            <motion.div
              key={item.card.id}
              className="absolute left-1/2 top-0 w-16"
              initial={{ opacity: 0, y: 16, rotate: 0, x: '-50%' }}
              animate={{ opacity: 1, y: 0, rotate: item.rotate, x: `calc(-50% + ${item.x}px)` }}
              transition={{ delay: i * 0.07, duration: 0.5, ease: [0.25, 1, 0.5, 1] }}
              style={{ zIndex: i === 1 ? 3 : 1 }}
            >
              <WhotCard card={item.card} />
            </motion.div>
          ))}
        </div>
        <h1 className="font-display text-5xl font-extrabold tracking-tight">Last Card</h1>
        <p className="mt-1 text-sm text-fg-muted">Whot, the Nigerian card game, with your people, right now.</p>
      </header>

      <div className="panel rounded-2xl p-4">
        <label htmlFor="nickname" className="text-[11px] uppercase tracking-[0.2em] text-fg-faint">
          Your name
        </label>
        <input
          id="nickname"
          className="field mt-1.5"
          placeholder="e.g. Ada"
          value={profile.name}
          maxLength={MAX_NAME_LENGTH}
          autoComplete="nickname"
          onChange={(e) => setProfile({ name: e.target.value })}
        />

        <p className="mt-4 text-[11px] uppercase tracking-[0.2em] text-fg-faint">Pick a face</p>
        <div className="mt-1.5 flex gap-2 overflow-x-auto pb-1 scrollbar-hide" role="radiogroup" aria-label="Avatar">
          {AVATARS.map((avatar) => (
            <button
              key={avatar.id}
              role="radio"
              aria-checked={profile.avatar === avatar.id}
              aria-label={avatar.id}
              onClick={() => setProfile({ avatar: avatar.id })}
              className={`shrink-0 rounded-full p-0.5 transition-transform active:scale-95 ${
                profile.avatar === avatar.id ? 'ring-2 ring-marigold' : 'ring-1 ring-transparent'
              }`}
            >
              <Avatar id={avatar.id} size={40} />
            </button>
          ))}
        </div>
      </div>

      {formError && (
        <p role="alert" className="rounded-xl bg-ember/15 px-3 py-2 text-center text-sm text-ember">
          {formError}
        </p>
      )}

      <div className="flex flex-col gap-2">
        {showJoin ? (
          <div className="panel rounded-2xl p-4">
            <label htmlFor="room-code" className="text-[11px] uppercase tracking-[0.2em] text-fg-faint">
              Room code
            </label>
            <input
              id="room-code"
              className="field mt-1.5 text-center font-display text-2xl font-bold tracking-[0.3em]"
              placeholder="K7QX2M"
              value={code}
              maxLength={6}
              inputMode="text"
              autoCapitalize="characters"
              onChange={(e) => setCode(e.target.value.toUpperCase())}
            />
            <button
              className="btn-primary mt-3 w-full py-3.5"
              disabled={!nameOk || !codeOk || busy !== null}
              onClick={() => joinRoom(code)}
            >
              {busy === 'join' ? <Loader2 size={18} className="animate-spin" /> : <Users size={18} />}
              Join table
            </button>
            <button className="mt-2 w-full py-2 text-sm text-fg-faint hover:text-fg" onClick={() => setShowJoin(false)}>
              Back
            </button>
          </div>
        ) : isLocal ? (
          <>
            <button
              className="btn-primary w-full py-4 text-base"
              disabled={!nameOk || busy !== null}
              onClick={() => createRoom({ quickPlay: true })}
            >
              {busy === 'quick' ? <Loader2 size={18} className="animate-spin" /> : <Play size={18} />}
              Play now
            </button>
            <button className="btn-ghost w-full" disabled={!nameOk || busy !== null} onClick={() => createRoom()}>
              <Bot size={17} /> Set up the table
            </button>
          </>
        ) : (
          <>
            <button
              className="btn-primary w-full py-4 text-base"
              disabled={!nameOk || busy !== null}
              onClick={() => createRoom()}
            >
              {busy === 'create' ? <Loader2 size={18} className="animate-spin" /> : <Play size={18} />}
              Create a table
            </button>
            <div className="flex gap-2">
              <button className="btn-ghost flex-1" disabled={!nameOk || busy !== null} onClick={() => setShowJoin(true)}>
                <Users size={17} /> Join code
              </button>
              <button
                className="btn-ghost flex-1"
                disabled={!nameOk || busy !== null}
                onClick={() => createRoom({ quickPlay: true })}
              >
                {busy === 'quick' ? <Loader2 size={17} className="animate-spin" /> : <Bot size={17} />}
                Play bots
              </button>
            </div>
          </>
        )}
        {!nameOk && <p className="text-center text-xs text-fg-faint">Add a name to get going</p>}
      </div>

      <p className="text-center text-[11px] text-fg-faint">
        {isLocal ? 'Play Whot against the house. Your table, your rules.' : 'No signup. 2 to 6 players. Share a link and deal.'}
      </p>
    </div>
  )
}
