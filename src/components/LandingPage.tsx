import { useState } from 'react'
import { motion } from 'framer-motion'
import { Users, Play, Sparkles, Zap, Shield } from 'lucide-react'
import { useGameStore } from '../store/gameStore'

const AVATAR_SEEDS = ['Felix', 'Aiden', 'Bella', 'Coco', 'Duke', 'Emma', 'Finn', 'Gigi']

function LandingPage() {
  const [mode, setMode] = useState<'create' | 'join' | null>(null)
  const [name, setName] = useState('')
  const [avatarSeed, setAvatarSeed] = useState(AVATAR_SEEDS[0])
  const [roomCode, setRoomCode] = useState('')
  const { createRoom, joinRoom } = useGameStore()

  const handleCreate = () => {
    if (!name.trim()) return
    createRoom(name.trim(), avatarSeed)
  }

  const handleJoin = () => {
    if (!name.trim() || !roomCode.trim()) return
    joinRoom(roomCode.trim().toUpperCase(), name.trim(), avatarSeed)
  }

  const rerollAvatar = () => {
    const next = AVATAR_SEEDS[(AVATAR_SEEDS.indexOf(avatarSeed) + 1) % AVATAR_SEEDS.length]
    setAvatarSeed(next)
  }

  return (
    <div className="h-full w-full flex flex-col items-center justify-center px-4">
      {/* Animated background cards */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(8)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-16 h-24 rounded-lg opacity-10"
            style={{
              background: ['#e74c3c', '#f39c12', '#3498db', '#2ecc71', '#9b59b6', '#f1c40f'][i % 6],
              left: `${10 + (i * 12)}%`,
              top: `${20 + (i % 3) * 25}%`,
            }}
            animate={{
              y: [0, -20, 0],
              rotate: [0, 5, -5, 0],
            }}
            transition={{
              duration: 4 + i,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          />
        ))}
      </div>

      {/* Logo */}
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="text-center mb-8 z-10"
      >
        <div className="flex items-center justify-center gap-3 mb-2">
          <div className="w-12 h-16 bg-yellow-400 rounded-lg flex items-center justify-center text-felt-dark font-bold text-xl shadow-lg">
            W
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold text-white tracking-tight">
            Whot!
          </h1>
        </div>
        <p className="text-green-200 text-sm md:text-base">
          The classic Nigerian card game — now online
        </p>
      </motion.div>

      {/* Feature badges */}
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="flex gap-3 mb-8 flex-wrap justify-center z-10"
      >
        {[
          { icon: Zap, text: 'Instant Play' },
          { icon: Users, text: '2-6 Players' },
          { icon: Shield, text: 'No Signup' },
          { icon: Sparkles, text: 'Premium Feel' },
        ].map((feature) => (
          <div key={feature.text} className="flex items-center gap-1.5 bg-white/10 backdrop-blur-sm px-3 py-1.5 rounded-full text-xs text-green-100">
            <feature.icon size={14} />
            {feature.text}
          </div>
        ))}
      </motion.div>

      {/* Main actions */}
      {!mode && (
        <motion.div
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="flex flex-col gap-3 w-full max-w-sm z-10"
        >
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => setMode('create')}
            className="w-full py-4 bg-yellow-400 hover:bg-yellow-300 text-felt-dark font-bold text-lg rounded-xl shadow-lg flex items-center justify-center gap-2 transition-colors"
          >
            <Play size={22} />
            Create Game
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => setMode('join')}
            className="w-full py-4 bg-white/10 hover:bg-white/20 text-white font-semibold text-lg rounded-xl border border-white/20 flex items-center justify-center gap-2 transition-colors"
          >
            <Users size={22} />
            Join with Code
          </motion.button>
        </motion.div>
      )}

      {/* Create form */}
      {mode === 'create' && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-sm z-10 bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10"
        >
          <div className="flex justify-center mb-6">
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={rerollAvatar}
              className="relative"
            >
              <img
                src={`https://api.dicebear.com/7.x/notionists/svg?seed=${avatarSeed}`}
                alt="avatar"
                className="w-20 h-20 rounded-full bg-white/10"
              />
              <div className="absolute -bottom-1 -right-1 bg-yellow-400 text-felt-dark text-xs font-bold px-2 py-0.5 rounded-full">
                Tap to change
              </div>
            </motion.button>
          </div>

          <input
            type="text"
            placeholder="Your nickname"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={16}
            className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/40 focus:outline-none focus:border-yellow-400 mb-4"
            autoFocus
          />

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleCreate}
            disabled={!name.trim()}
            className="w-full py-3 bg-yellow-400 disabled:bg-yellow-400/50 text-felt-dark font-bold rounded-xl transition-colors"
          >
            Create Room
          </motion.button>

          <button
            onClick={() => setMode(null)}
            className="w-full py-3 text-white/60 text-sm mt-2 hover:text-white"
          >
            Back
          </button>
        </motion.div>
      )}

      {/* Join form */}
      {mode === 'join' && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-sm z-10 bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10"
        >
          <div className="flex justify-center mb-6">
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={rerollAvatar}
              className="relative"
            >
              <img
                src={`https://api.dicebear.com/7.x/notionists/svg?seed=${avatarSeed}`}
                alt="avatar"
                className="w-20 h-20 rounded-full bg-white/10"
              />
              <div className="absolute -bottom-1 -right-1 bg-yellow-400 text-felt-dark text-xs font-bold px-2 py-0.5 rounded-full">
                Tap to change
              </div>
            </motion.button>
          </div>

          <input
            type="text"
            placeholder="Room code (e.g. K7QX2M)"
            value={roomCode}
            onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
            maxLength={6}
            className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/40 focus:outline-none focus:border-yellow-400 mb-3 font-mono tracking-widest"
            autoFocus
          />

          <input
            type="text"
            placeholder="Your nickname"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={16}
            className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/40 focus:outline-none focus:border-yellow-400 mb-4"
          />

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleJoin}
            disabled={!name.trim() || roomCode.length < 4}
            className="w-full py-3 bg-yellow-400 disabled:bg-yellow-400/50 text-felt-dark font-bold rounded-xl transition-colors"
          >
            Join Room
          </motion.button>

          <button
            onClick={() => setMode(null)}
            className="w-full py-3 text-white/60 text-sm mt-2 hover:text-white"
          >
            Back
          </button>
        </motion.div>
      )}

      {/* Footer */}
      <div className="absolute bottom-4 text-white/30 text-xs z-10">
        Whot Online v0.1 — Made with 💚 for Nigeria
      </div>
    </div>
  )
}

export default LandingPage
