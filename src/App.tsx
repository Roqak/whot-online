import { useEffect, useState, type ComponentType } from 'react'
import { AnimatePresence, MotionConfig, motion } from 'framer-motion'
import { Toaster } from 'sonner'
import GameTable from './components/GameTable'
import LandingPage from './components/LandingPage'
import Lobby from './components/Lobby'
import WatchScreen from './components/watch/WatchScreen'
import Lab from './lab/Lab'
import Lab2 from './lab2/Lab2'
import Lab3 from './lab3/Lab3'
import Lab4 from './lab4/Lab4'
import Lab5 from './lab5/Lab5'
import Lab6 from './lab6/Lab6'
import Lab7 from './lab7/Lab7'
import Lab8 from './lab8/Lab8'
import Lab9 from './lab9/Lab9'
import Lab10 from './lab10/Lab10'
import Lab11 from './lab11/Lab11'
import IsometricTable from './components/isometric/IsometricTable'
import { ConnectionBanner } from './components/ConnectionBanner'
import { ErrorBoundary } from './components/ErrorBoundary'
import { useGameStore } from './store/gameStore'
import { unlockAudio } from './lib/sound'
import { initCrazyGames, registerCrazyGamesProfileHandler } from './lib/crazygames'

// The labs live outside the app's screens; the hash is their door. Lab 1 keeps #/lab.
const LABS: Record<string, ComponentType> = {
  '#/lab': Lab,
  '#/lab1': Lab,
  '#/lab2': Lab2,
  '#/lab3': Lab3,
  '#/lab4': Lab4,
  '#/lab5': Lab5,
  '#/lab6': Lab6,
  '#/lab7': Lab7,
  '#/lab8': Lab8,
  '#/lab9': Lab9,
  '#/lab10': Lab10,
  '#/lab11': Lab11,
  '#/iso': IsometricTable,
}

export default function App() {
  const game = useGameStore((s) => s.game)
  const lobby = useGameStore((s) => s.lobby)
  const status = useGameStore((s) => s.status)
  const session = useGameStore((s) => s.session)
  const watching = useGameStore((s) => s.watching)

  // The lab route is a hash door; leaving clears the hash and restores the app.
  const [labHash, setLabHash] = useState(() => (LABS[window.location.hash] ? window.location.hash : ''))
  useEffect(() => {
    const onHash = () => setLabHash(LABS[window.location.hash] ? window.location.hash : '')
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  const LabScreen = labHash ? LABS[labHash] : null

  useEffect(() => {
    const unlock = () => unlockAudio()
    window.addEventListener('pointerdown', unlock, { once: true })
    window.addEventListener('keydown', unlock, { once: true })
    return () => {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
    }
  }, [])

  useEffect(() => {
    registerCrazyGamesProfileHandler((name) => {
      useGameStore.getState().setProfile({ name })
    })
    initCrazyGames()
  }, [])

  const screen = labHash && !watching ? 'lab' : watching ? 'watch' : game ? 'game' : lobby ? 'lobby' : 'landing'

  return (
    <MotionConfig reducedMotion="user">
      <div className="felt adire relative h-full w-full overflow-hidden">
        <ErrorBoundary>
        <AnimatePresence mode="wait">
          <motion.main
            key={screen === 'lab' ? labHash : screen}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="h-full w-full"
          >
            {screen === 'lab' ? (
              LabScreen && <LabScreen />
            ) : screen === 'watch' ? (
              <WatchScreen />
            ) : screen === 'game' ? (
              <GameTable />
            ) : screen === 'lobby' ? (
              <Lobby />
            ) : (
              <LandingPage />
            )}
          </motion.main>
        </AnimatePresence>

        {(session || watching) && <ConnectionBanner status={status} />}

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
        </ErrorBoundary>
      </div>
    </MotionConfig>
  )
}
