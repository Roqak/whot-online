import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Copy, Share2, QrCode, UserPlus, UserMinus, Crown, Check, LogOut, Play, Settings } from 'lucide-react'
import { useGameStore } from '../store/gameStore'

function Lobby() {
  const {
    roomCode, playerName, isHost, players,
    addBot, removeBot, kickPlayer, toggleReady,
    startGame, setScreen
  } = useGameStore()

  const [copied, setCopied] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showQr, setShowQr] = useState(false)

  const roomUrl = `https://whot.gg/r/${roomCode}`

  const copyLink = () => {
    navigator.clipboard.writeText(roomUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const shareToWhatsApp = () => {
    const text = `Join me for Whot! ${roomUrl}`
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank')
  }

  const canStart = players.filter(p => p.isReady || p.isBot).length >= 2 && players.filter(p => !p.isBot && p.isReady).length >= 1

  return (
    <div className="h-full w-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-white/10">
        <button onClick={() => setScreen('landing')} className="text-white/60 hover:text-white">
          <LogOut size={20} />
        </button>
        <div className="flex items-center gap-2">
          <Crown size={16} className="text-yellow-400" />
          <span className="text-sm text-white/60">
            {players.find(p => p.isHost)?.name}'s Room
          </span>
        </div>
        <button onClick={() => setShowSettings(!showSettings)} className="text-white/60 hover:text-white">
          <Settings size={20} />
        </button>
      </div>

      {/* Room code */}
      <div className="px-4 pt-4">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white/5 border border-white/10 rounded-xl p-4"
        >
          <p className="text-white/40 text-xs uppercase tracking-wider mb-2">Room Code</p>
          <div className="flex items-center gap-3">
            <span className="text-2xl font-mono font-bold text-yellow-400 tracking-widest">
              {roomCode}
            </span>
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={copyLink}
              className="p-2 bg-white/10 rounded-lg hover:bg-white/20 transition-colors"
            >
              {copied ? <Check size={18} className="text-green-400" /> : <Copy size={18} />}
            </motion.button>
          </div>

          <div className="flex gap-2 mt-3">
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={shareToWhatsApp}
              className="flex-1 py-2 bg-green-600 hover:bg-green-500 rounded-lg text-sm font-medium flex items-center justify-center gap-1.5 transition-colors"
            >
              <Share2 size={16} />
              WhatsApp
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => setShowQr(!showQr)}
              className="flex-1 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm font-medium flex items-center justify-center gap-1.5 transition-colors"
            >
              <QrCode size={16} />
              QR Code
            </motion.button>
          </div>
        </motion.div>
      </div>

      {/* QR Code placeholder */}
      <AnimatePresence>
        {showQr && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="px-4 overflow-hidden"
          >
            <div className="bg-white rounded-xl p-4 mt-3 flex items-center justify-center">
              <div className="w-48 h-48 bg-gray-200 rounded-lg flex items-center justify-center text-gray-400 text-sm">
                [QR Code for {roomUrl}]
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Players */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <p className="text-white/40 text-xs uppercase tracking-wider mb-3">
          Players ({players.length}/6)
        </p>

        <div className="space-y-2">
          <AnimatePresence>
            {players.map((player) => (
              <motion.div
                key={player.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                layout
                className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${
                  player.isReady ? 'bg-green-500/10 border-green-500/30' : 'bg-white/5 border-white/10'
                }`}
              >
                <img
                  src={`https://api.dicebear.com/7.x/notionists/svg?seed=${player.avatarSeed}`}
                  alt={player.name}
                  className="w-10 h-10 rounded-full bg-white/10"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium text-sm truncate">{player.name}</span>
                    {player.isHost && (
                      <Crown size={12} className="text-yellow-400 shrink-0" />
                    )}
                    {player.isBot && (
                      <span className="text-[10px] bg-blue-500/30 text-blue-200 px-1.5 py-0.5 rounded">BOT</span>
                    )}
                  </div>
                  <span className="text-xs text-white/40">
                    {player.isReady ? 'Ready' : 'Not ready'}
                  </span>
                </div>

                {player.name === playerName && !player.isBot ? (
                  <motion.button
                    whileTap={{ scale: 0.9 }}
                    onClick={toggleReady}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      player.isReady
                        ? 'bg-green-500/20 text-green-300 hover:bg-green-500/30'
                        : 'bg-white/10 text-white/70 hover:bg-white/20'
                    }`}
                  >
                    {player.isReady ? 'Ready ✓' : 'Ready?'}
                  </motion.button>
                ) : isHost && player.isBot ? (
                  <motion.button
                    whileTap={{ scale: 0.9 }}
                    onClick={() => removeBot(player.id)}
                    className="p-1.5 text-white/40 hover:text-red-400 transition-colors"
                  >
                    <UserMinus size={16} />
                  </motion.button>
                ) : isHost && !player.isBot && player.name !== playerName ? (
                  <motion.button
                    whileTap={{ scale: 0.9 }}
                    onClick={() => kickPlayer(player.id)}
                    className="p-1.5 text-white/40 hover:text-red-400 transition-colors"
                  >
                    <UserMinus size={16} />
                  </motion.button>
                ) : null}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* Add bot button */}
        {isHost && players.length < 6 && (
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => addBot('easy')}
            className="w-full mt-2 py-2.5 border border-dashed border-white/20 rounded-xl text-sm text-white/50 hover:text-white/80 hover:border-white/40 transition-colors flex items-center justify-center gap-2"
          >
            <UserPlus size={16} />
            Add Bot
          </motion.button>
        )}
      </div>

      {/* Start button */}
      <div className="p-4 border-t border-white/10">
        {isHost ? (
          <motion.button
            whileHover={{ scale: canStart ? 1.02 : 1 }}
            whileTap={{ scale: canStart ? 0.98 : 1 }}
            onClick={canStart ? startGame : undefined}
            disabled={!canStart}
            className={`w-full py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-2 transition-colors ${
              canStart
                ? 'bg-yellow-400 hover:bg-yellow-300 text-felt-dark'
                : 'bg-white/10 text-white/40 cursor-not-allowed'
            }`}
          >
            <Play size={22} />
            {canStart ? 'Start Game' : `Need ${2 - players.filter(p => p.isReady || p.isBot).length} more ready player${players.filter(p => p.isReady || p.isBot).length === 1 ? '' : 's'}`}
          </motion.button>
        ) : (
          <div className="text-center text-white/40 text-sm">
            Waiting for host to start...
          </div>
        )}
      </div>
    </div>
  )
}

export default Lobby
