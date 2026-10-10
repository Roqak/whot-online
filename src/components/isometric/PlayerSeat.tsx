import { motion } from 'framer-motion'
import IsometricCard from './IsometricCard'

interface SeatProps {
  player: string
  position: { x: number; y: number; z: number; angle: number }
  cards: any[]
  isCurrent: boolean
  isHuman: boolean
  selectedCard: string | null
  onSelectCard: (id: string | null) => void
}

export default function PlayerSeat({ 
  player, position, cards, isCurrent, isHuman, selectedCard, onSelectCard 
}: SeatProps) {
  
  const spreadAngle = isHuman ? 0 : position.angle
  
  return (
    <motion.div
      className="absolute"
      style={{
        left: position.x,
        top: position.y,
        zIndex: position.z,
        transform: `translateZ(${position.z}px)`
      }}
    >
      {/* Player name tag */}
      <div 
        className="absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap px-3 py-1 rounded-full text-xs font-bold"
        style={{
          background: isCurrent ? '#e94560' : 'rgba(255,255,255,.1)',
          color: '#fff',
          boxShadow: isCurrent ? '0 0 12px #e9456080' : 'none'
        }}
      >
        {player} ({cards.length})
        {isCurrent && ' ⏱️'}
      </div>
      
      {/* Cards fan */}
      <div 
        className="relative"
        style={{
          width: '200px',
          height: '120px',
          transform: `rotate(${spreadAngle}deg)`,
          transformOrigin: 'center center'
        }}
      >
        {cards.map((card, i) => {
          const offset = i - cards.length / 2
          const cardAngle = offset * 15
          const cardY = Math.abs(offset) * 5
          
          return (
            <motion.div
              key={card.id}
              className="absolute cursor-pointer transition-all"
              style={{
                left: '50%',
                top: `${cardY}px`,
                transform: `translateX(-50%) rotate(${cardAngle}deg) translateZ(${i * 2}px)`,
                transformOrigin: 'bottom center',
                zIndex: selectedCard === card.id ? 50 : i
              }}
              whileHover={isHuman ? { y: -10, scale: 1.1 } : {}}
              onClick={() => {
                if(isHuman) {
                  onSelectCard(selectedCard === card.id ? null : card.id)
                }
              }}
              animate={selectedCard === card.id ? {
                y: -20,
                scale: 1.15,
                zIndex: 100
              } : {}}
            >
              <IsometricCard card={card} />
            </motion.div>
          )
        })}
      </div>
    </motion.div>
  )
}
