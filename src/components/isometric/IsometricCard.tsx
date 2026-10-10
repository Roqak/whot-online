interface CardProps {
  card: {
    suit: string
    value: number
    faceUp: boolean
  }
}

const COLORS: Record<string, string> = {
  circle: '#e74c3c',
  square: '#3498db',
  cross: '#2ecc71',
  star: '#f39c12',
  triangle: '#9b59b6'
}

const SUIT_SYMBOLS: Record<string, string> = {
  circle: '●',
  square: '■',
  cross: '✕',
  star: '★',
  triangle: '▲'
}

export default function IsometricCard({ card }: CardProps) {
  if (!card.faceUp) {
    return (
      <div
        className="rounded-lg border-2 border-gray-600 flex items-center justify-center"
        style={{
          width: '60px',
          height: '90px',
          background: 'linear-gradient(135deg, #2c3e50 0%, #1a252f 100%)',
          boxShadow: '0 4px 8px rgba(0,0,0,.3)',
        }}
      >
        <div className="text-2xl opacity-30">🎴</div>
      </div>
    )
  }

  const color = COLORS[card.suit] || '#999'
  const isWhot = card.value === 20

  return (
    <div
      className="rounded-lg border-2 flex flex-col items-center justify-center relative overflow-hidden"
      style={{
        width: '60px',
        height: '90px',
        background: 'linear-gradient(135deg, #fefefe 0%, #f0f0f0 100%)',
        borderColor: color,
        boxShadow: `0 4px 12px ${color}40`,
      }}
    >
      {/* Suit pattern background */}
      <div 
        className="absolute inset-0 opacity-5"
        style={{
          backgroundImage: `radial-gradient(${color} 2px, transparent 2px)`,
          backgroundSize: '8px 8px'
        }}
      />

      {/* Top-left value */}
      <div 
        className="absolute top-1 left-1.5 text-xs font-bold"
        style={{ color }}
      >
        {isWhot ? 'W' : card.value}
      </div>

      {/* Center suit */}
      <div 
        className="text-3xl font-bold"
        style={{ color }}
      >
        {isWhot ? '🔥' : SUIT_SYMBOLS[card.suit] || '?'}
      </div>

      {/* Bottom-right value (inverted) */}
      <div 
        className="absolute bottom-1 right-1.5 text-xs font-bold"
        style={{ 
          color,
          transform: 'rotate(180deg)'
        }}
      >
        {isWhot ? 'W' : card.value}
      </div>

      {/* Suit indicator bars */}
      <div className="absolute top-0 left-0 right-0 h-1 rounded-t-lg" style={{ background: color }} />
      <div className="absolute bottom-0 left-0 right-0 h-1 rounded-b-lg" style={{ background: color }} />
    </div>
  )
}
