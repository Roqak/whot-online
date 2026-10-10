import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import IsometricCard from './IsometricCard'
import PlayerSeat from './PlayerSeat'

const SUITS = ['circle', 'square', 'cross', 'star', 'triangle'] as const

interface IsoCard {
  id: string
  suit: string
  value: number
  x: number
  y: number
  z: number
  rotation: number
  faceUp: boolean
  owner?: string
}

// Generate a standard Whot deck (54 cards)
function generateDeck(): IsoCard[] {
  const cards: IsoCard[] = []
  let id = 0
  
  // Each suit has values 1-14, plus some 20s (Whot cards)
  SUITS.forEach(suit => {
    for(let v = 1; v <= 14; v++) {
      cards.push({
        id: `card-${id++}`,
        suit,
        value: v,
        x: 0, y: 0, z: 0,
        rotation: 0,
        faceUp: false
      })
    }
    // 2 Whot cards per suit (value 20)
    for(let w = 0; w < 2; w++) {
      cards.push({
        id: `card-${id++}`,
        suit,
        value: 20,
        x: 0, y: 0, z: 0,
        rotation: 0,
        faceUp: false
      })
    }
  })
  
  return cards
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for(let i = a.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export default function IsometricTable() {
  const [deck, setDeck] = useState<IsoCard[]>([])
  const [played, setPlayed] = useState<IsoCard[]>([])
  const [hands, setHands] = useState<Record<string, IsoCard[]>>({})
  const [currentPlayer, setCurrentPlayer] = useState(0)
  const [selectedCard, setSelectedCard] = useState<string | null>(null)
  const [gamePhase, setGamePhase] = useState<'dealing' | 'playing' | 'gameover'>('dealing')
  
  const players = ['You', 'Bot 1', 'Bot 2', 'Bot 3']
  const playerPositions = [
    { x: 400, y: 520, z: 80, angle: 0 },     // Bottom (You)
    { x: 120, y: 200, z: 80, angle: -60 },  // Left
    { x: 400, y: 80, z: 80, angle: 0 },     // Top
    { x: 680, y: 200, z: 80, angle: 60 },   // Right
  ]
  
  useEffect(() => {
    const d = shuffle(generateDeck())
    setDeck(d)
    
    // Deal 5 cards to each player
    const newHands: Record<string, IsoCard[]> = {}
    let deckIndex = 0
    players.forEach(p => {
      newHands[p] = d.slice(deckIndex, deckIndex + 5).map((c, i) => ({
        ...c,
        x: 0, y: i * 2, z: i,
        faceUp: p === 'You'
      }))
      deckIndex += 5
    })
    setHands(newHands)
    setDeck(d.slice(deckIndex))
    
    // Place first card on table
    const firstCard = d[deckIndex]
    if(firstCard) {
      setPlayed([{...firstCard, x: 400, y: 300, z: 0, faceUp: true, rotation: Math.random() * 20 - 10}])
      setDeck(d.slice(deckIndex + 1))
    }
    
    setTimeout(() => setGamePhase('playing'), 2000)
  }, [])
  
  function playCard(player: string, cardId: string) {
    if(gamePhase !== 'playing' || currentPlayer !== 0) return
    
    const card = hands[player]?.find(c => c.id === cardId)
    if(!card) return
    
    // Remove from hand
    setHands(prev => ({
      ...prev,
      [player]: prev[player].filter(c => c.id !== cardId)
    }))
    
    // Add to played with animation
    const newCard = {
      ...card,
      x: 400 + Math.random() * 40 - 20,
      y: 300 + Math.random() * 40 - 20,
      z: played.length + 1,
      faceUp: true,
      rotation: Math.random() * 30 - 15
    }
    setPlayed(prev => [...prev, newCard])
    setSelectedCard(null)
    
    // Next turn
    setCurrentPlayer(prev => (prev + 1) % 4)
  }
  
  function drawCard(player: string) {
    if(deck.length === 0) return
    const card = deck[0]
    setDeck(prev => prev.slice(1))
    setHands(prev => ({
      ...prev,
      [player]: [...prev[player], {...card, faceUp: player === 'You'}]
    }))
    setCurrentPlayer(prev => (prev + 1) % 4)
  }
  
  return (
    <div className="w-full h-full bg-gradient-to-b from-[#1a1a2e] to-[#16213e] overflow-hidden relative">
      {/* UI Header */}
      <div className="absolute top-0 left-0 right-0 h-14 flex items-center justify-between px-6 z-50">
        <div className="text-white font-bold text-lg">🔥 Whot Isometric</div>
        <div className="flex gap-6 text-sm">
          <div className="text-yellow-400">Turn: {players[currentPlayer]}</div>
          <div className="text-gray-400">Deck: {deck.length}</div>
        </div>
      </div>
      
      {/* Isometric Scene */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div 
          className="relative"
          style={{
            width: '900px',
            height: '700px',
            transform: 'rotateX(55deg) rotateZ(45deg)',
            transformStyle: 'preserve-3d'
          }}
        >
          {/* Table surface */}
          <div 
            className="absolute rounded-2xl shadow-2xl"
            style={{
              width: '700px',
              height: '500px',
              left: '100px',
              top: '100px',
              background: 'linear-gradient(135deg, #2d5a3d 0%, #1e3d2a 100%)',
              boxShadow: '0 20px 60px rgba(0,0,0,.5), inset 0 0 80px rgba(0,0,0,.3)',
              transform: 'translateZ(-10px)'
            }}
          >
            {/* Felt texture pattern */}
            <div 
              className="absolute inset-4 rounded-xl opacity-20"
              style={{
                backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 20px, rgba(255,255,255,.1) 20px, rgba(255,255,255,.1) 21px)',
              }}
            />
          </div>
          
          {/* Played cards pile */}
          <AnimatePresence>
            {played.map((card) => (
              <motion.div
                key={card.id}
                initial={{ opacity: 0, z: 100 }}
                animate={{ opacity: 1, z: card.z }}
                className="absolute"
                style={{
                  left: card.x,
                  top: card.y,
                  zIndex: card.z,
                  transform: `translateZ(${card.z}px) rotate(${card.rotation}deg)`
                }}
              >
                <IsometricCard card={card} />
              </motion.div>
            ))}
          </AnimatePresence>
          
          {/* Deck pile */}
          {deck.length > 0 && (
            <div 
              className="absolute cursor-pointer hover:brightness-110 transition-all"
              style={{
                left: '620px',
                top: '320px',
                transform: 'translateZ(2px)'
              }}
              onClick={() => currentPlayer === 0 && drawCard('You')}
            >
              <div className="relative">
                {/* Stack of cards */}
                {[...Array(Math.min(5, Math.floor(deck.length / 10)))].map((_, i) => (
                  <div 
                    key={i}
                    className="absolute rounded-lg border-2 border-gray-600"
                    style={{
                      width: '60px',
                      height: '90px',
                      background: 'linear-gradient(135deg, #2c3e50 0%, #1a252f 100%)',
                      transform: `translateZ(${i * 2}px)`,
                      left: `${i * 3}px`,
                      top: `${i * -2}px`,
                    }}
                  >
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="text-2xl opacity-30">🎴</div>
                    </div>
                  </div>
                ))}
                <div className="absolute -bottom-8 left-0 text-white text-xs whitespace-nowrap">
                  {deck.length} cards
                </div>
              </div>
            </div>
          )}
          
          {/* Player seats */}
          {players.map((player, i) => (
            <PlayerSeat
              key={player}
              player={player}
              position={playerPositions[i]}
              cards={hands[player] || []}
              isCurrent={currentPlayer === i}
              isHuman={player === 'You'}
              selectedCard={selectedCard}
              onSelectCard={setSelectedCard}
              />
          ))}
          
        </div>
      </div>
      
      {/* Controls for human player */}
      {currentPlayer === 0 && gamePhase === 'playing' && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-3 z-50">
          <button
            onClick={() => selectedCard && playCard('You', selectedCard)}
            disabled={!selectedCard}
            className="px-6 py-3 bg-red-500 text-white rounded-lg font-bold disabled:opacity-30 disabled:cursor-not-allowed hover:bg-red-600 transition-colors"
          >
            Play Card
          </button>
          <button
            onClick={() => drawCard('You')}
            className="px-6 py-3 bg-blue-500 text-white rounded-lg font-bold hover:bg-blue-600 transition-colors"
          >
            Draw from Deck
          </button>
        </div>
      )}
      
    </div>
  )
}
