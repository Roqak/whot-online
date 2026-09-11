import { useEffect } from 'react'
import { AnimatePresence, MotionConfig, motion } from 'framer-motion'
import { Toaster } from 'sonner'
import GameTable from './components/GameTable'
import LandingPage from './components/LandingPage'
import Lobby from './components/Lobby'
import { ConnectionBanner } from './components/ConnectionBanner'
import { useGameStore } from './store/gameStore'
import { unlockAudio } from './lib/sound'

export default function App() {
  const game = useGameStore((s) => s.game)
  const lobby = useGameStore((s) => s.lobby)
  const status = useGameStore((s) => s.status)
  const session = useGameStore((s) => s.session)

  useEffect(() => {
    const unlock = () => unlockAudio()
    window.addEventListener('pointerdown', unlock, { once: true })
    window.addEventListener('keydown', unlock, { once: true })
    return () => {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
    }
  }, [])

  const screen = game ? 'game' : lobby ? 'lobby' : 'landing'

  return (
    <MotionConfig reducedMotion="user">
      <div className="felt adire relative h-full w-full overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.main
            key={screen}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="h-full w-full"
          >
            {screen === 'game' ? <GameTable /> : screen === 'lobby' ? <Lobby /> : <LandingPage />}
          </motion.main>
        </AnimatePresence>

        {session && <ConnectionBanner status={status} />}

        <Toaster
          position="top-center"
          theme="dark"
          toastOptions={{
            style: {
              background: 'oklch(var(--table-900))',
              border: '1px solid oklch(var(--table-600) / 0.6)',
              color: 'oklch(var(--fg))',
            },
          }}
        />
      </div>
    </MotionConfig>
  )
}
