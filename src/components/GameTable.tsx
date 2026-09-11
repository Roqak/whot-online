import { useState, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { LogOut, Volume2, VolumeX, HelpCircle } from 'lucide-react'
import { useGameStore } from '../store/gameStore'
import { Card, Shape, canPlayCard, getCardShortLabel, SHAPE_COLORS, SHAPE_NAMES } from '../types/game'
import * as GameEngine from '../engine/gameEngine'

const SHAPE_SVG: Record<Shape, string> = {
  circle: 'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z',
  triangle: 'M12 3L2 20h20L12 3z',
  cross: 'M12 2v20M2 12h20',
  square: 'M3 3h18v18H3z',
  star: 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z',
  whot: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z',
}

function WhotCard({ card, size = 'md', faceUp = true, selected = false, onClick, disabled = false }: {
  card: Card
  size?: 'sm' | 'md' | 'lg'
  faceUp?: boolean
  selected?: boolean
  onClick?: () => void
  disabled?: boolean
}) {
  const sizeClasses = {
    sm: 'w-10 h-14',
    md: 'w-14 h-20',
    lg: 'w-20 h-28',
  }

  const textSizes = {
    sm: 'text-[10px]',
    md: 'text-xs',
    lg: 'text-sm',
  }

  if (!faceUp) {
    return (
      <motion.div
        whileHover={onClick && !disabled ? { y: -4 } : {}}
        whileTap={onClick && !disabled ? { scale: 0.95 } : {}}
        onClick={!disabled ? onClick : undefined}
        className={`${sizeClasses[size]} bg-gradient-to-br from-blue-800 to-blue-950 rounded-lg border-2 border-white/20 flex items-center justify-center card-shadow ${
          selected ? 'ring-2 ring-yellow-400 -translate-y-2' : ''
        } ${onClick && !disabled ? 'cursor-pointer' : ''}`}
      >
        <div className="text-white/20 font-bold text-lg">W</div>
      </motion.div>
    )
  }

  const color = SHAPE_COLORS[card.shape]
  const isWhot = card.shape === 'whot'
  const isSpecial = [1, 2, 5, 8, 14].includes(card.number)

  return (
    <motion.div
      whileHover={onClick && !disabled ? { y: -8, scale: 1.05 } : {}}
      whileTap={onClick && !disabled ? { scale: 0.95 } : {}}
      onClick={!disabled ? onClick : undefined}
      className={`${sizeClasses[size]} bg-white rounded-lg border-2 flex flex-col items-center justify-center relative overflow-hidden card-shadow ${
        selected ? 'ring-2 ring-yellow-400 -translate-y-3' : ''
      } ${disabled ? 'opacity-50' : ''} ${onClick && !disabled ? 'cursor-pointer' : ''}`}
      style={{ borderColor: isWhot ? '#f1c40f' : color }}
    >
      {/* Corner number */}
      <div className={`absolute top-0.5 left-1 font-bold ${textSizes[size]}`} style={{ color }}>
        {getCardShortLabel(card)}
      </div>
      <div className={`absolute bottom-0.5 right-1 font-bold ${textSizes[size]} rotate-180`} style={{ color }}>
        {getCardShortLabel(card)}
      </div>

      {/* Center shape */}
      <div className="flex-1 flex items-center justify-center">
        {isWhot ? (
          <div className="text-center">
            <div className="text-yellow-500 font-extrabold text-lg">W</div>
            <div className="text-[8px] text-gray-500">WHOT</div>
          </div>
        ) : (
          <svg
            viewBox="0 0 24 24"
            className={`${size === 'sm' ? 'w-5 h-5' : size === 'md' ? 'w-7 h-7' : 'w-10 h-10'}`}
            fill="none"
            stroke={color}
            strokeWidth="2"
          >
            <path d={SHAPE_SVG[card.shape]} />
          </svg>
        )}
      </div>

      {/* Special card label */}
      {isSpecial && !isWhot && size !== 'sm' && (
        <div className={`absolute bottom-4 text-[8px] font-medium px-1 rounded`} style={{ color, backgroundColor: `${color}15` }}>
          {card.number === 1 && 'HOLD'}
          {card.number === 2 && 'PICK 2'}
          {card.number === 5 && 'PICK 3'}
          {card.number === 8 && 'SKIP'}
          {card.number === 14 && 'GENERAL'}
        </div>
      )}
    </motion.div>
  )
}

function GameTable() {
  const { players, playerName, setScreen } = useGameStore()
  const [engineState, setEngineState] = useState(() =>
    GameEngine.createInitialState(players.map(p => p.name))
  )
  const [selectedCards, setSelectedCards] = useState<string[]>([])
  const [showShapePicker, setShowShapePicker] = useState(false)
  const [lastCardPressed, setLastCardPressed] = useState(false)
  const [catchMode, setCatchMode] = useState(false)
  const [showRules, setShowRules] = useState(false)
  const [soundOn, setSoundOn] = useState(true)
  const [gameMessage, setGameMessage] = useState('')

  const currentPlayer = GameEngine.getCurrentPlayer(engineState)
  const topCard = GameEngine.getTopCard(engineState)
  const myPlayer = engineState.players.find(p => p.name === playerName)
  const myHand = myPlayer?.hand || []
  const isMyTurn = currentPlayer?.name === playerName

  // Show game messages
  const showMessage = useCallback((msg: string) => {
    setGameMessage(msg)
    setTimeout(() => setGameMessage(''), 2000)
  }, [])

  const handlePlayCard = (cardId: string) => {
    if (!isMyTurn || !myPlayer) return

    const card = myHand.find(c => c.id === cardId)
    if (!card || !topCard) return

    const canPlay = canPlayCard(card, topCard, engineState.requestedShape)
    if (!canPlay) return

    // If Whot, show shape picker
    if (card.shape === 'whot') {
      setSelectedCards([cardId])
      setShowShapePicker(true)
      return
    }

    // Play the card
    const newState = GameEngine.playCard(engineState, [cardId])
    setEngineState(newState)
    setSelectedCards([])

    // Check for special effects
    if (card.number === 1) showMessage('Hold On! Play again!')
    if (card.number === 2) showMessage('Pick Two!')
    if (card.number === 5) showMessage('Pick Three!')
    if (card.number === 8) showMessage('Suspended!')
    if (card.number === 14) showMessage('General Market!')

    // Check if round over
    if (newState.phase === 'roundOver') {
      showMessage('Check Up!')
    }
  }

  const handleShapeSelect = (shape: Shape) => {
    if (selectedCards.length === 0) return
    const newState = GameEngine.playCard(engineState, selectedCards, shape)
    setEngineState(newState)
    setSelectedCards([])
    setShowShapePicker(false)
    showMessage(`Shape: ${SHAPE_NAMES[shape]}!`)
  }

  const handleMarket = () => {
    if (!isMyTurn) return
    const newState = GameEngine.drawCard(engineState)
    setEngineState(newState)
    showMessage('Went to market!')
  }

  const handleLastCard = () => {
    if (!isMyTurn || myHand.length !== 1) return
    setLastCardPressed(true)
    const newState = GameEngine.announceLastCard(engineState)
    setEngineState(newState)
    showMessage('LAST CARD!')

    // Reset after a delay
    setTimeout(() => setLastCardPressed(false), 2000)
  }

  // Bot turns (simplified)
  useEffect(() => {
    if (!currentPlayer || currentPlayer.name === playerName) return

    const timer = setTimeout(() => {
      // Simple bot: play first valid card, or go to market
      const botPlayer = currentPlayer
      const botHand = botPlayer.hand
      const botTopCard = GameEngine.getTopCard(engineState)

      if (botTopCard) {
        const validCard = botHand.find(c => canPlayCard(c, botTopCard, engineState.requestedShape))
        if (validCard) {
          if (validCard.shape === 'whot') {
            const shapes: Shape[] = ['circle', 'triangle', 'cross', 'square', 'star']
            const randomShape = shapes[Math.floor(Math.random() * shapes.length)]
            setEngineState(prev => GameEngine.playCard(prev, [validCard.id], randomShape))
          } else {
            setEngineState(prev => GameEngine.playCard(prev, [validCard.id]))
          }
        } else {
          setEngineState(prev => GameEngine.drawCard(prev))
        }
      }
    }, 1500)

    return () => clearTimeout(timer)
  }, [currentPlayer, engineState])

  // Reconnect / new game
  const handleRematch = () => {
    const newState = GameEngine.createInitialState(players.map(p => p.name))
    setEngineState(newState)
    setSelectedCards([])
    setShowShapePicker(false)
    setLastCardPressed(false)
    setCatchMode(false)
  }

  return (
    <div className="h-full w-full flex flex-col relative pb-[env(safe-area-inset-bottom)]">
      {/* Top bar */}
      <div className="flex items-center justify-between p-3 border-b border-white/10 z-20 shrink-0">
        <div className="flex items-center gap-2">
          <button onClick={() => setScreen('landing')} className="text-white/60 hover:text-white">
            <LogOut size={20} />
          </button>
          <span className="text-sm text-white/40">Room: {players[0]?.name}'s Game</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setSoundOn(!soundOn)} className="text-white/60 hover:text-white">
            {soundOn ? <Volume2 size={18} /> : <VolumeX size={18} />}
          </button>
          <button onClick={() => setShowRules(!showRules)} className="text-white/60 hover:text-white">
            <HelpCircle size={18} />
          </button>
        </div>
      </div>

      {/* Opponents */}
      <div className="flex justify-center gap-2 px-2 pt-2 pb-1 shrink-0">
        {engineState.players.filter(p => p.name !== playerName).map((player) => (
          <div
            key={player.id}
            className={`flex flex-col items-center p-2 rounded-xl transition-colors ${
              player.id === currentPlayer?.id ? 'bg-yellow-400/20 ring-1 ring-yellow-400/50' : 'bg-white/5'
            }`}
          >
            <div className="relative">
              <img
                src={`https://api.dicebear.com/7.x/notionists/svg?seed=${player.name}`}
                alt={player.name}
                className="w-10 h-10 rounded-full bg-white/10"
              />
              {player.id === currentPlayer?.id && (
                <div className="absolute -top-1 -right-1 w-4 h-4 bg-yellow-400 rounded-full flex items-center justify-center">
                  <div className="w-2 h-2 bg-felt-dark rounded-full animate-pulse" />
                </div>
              )}
            </div>
            <span className="text-[10px] text-white/70 mt-1 truncate max-w-[60px]">{player.name}</span>
            <div className="flex items-center gap-0.5">
              {[...Array(Math.min(player.hand.length, 8))].map((_, j) => (
                <div key={j} className="w-1.5 h-2 bg-white/40 rounded-sm" />
              ))}
              {player.hand.length > 8 && (
                <span className="text-[8px] text-white/40">+{player.hand.length - 8}</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Game area */}
      <div className="flex-1 flex flex-col items-center justify-center relative min-h-0 overflow-hidden">
        {/* Round over overlay */}
        <AnimatePresence>
          {engineState.phase === 'roundOver' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="absolute inset-0 bg-black/70 z-30 flex flex-col items-center justify-center"
            >
              <motion.div
                initial={{ scale: 0.5 }}
                animate={{ scale: 1 }}
                className="text-center"
              >
                <div className="text-4xl font-extrabold text-yellow-400 mb-4">Check Up! 🎉</div>
                <div className="text-white mb-6">
                  {currentPlayer?.name} wins the round!
                </div>
                <div className="flex gap-3">
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={handleRematch}
                    className="px-6 py-3 bg-yellow-400 text-felt-dark font-bold rounded-xl"
                  >
                    Next Round
                  </motion.button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Requested shape indicator */}
        {engineState.requestedShape && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute top-4 bg-white rounded-full px-4 py-2 shadow-lg z-10 flex items-center gap-2"
          >
            <span className="text-felt-dark font-bold text-sm">Shape Requested:</span>
            <div className="w-6 h-6 rounded-full" style={{ backgroundColor: SHAPE_COLORS[engineState.requestedShape] }} />
            <span className="text-felt-dark font-bold">{SHAPE_NAMES[engineState.requestedShape]}</span>
          </motion.div>
        )}

        {/* Table center */}
        <div className="flex items-center gap-6">
          {/* Market pile */}
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={handleMarket}
            disabled={!isMyTurn}
            className="relative"
          >
            <div className="w-16 h-22 bg-gradient-to-br from-blue-800 to-blue-950 rounded-lg border-2 border-white/30 card-shadow flex items-center justify-center">
              <div className="text-white/30 font-bold text-2xl">{engineState.market.length}</div>
            </div>
            <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-white/40 text-xs">Market</div>
          </motion.button>

          {/* Play pile */}
          <div className="relative w-20 h-28">
            {topCard && (
              <motion.div
                key={topCard.id}
                initial={{ scale: 1.2, opacity: 0, x: -50 }}
                animate={{ scale: 1, opacity: 1, x: 0 }}
                transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              >
                <WhotCard card={topCard} size="lg" />
              </motion.div>
            )}
          </div>
        </div>

        {/* Turn indicator */}
        <div className={`mt-6 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
          isMyTurn ? 'bg-yellow-400/20 text-yellow-300' : 'bg-white/10 text-white/50'
        }`}>
          {isMyTurn ? 'Your turn! Play a card or go to market' : `Waiting for ${currentPlayer?.name}...`}
        </div>

        {/* Pending pick indicator */}
        {engineState.pendingPick && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="mt-2 px-4 py-1.5 bg-red-500/20 text-red-300 rounded-full text-xs font-bold"
          >
            PICK {engineState.pendingPick.amount}!
          </motion.div>
        )}
      </div>

      {/* Action bar */}
      <div className="flex items-center justify-center gap-3 px-4 py-2 shrink-0">
        {isMyTurn && myHand.length === 1 && !lastCardPressed && (
          <motion.button
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            whileTap={{ scale: 0.9 }}
            onClick={handleLastCard}
            className="px-4 py-2 bg-yellow-500 text-felt-dark font-bold rounded-full animate-pulse"
          >
            LAST CARD! ⚡
          </motion.button>
        )}

        {!isMyTurn && (
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => setCatchMode(!catchMode)}
            className="px-4 py-2 bg-red-500/20 text-red-300 font-bold rounded-full"
          >
            CATCH! 👀
          </motion.button>
        )}
      </div>

      {/* Player hand */}
      <div className="px-4 pb-safe shrink-0">
        <div className="flex items-end justify-center gap-1 overflow-x-auto pb-2 scrollbar-hide"
        >
          <AnimatePresence>
            {myHand.map((card, index) => {
              const canPlay = topCard ? canPlayCard(card, topCard, engineState.requestedShape) : true
              const isSelected = selectedCards.includes(card.id)

              return (
                <motion.div
                  key={card.id}
                  layout
                  initial={{ opacity: 0, y: 50 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -50, scale: 0.8 }}
                  transition={{ delay: index * 0.05 }}
                  className="flex-shrink-0"
                  style={{ marginLeft: index > 0 ? '-28px' : '0' }}
                >
                  <WhotCard
                    card={card}
                    size="md"
                    selected={isSelected}
                    onClick={() => handlePlayCard(card.id)}
                    disabled={!isMyTurn || !canPlay}
                  />
                </motion.div>
              )
            })}
          </AnimatePresence>
        </div>
      </div>

      {/* Shape picker modal */}
      <AnimatePresence>
        {showShapePicker && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60 z-40 flex items-center justify-center"
            onClick={() => setShowShapePicker(false)}
          >
            <motion.div
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              className="bg-felt-dark rounded-2xl p-6 border border-white/20"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-white font-bold text-center mb-4">Choose a Shape</h3>
              <div className="grid grid-cols-3 gap-3">
                {(['circle', 'triangle', 'cross', 'square', 'star'] as Shape[]).map((shape) => (
                  <motion.button
                    key={shape}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => handleShapeSelect(shape)}
                    className="flex flex-col items-center gap-2 p-4 bg-white/10 rounded-xl hover:bg-white/20 transition-colors"
                  >
                    <div
                      className="w-10 h-10 rounded-full"
                      style={{ backgroundColor: SHAPE_COLORS[shape] }}
                    />
                    <span className="text-white text-sm">{SHAPE_NAMES[shape]}</span>
                  </motion.button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Game message toast */}
      <AnimatePresence>
        {gameMessage && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="absolute top-16 left-1/2 -translate-x-1/2 bg-felt-dark/90 text-yellow-400 px-6 py-3 rounded-full font-bold text-lg border border-yellow-400/30 z-50"
          >
            {gameMessage}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default GameTable
